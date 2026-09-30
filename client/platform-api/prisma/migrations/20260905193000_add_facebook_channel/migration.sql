-- Add Facebook channel support (enum + identity table).
-- Safe/additive: does not touch existing WhatsApp/Instagram/email data.

ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'facebook';

CREATE TABLE IF NOT EXISTS "facebook_channel" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "last_message_at" TIMESTAMP(3),
  "last_customer_message_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "facebook_channel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "facebook_channel_external_id_key"
  ON "facebook_channel"("external_id");

CREATE INDEX IF NOT EXISTS "facebook_channel_customer_id_idx"
  ON "facebook_channel"("customer_id");

CREATE INDEX IF NOT EXISTS "facebook_channel_customer_id_resolved_idx"
  ON "facebook_channel"("customer_id", "resolved");

CREATE INDEX IF NOT EXISTS "facebook_channel_last_message_at_idx"
  ON "facebook_channel"("last_message_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facebook_channel_customer_id_fkey'
  ) THEN
    ALTER TABLE "facebook_channel"
      ADD CONSTRAINT "facebook_channel_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
