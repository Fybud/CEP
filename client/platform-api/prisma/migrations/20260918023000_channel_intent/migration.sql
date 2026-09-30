-- AlterTable
ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT;
ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION;
ALTER TABLE "whatsapp_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3);

ALTER TABLE "instagram_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT;
ALTER TABLE "instagram_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION;
ALTER TABLE "instagram_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3);

ALTER TABLE "facebook_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT;
ALTER TABLE "facebook_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION;
ALTER TABLE "facebook_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3);

ALTER TABLE "email_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT;
ALTER TABLE "email_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION;
ALTER TABLE "email_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3);

ALTER TABLE "web_chat_channel" ADD COLUMN IF NOT EXISTS "intent" TEXT;
ALTER TABLE "web_chat_channel" ADD COLUMN IF NOT EXISTS "intent_confidence" DOUBLE PRECISION;
ALTER TABLE "web_chat_channel" ADD COLUMN IF NOT EXISTS "intent_updated_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "whatsapp_channel_intent_idx" ON "whatsapp_channel"("intent");
CREATE INDEX IF NOT EXISTS "instagram_channel_intent_idx" ON "instagram_channel"("intent");
CREATE INDEX IF NOT EXISTS "facebook_channel_intent_idx" ON "facebook_channel"("intent");
CREATE INDEX IF NOT EXISTS "email_channel_intent_idx" ON "email_channel"("intent");
CREATE INDEX IF NOT EXISTS "web_chat_channel_intent_idx" ON "web_chat_channel"("intent");
