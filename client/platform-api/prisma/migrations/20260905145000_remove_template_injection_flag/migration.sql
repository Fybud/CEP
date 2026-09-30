-- Remove the template-injection-in-chat feature flag.
-- This feature has been removed from the product. The route and UI have been deleted.
-- We do a safe DELETE (no error if row doesn't exist).
DELETE FROM "FeatureFlag" WHERE key = 'whatsapp_template_injection_enabled';
