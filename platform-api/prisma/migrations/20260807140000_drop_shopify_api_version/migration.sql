-- Drop unused Shopify API version column (hardcoded in app as 2024-10)
ALTER TABLE "shopify_config" DROP COLUMN IF EXISTS "api_version";
