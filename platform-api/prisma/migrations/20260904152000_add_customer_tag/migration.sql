-- Add tag column to customers table for broadcast filtering
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tag" TEXT;
CREATE INDEX IF NOT EXISTS "customers_tag_idx" ON "customers"("tag");
