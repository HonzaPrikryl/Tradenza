import {
  pgTable,
  text,
  numeric,
  integer,
  real,
  timestamp,
  pgEnum,
  uuid,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const directionEnum = pgEnum('direction', ['long', 'short'])
export const statusEnum = pgEnum('status', ['open', 'closed', 'cancelled'])
export const assetClassEnum = pgEnum('asset_class', ['stocks', 'futures', 'forex', 'crypto', 'options', 'other'])

// ─── Users ────────────────────────────────────────────────────────────────────
// Lightweight registry of the app's users. Auth stays owned by Clerk (the source
// of truth for identity); this table is a synced mirror kept up to date by the
// Clerk webhook (`user.created` / `user.updated` upsert, `user.deleted` remove).
// Its purpose is purely operational: a single place to answer "how many users do
// we have?" straight from the DB, including users who signed up but created no
// data yet. `id` holds the Clerk user ID — the same value stored as `user_id` on
// every other table.
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  email: text('email'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  username: text('username'),
  onboardingDismissedAt: timestamp('onboarding_dismissed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),

    name: text('name').notNull(), // "Lucid 50k | Step1"
    firm: text('firm'), // "FTMO", "Lucid"…
    broker: text('broker'), // broker id from lib/brokers.ts ('rithmic', 'generic'…)
    timezone: text('timezone'),
    accountSize: numeric('account_size', { precision: 18, scale: 2 }),
    phase: text('phase'), // "Step1", "Funded"…
    startingBalance: numeric('starting_balance', { precision: 18, scale: 2 }),
    currency: text('currency').notNull().default('USD'),

    isDefault: boolean('is_default').notNull().default(false),
    archived: boolean('archived').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('accounts_user_id_idx').on(t.userId),
  }),
)

// ─── Trades ───────────────────────────────────────────────────────────────────

export const trades = pgTable(
  'trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(), // Clerk user ID

    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),

    symbol: text('symbol').notNull(),
    direction: directionEnum('direction').notNull(),
    status: statusEnum('status').notNull().default('closed'),
    assetClass: assetClassEnum('asset_class').notNull().default('stocks'),

    // Entry
    entryPrice: numeric('entry_price', { precision: 18, scale: 8 }).notNull(),
    entryQuantity: numeric('entry_quantity', { precision: 18, scale: 8 }).notNull(),
    entryDatetime: timestamp('entry_datetime', { withTimezone: true }).notNull(),

    exitPrice: numeric('exit_price', { precision: 18, scale: 8 }),
    exitQuantity: numeric('exit_quantity', { precision: 18, scale: 8 }),
    exitDatetime: timestamp('exit_datetime', { withTimezone: true }),

    // Fees
    fees: numeric('fees', { precision: 18, scale: 8 }).default('0'),

    grossPnl: numeric('gross_pnl', { precision: 18, scale: 8 }),
    netPnl: numeric('net_pnl', { precision: 18, scale: 8 }),

    // Risk management
    stopLoss: numeric('stop_loss', { precision: 18, scale: 8 }),
    takeProfit: numeric('take_profit', { precision: 18, scale: 8 }),
    riskRewardRatio: numeric('risk_reward_ratio', { precision: 8, scale: 4 }),
    riskAmount: numeric('risk_amount', { precision: 18, scale: 8 }),

    // Journaling
    setupName: text('setup_name'),
    notes: text('notes'),
    rating: real('rating'),
    emotionBefore: text('emotion_before'),
    emotionAfter: text('emotion_after'),
    mistakes: text('mistakes'),
    lessons: text('lessons'),

    // Metadata
    importSource: text('import_source'), // 'manual', 'csv'
    externalId: text('external_id'),
    extra: jsonb('extra'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('trades_user_id_idx').on(t.userId),
    symbolIdx: index('trades_symbol_idx').on(t.symbol),
    entryDatetimeIdx: index('trades_entry_datetime_idx').on(t.entryDatetime),
    accountIdIdx: index('trades_account_id_idx').on(t.accountId),
    // Composite index for deduplication
    externalIdIdx: index('trades_external_id_idx').on(t.userId, t.externalId),
  }),
)

export const tagGroups = pgTable('tag_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(), // "Setup type"
  color: text('color').notNull().default('#6366f1'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  groupId: uuid('group_id').references(() => tagGroups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // "True breakout"
  color: text('color').notNull().default('#6366f1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const tradeTags = pgTable('trade_tags', {
  tradeId: uuid('trade_id')
    .notNull()
    .references(() => trades.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
})

// ─── Screenshots ──────────────────────────────────────────────────────────────

export const screenshots = pgTable('screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  tradeId: uuid('trade_id')
    .notNull()
    .references(() => trades.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  url: text('url').notNull(), // R2 URL
  label: text('label'), // 'entry', 'exit', 'setup', ...
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Candle cache (OHLC data for the trade detail chart) ──────────────────────

export const candleCache = pgTable('candle_cache', {
  tradeId: uuid('trade_id')
    .primaryKey()
    .references(() => trades.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  intervalSec: integer('interval_sec').notNull(),
  candles: jsonb('candles').notNull(), // [{ t, o, h, l, c, v }]
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Global market candle cache ───────────────────────────────────────────────
// Shared across ALL users (not per trade): candles for a continuous contract root
// at a given interval are identical for everyone, so one fetched range serves any
// user's trade in that window. `fromSec`/`toSec` track the time span already
// requested from the data provider; the candle list is the merged, deduped result.
export const marketCandles = pgTable(
  'market_candles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbolRoot: text('symbol_root').notNull(), // continuous root, e.g. "ES", "NQ"
    intervalSec: integer('interval_sec').notNull(),
    fromSec: integer('from_sec').notNull(), // covered span start (unix s)
    toSec: integer('to_sec').notNull(), // covered span end (unix s)
    candles: jsonb('candles').notNull(), // sorted, deduped [{ t, o, h, l, c, v }]
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    rootIntervalUniq: uniqueIndex('market_candles_root_interval_uniq').on(t.symbolRoot, t.intervalSec),
  }),
)

// ─── Import logs ──────────────────────────────────────────────────────────────

export const importLogs = pgTable('import_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  source: text('source').notNull(), // 'generic_csv'
  totalRows: integer('total_rows').notNull(),
  importedRows: integer('imported_rows').notNull(),
  skippedRows: integer('skipped_rows').notNull().default(0),
  errorRows: integer('error_rows').notNull().default(0),
  errors: jsonb('errors'),
  tradeIds: jsonb('trade_ids'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const dashboardTemplates = pgTable(
  'dashboard_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),

    name: text('name').notNull(), // "Default", "Scalping"…
    isDefault: boolean('is_default').notNull().default(false),
    isPreset: boolean('is_preset').notNull().default(false),

    // { top: WidgetInstance[]; main: WidgetInstance[] }
    layout: jsonb('layout').notNull(),

    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('dashboard_templates_user_id_idx').on(t.userId),
  }),
)

export const progressRules = pgTable(
  'progress_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),

    name: text('name').notNull(), // "No revenge trading"
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true), // paused (false) vs running (true)
    // ISO weekdays (1=Mon … 7=Sun) on which the rule applies. Default: every day.
    // Schedule changes apply retroactively — off-days are simply out of scope.
    activeDays: integer('active_days')
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5,6,7}'::integer[]`),
    // Soft-delete / effective-end. When set, the rule no longer applies from this
    // moment on, but it still counts toward the days it was in effect (history is
    // preserved). null = live rule.
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('progress_rules_user_id_idx').on(t.userId),
  }),
)

export const ruleCompletions = pgTable(
  'rule_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => progressRules.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index('rule_completions_user_date_idx').on(t.userId, t.date),
    ruleDateUniq: uniqueIndex('rule_completions_rule_date_uniq').on(t.ruleId, t.date),
  }),
)

export const dailyCheckins = pgTable(
  'daily_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    date: text('date').notNull(), // 'yyyy-MM-dd'
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateUniq: uniqueIndex('daily_checkins_user_date_uniq').on(t.userId, t.date),
  }),
)

// ─── Relations ────────────────────────────────────────────────────────────────

export const tradesRelations = relations(trades, ({ many, one }) => ({
  tradeTags: many(tradeTags),
  screenshots: many(screenshots),
  account: one(accounts, { fields: [trades.accountId], references: [accounts.id] }),
}))

export const accountsRelations = relations(accounts, ({ many }) => ({
  trades: many(trades),
}))

export const tagGroupsRelations = relations(tagGroups, ({ many }) => ({
  tags: many(tags),
}))

export const tagsRelations = relations(tags, ({ many, one }) => ({
  tradeTags: many(tradeTags),
  group: one(tagGroups, { fields: [tags.groupId], references: [tagGroups.id] }),
}))

export const tradeTagsRelations = relations(tradeTags, ({ one }) => ({
  trade: one(trades, { fields: [tradeTags.tradeId], references: [trades.id] }),
  tag: one(tags, { fields: [tradeTags.tagId], references: [tags.id] }),
}))

export const screenshotsRelations = relations(screenshots, ({ one }) => ({
  trade: one(trades, { fields: [screenshots.tradeId], references: [trades.id] }),
}))

export const progressRulesRelations = relations(progressRules, ({ many }) => ({
  completions: many(ruleCompletions),
}))

export const ruleCompletionsRelations = relations(ruleCompletions, ({ one }) => ({
  rule: one(progressRules, { fields: [ruleCompletions.ruleId], references: [progressRules.id] }),
}))

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Trade = typeof trades.$inferSelect
export type NewTrade = typeof trades.$inferInsert
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Tag = typeof tags.$inferSelect
export type TagGroup = typeof tagGroups.$inferSelect
export type Screenshot = typeof screenshots.$inferSelect
export type ImportLog = typeof importLogs.$inferSelect
export type DashboardTemplate = typeof dashboardTemplates.$inferSelect
export type NewDashboardTemplate = typeof dashboardTemplates.$inferInsert
export type ProgressRule = typeof progressRules.$inferSelect
export type NewProgressRule = typeof progressRules.$inferInsert
export type RuleCompletion = typeof ruleCompletions.$inferSelect
export type DailyCheckin = typeof dailyCheckins.$inferSelect
export type MarketCandles = typeof marketCandles.$inferSelect
