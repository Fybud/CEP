-- Persist Gmail thread ids so CEP can list/reply per email conversation.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "external_thread_id" TEXT;

-- Backfill from stored Gmail API payloads when present.
UPDATE "messages"
SET "external_thread_id" = "raw_payload"->>'threadId'
WHERE "channel_type" = 'email'
  AND "external_thread_id" IS NULL
  AND "raw_payload" IS NOT NULL
  AND COALESCE("raw_payload"->>'threadId', '') <> '';

-- Remaining email rows without a Gmail thread id share one legacy bucket per customer.
UPDATE "messages"
SET "external_thread_id" = 'legacy:' || "customer_id"
WHERE "channel_type" = 'email'
  AND "external_thread_id" IS NULL;

CREATE INDEX IF NOT EXISTS "messages_customer_id_channel_type_external_thread_id_created_at_idx"
  ON "messages"("customer_id", "channel_type", "external_thread_id", "created_at");
