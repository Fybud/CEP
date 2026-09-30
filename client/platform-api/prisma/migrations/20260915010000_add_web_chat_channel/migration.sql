-- Ensure ChannelType includes web_chat before channel_config / inbox rows use it.
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'web_chat';

-- CreateTable
CREATE TABLE IF NOT EXISTS "web_chat_channel" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "last_message_at" TIMESTAMP(3),
    "last_customer_message_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_chat_channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "web_chat_channel_external_id_key" ON "web_chat_channel"("external_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "web_chat_channel_customer_id_idx" ON "web_chat_channel"("customer_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "web_chat_channel_customer_id_resolved_idx" ON "web_chat_channel"("customer_id", "resolved");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "web_chat_channel_last_message_at_idx" ON "web_chat_channel"("last_message_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'web_chat_channel_customer_id_fkey'
  ) THEN
    ALTER TABLE "web_chat_channel"
      ADD CONSTRAINT "web_chat_channel_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
