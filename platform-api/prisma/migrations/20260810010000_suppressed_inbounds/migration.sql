-- Tombstones for inbound messages removed from CEP (prevents Gmail Pub/Sub re-ingest).
CREATE TABLE IF NOT EXISTS "suppressed_inbounds" (
    "id" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "suppressed_inbounds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "suppressed_inbounds_channel_type_external_id_key"
  ON "suppressed_inbounds"("channel_type", "external_id");

CREATE INDEX IF NOT EXISTS "suppressed_inbounds_customer_id_idx"
  ON "suppressed_inbounds"("customer_id");
