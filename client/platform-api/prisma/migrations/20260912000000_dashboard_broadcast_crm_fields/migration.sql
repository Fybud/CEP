-- AlterTable: Add customFields to customers
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;

-- AlterTable: Add scheduling, pause, cancel, tag arrays, and customerIds to broadcast_jobs
ALTER TABLE "broadcast_jobs"
  ADD COLUMN IF NOT EXISTS "customer_ids"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "include_tags"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "exclude_tags"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "scheduled_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paused_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at"  TIMESTAMP(3);
