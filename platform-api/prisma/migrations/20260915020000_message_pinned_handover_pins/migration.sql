-- Message pin flag (used by pin toggle + included in all message findMany selects)
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;

-- Handover notes (schema present; table may be missing on older deploys)
CREATE TABLE IF NOT EXISTS "handover_notes" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handover_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "handover_notes_conversation_id_idx" ON "handover_notes"("conversation_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'handover_notes_author_id_fkey'
  ) THEN
    ALTER TABLE "handover_notes"
      ADD CONSTRAINT "handover_notes_author_id_fkey"
      FOREIGN KEY ("author_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Per-user conversation pins
CREATE TABLE IF NOT EXISTS "conversation_pins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_pins_user_id_conversation_id_key"
  ON "conversation_pins"("user_id", "conversation_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_pins_user_id_fkey'
  ) THEN
    ALTER TABLE "conversation_pins"
      ADD CONSTRAINT "conversation_pins_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
