CREATE TABLE "market_candle_chunks" (
	"feed_key" text NOT NULL,
	"interval_sec" integer NOT NULL,
	"chunk_start" integer NOT NULL,
	"candles" jsonb NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_candle_chunks_feed_key_interval_sec_chunk_start_pk" PRIMARY KEY("feed_key","interval_sec","chunk_start")
);
--> statement-breakpoint
CREATE INDEX "market_candle_chunks_fetched_at_idx" ON "market_candle_chunks" USING btree ("fetched_at");