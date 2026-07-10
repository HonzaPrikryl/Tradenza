ALTER TABLE "strategies" ADD COLUMN "image_urls" jsonb;--> statement-breakpoint
UPDATE "strategies" SET "image_urls" = jsonb_build_array("image_url") WHERE "image_url" IS NOT NULL;
