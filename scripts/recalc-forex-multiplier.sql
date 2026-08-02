-- One-off backfill: reprice forex trades that were valued at ×1.
--
-- WHY
-- `assetMultiplier()` returned 1 for forex while the trade editor used the
-- standard-lot contract size (100,000). Trades that entered through CSV import
-- therefore have a P&L 100,000× too small. Manually entered and edited trades
-- were already correct and carry `extra.contractMultiplier = 100000`.
--
-- WHAT IT TOUCHES
-- Only rows where ALL of these hold:
--   * asset_class = 'forex'
--   * a closed round trip (exit price + exit quantity + a stored net P&L)
--   * the stored multiplier is absent, 0 or 1 — i.e. never priced in lots
--   * the stored net P&L equals what our own ×1 formula produces
--
-- That last condition is the important one. When the broker's CSV carried its
-- own P&L column we stored that value verbatim, already in account currency —
-- multiplying it by 100,000 would destroy it. A broker-supplied figure will not
-- match our formula, so those rows are left alone.
--
-- HOW TO RUN
--   1. Take a backup (step 0) — it is three seconds and makes step 4 possible.
--   2. Run step 1 and read the numbers. If `would_update` is 0, stop: nothing
--      to do.
--   3. Run step 2 and eyeball a few rows. before_net_pnl × 100,000 should be a
--      plausible P&L for the position size.
--   4. Run step 3.
--   5. Run step 5 to confirm, and only then drop the backup table.
--
-- Set the guard below to a single user id while testing, then to NULL for the
-- real run.

\set target_user NULL   -- e.g. '''user_2abc...''' to limit the run to one user

-- ─── Shared definition of what is in scope ───────────────────────────────────
-- Recreated in each step so every statement can be run on its own.

CREATE OR REPLACE VIEW forex_repricing_candidates AS
SELECT
  t.id,
  t.user_id,
  t.account_id,
  t.symbol,
  t.direction,
  t.entry_datetime,
  COALESCE(t.fees, 0)                                     AS fees,
  t.gross_pnl                                             AS before_gross_pnl,
  t.net_pnl                                               AS before_net_pnl,
  (t.extra ->> 'contractMultiplier')                      AS stored_multiplier,
  -- The gross our own formula produces at multiplier 1.
  CASE WHEN t.direction = 'long'
       THEN (t.exit_price - t.entry_price)
       ELSE (t.entry_price - t.exit_price)
  END * LEAST(t.entry_quantity, t.exit_quantity)          AS gross_at_1
FROM trades t
WHERE t.asset_class = 'forex'
  AND t.exit_price IS NOT NULL
  AND t.exit_quantity IS NOT NULL
  AND t.net_pnl IS NOT NULL
  AND COALESCE((t.extra ->> 'contractMultiplier')::numeric, 1) <= 1;

-- ─── 0. Backup ───────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS trades_forex_backup_0_5_0;
CREATE TABLE trades_forex_backup_0_5_0 AS
SELECT id, gross_pnl, net_pnl, extra, updated_at
FROM trades
WHERE id IN (SELECT id FROM forex_repricing_candidates);

SELECT count(*) AS rows_backed_up FROM trades_forex_backup_0_5_0;

-- ─── 1. Dry run — how much is in scope, and what is deliberately skipped ─────

SELECT
  count(*)                                                            AS forex_candidates,
  count(*) FILTER (WHERE abs(before_net_pnl - (gross_at_1 - fees)) <= 1e-6) AS would_update,
  count(*) FILTER (WHERE abs(before_net_pnl - (gross_at_1 - fees)) >  1e-6) AS skipped_broker_supplied_pnl,
  count(DISTINCT user_id)                                             AS users_affected
FROM forex_repricing_candidates
WHERE (:target_user IS NULL OR user_id = :target_user);

-- ─── 2. Sample the rows that would change ────────────────────────────────────

SELECT
  symbol,
  direction,
  entry_datetime,
  before_net_pnl,
  round(gross_at_1 * 100000 - fees, 2) AS after_net_pnl,
  stored_multiplier
FROM forex_repricing_candidates
WHERE abs(before_net_pnl - (gross_at_1 - fees)) <= 1e-6
  AND (:target_user IS NULL OR user_id = :target_user)
ORDER BY entry_datetime DESC
LIMIT 25;

-- ─── 3. The update ───────────────────────────────────────────────────────────
-- Also writes the multiplier into `extra`, because the sidebar, R-multiple,
-- notional P&L% and the breakeven filter all read it from there and would
-- otherwise keep valuing the trade at 1.

BEGIN;

UPDATE trades t
SET
  gross_pnl  = round(c.gross_at_1 * 100000, 8),
  net_pnl    = round(c.gross_at_1 * 100000 - c.fees, 8),
  extra      = COALESCE(t.extra, '{}'::jsonb) || jsonb_build_object('contractMultiplier', 100000),
  updated_at = now()
FROM forex_repricing_candidates c
WHERE t.id = c.id
  AND abs(c.before_net_pnl - (c.gross_at_1 - c.fees)) <= 1e-6
  AND (:target_user IS NULL OR c.user_id = :target_user);

-- Read the row count. If it does not match `would_update` from step 1, ROLLBACK.
COMMIT;

-- ─── 4. Undo, if step 5 looks wrong ──────────────────────────────────────────
-- UPDATE trades t
-- SET gross_pnl = b.gross_pnl, net_pnl = b.net_pnl, extra = b.extra, updated_at = b.updated_at
-- FROM trades_forex_backup_0_5_0 b
-- WHERE t.id = b.id;

-- ─── 5. Verify ───────────────────────────────────────────────────────────────

SELECT
  count(*)                                                         AS forex_closed,
  count(*) FILTER (WHERE (extra ->> 'contractMultiplier') = '100000') AS priced_in_lots,
  count(*) FILTER (WHERE COALESCE((extra ->> 'contractMultiplier')::numeric, 1) <= 1) AS still_at_1
FROM trades
WHERE asset_class = 'forex' AND net_pnl IS NOT NULL;

-- Expected: still_at_1 equals `skipped_broker_supplied_pnl` from step 1 —
-- those are the trades whose P&L the broker gave us and we must not touch.

-- ─── 6. Clean up, once you are happy ─────────────────────────────────────────
-- DROP VIEW forex_repricing_candidates;
-- DROP TABLE trades_forex_backup_0_5_0;
