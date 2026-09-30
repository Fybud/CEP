-- Message read/unread + WhatsApp media metadata
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_read" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_key" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_mime_type" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_filename" TEXT;

UPDATE "messages" SET "is_read" = true WHERE "direction" = 'outgoing';

CREATE INDEX IF NOT EXISTS "messages_customer_id_channel_type_is_read_direction_idx"
  ON "messages"("customer_id", "channel_type", "is_read", "direction");
