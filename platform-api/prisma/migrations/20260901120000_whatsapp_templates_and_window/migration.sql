-- WhatsApp templates + per-channel last customer message timestamps
-- Table names are singular (whatsapp_channel), matching existing CEP schema.

ALTER TABLE "whatsapp_channel"
  ADD COLUMN IF NOT EXISTS "last_customer_message_at" TIMESTAMP(3);

ALTER TABLE "instagram_channel"
  ADD COLUMN IF NOT EXISTS "last_customer_message_at" TIMESTAMP(3);

ALTER TABLE "email_channel"
  ADD COLUMN IF NOT EXISTS "last_customer_message_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "whatsapp_channel_last_customer_message_at_idx"
  ON "whatsapp_channel" ("last_customer_message_at");

CREATE INDEX IF NOT EXISTS "instagram_channel_last_customer_message_at_idx"
  ON "instagram_channel" ("last_customer_message_at");

DO $$
BEGIN
  CREATE TYPE "TemplateStatus" AS ENUM (
    'APPROVED',
    'PENDING',
    'REJECTED',
    'PAUSED',
    'DISABLED',
    'UNKNOWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
  "id" TEXT NOT NULL,
  "waba_id" TEXT,
  "meta_template_id" TEXT,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "internal_category" TEXT NOT NULL,
  "meta_category" TEXT NOT NULL,
  "status" "TemplateStatus" NOT NULL DEFAULT 'PENDING',
  "components" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_synced_at" TIMESTAMP(3),

  CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_templates_name_language_key"
  ON "whatsapp_templates"("name", "language");

CREATE INDEX IF NOT EXISTS "whatsapp_templates_status_idx"
  ON "whatsapp_templates"("status");

-- Backfill last customer message from latest inbound message per channel identity
UPDATE "whatsapp_channel" wc
SET "last_customer_message_at" = sub.max_at
FROM (
  SELECT "channel_id", MAX("created_at") AS max_at
  FROM "messages"
  WHERE "channel_type" = 'whatsapp' AND "direction" = 'incoming'
  GROUP BY "channel_id"
) sub
WHERE wc."id" = sub."channel_id"
  AND wc."last_customer_message_at" IS NULL;

UPDATE "instagram_channel" ic
SET "last_customer_message_at" = sub.max_at
FROM (
  SELECT "channel_id", MAX("created_at") AS max_at
  FROM "messages"
  WHERE "channel_type" = 'instagram' AND "direction" = 'incoming'
  GROUP BY "channel_id"
) sub
WHERE ic."id" = sub."channel_id"
  AND ic."last_customer_message_at" IS NULL;

UPDATE "email_channel" ec
SET "last_customer_message_at" = sub.max_at
FROM (
  SELECT "channel_id", MAX("created_at") AS max_at
  FROM "messages"
  WHERE "channel_type" = 'email' AND "direction" = 'incoming'
  GROUP BY "channel_id"
) sub
WHERE ec."id" = sub."channel_id"
  AND ec."last_customer_message_at" IS NULL;
