-- CEP schema: customers + per-channel identity tables + users + shopify_config

CREATE TYPE "ChannelType" AS ENUM ('whatsapp', 'instagram', 'email');
CREATE TYPE "MessageDirection" AS ENUM ('incoming', 'outgoing');
CREATE TYPE "MessageStatus" AS ENUM ('received', 'queued', 'sent', 'delivered', 'failed', 'mocked');
CREATE TYPE "ContentType" AS ENUM ('text', 'image', 'file', 'audio', 'video', 'unknown');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE TABLE "customers" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customers_resolved_idx" ON "customers"("resolved");

CREATE TABLE "channels_config" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel_type" "ChannelType" NOT NULL,
  "channel_config" JSONB NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channels_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channels_config_channel_type_key" ON "channels_config"("channel_type");
CREATE INDEX "channels_config_enabled_idx" ON "channels_config"("enabled");

CREATE TABLE "shopify_config" (
  "id" TEXT NOT NULL DEFAULT 'shopify_default',
  "shop" TEXT NOT NULL DEFAULT '',
  "client_id" TEXT NOT NULL DEFAULT '',
  "client_secret" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shopify_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_channel" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "last_message_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_channel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_channel_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "whatsapp_channel_external_id_key" ON "whatsapp_channel"("external_id");
CREATE INDEX "whatsapp_channel_customer_id_idx" ON "whatsapp_channel"("customer_id");
CREATE INDEX "whatsapp_channel_customer_id_resolved_idx" ON "whatsapp_channel"("customer_id", "resolved");
CREATE INDEX "whatsapp_channel_last_message_at_idx" ON "whatsapp_channel"("last_message_at");

CREATE TABLE "instagram_channel" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "last_message_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_channel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instagram_channel_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "instagram_channel_external_id_key" ON "instagram_channel"("external_id");
CREATE INDEX "instagram_channel_customer_id_idx" ON "instagram_channel"("customer_id");
CREATE INDEX "instagram_channel_customer_id_resolved_idx" ON "instagram_channel"("customer_id", "resolved");
CREATE INDEX "instagram_channel_last_message_at_idx" ON "instagram_channel"("last_message_at");

CREATE TABLE "email_channel" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "last_message_at" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_channel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_channel_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "email_channel_external_id_key" ON "email_channel"("external_id");
CREATE INDEX "email_channel_customer_id_idx" ON "email_channel"("customer_id");
CREATE INDEX "email_channel_customer_id_resolved_idx" ON "email_channel"("customer_id", "resolved");
CREATE INDEX "email_channel_last_message_at_idx" ON "email_channel"("last_message_at");

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "channel_type" "ChannelType" NOT NULL,
  "channel_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "direction" "MessageDirection" NOT NULL,
  "content" TEXT NOT NULL,
  "content_type" "ContentType" NOT NULL DEFAULT 'text',
  "subject" TEXT,
  "external_id" TEXT,
  "status" "MessageStatus" NOT NULL DEFAULT 'received',
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "messages_channel_type_channel_id_external_id_key" ON "messages"("channel_type", "channel_id", "external_id");
CREATE INDEX "messages_customer_id_created_at_idx" ON "messages"("customer_id", "created_at");
CREATE INDEX "messages_channel_type_channel_id_created_at_idx" ON "messages"("channel_type", "channel_id", "created_at");
CREATE INDEX "messages_customer_id_channel_type_idx" ON "messages"("customer_id", "channel_type");

CREATE TABLE "webhook_events" (
  "id" TEXT NOT NULL,
  "channel_config_id" TEXT NOT NULL,
  "channel" "ChannelType" NOT NULL,
  "event_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_events_channel_config_id_fkey" FOREIGN KEY ("channel_config_id") REFERENCES "channels_config"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "webhook_events_channel_config_id_event_key_key" ON "webhook_events"("channel_config_id", "event_key");
CREATE INDEX "webhook_events_channel_created_at_idx" ON "webhook_events"("channel", "created_at");
