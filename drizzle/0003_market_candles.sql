-- Global, cross-user market candle cache.
-- Candles for a continuous contract root at a given interval are identical for
-- every user, so one fetched range serves any user's trade in that window.
-- Idempotent: safe to run on a fresh or existing database.

CREATE TABLE IF NOT EXISTS "market_candles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "symbol_root" text NOT NULL,
  "interval_sec" integer NOT NULL,
  "from_sec" integer NOT NULL,
  "to_sec" integer NOT NULL,
  "candles" jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "market_candles_root_interval_uniq"
  ON "market_candles" ("symbol_root", "interval_sec");
