-- Multiple media attachments per message (email multi-attach, etc.)
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_items" JSONB;
