ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS quality_score TEXT;
