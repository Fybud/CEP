-- Agent skills + audit runs (automation replies)

CREATE TABLE IF NOT EXISTS "agent_skills" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intents" JSONB NOT NULL DEFAULT '[]',
    "intent_groups" JSONB NOT NULL DEFAULT '[]',
    "min_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "auto_send" BOOLEAN NOT NULL DEFAULT true,
    "cooldown_ms" INTEGER NOT NULL DEFAULT 180000,
    "reply_mode" TEXT NOT NULL DEFAULT 'tool',
    "canned_reply_id" TEXT,
    "prompt" TEXT,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "channel_types" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_skills_key_key" ON "agent_skills"("key");
CREATE INDEX IF NOT EXISTS "agent_skills_enabled_sort_order_idx" ON "agent_skills"("enabled", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_skills_canned_reply_id_fkey'
  ) THEN
    ALTER TABLE "agent_skills"
      ADD CONSTRAINT "agent_skills_canned_reply_id_fkey"
      FOREIGN KEY ("canned_reply_id") REFERENCES "canned_replies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "agent_skill_runs" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "skill_key" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "channel_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "intent" TEXT,
    "intent_group" TEXT,
    "confidence" DOUBLE PRECISION,
    "action" TEXT NOT NULL,
    "message_id" TEXT,
    "detail" TEXT,
    "tool_trace" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_skill_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_skill_runs_skill_id_idx" ON "agent_skill_runs"("skill_id");
CREATE INDEX IF NOT EXISTS "agent_skill_runs_channel_type_channel_id_idx"
  ON "agent_skill_runs"("channel_type", "channel_id");
CREATE INDEX IF NOT EXISTS "agent_skill_runs_created_at_idx" ON "agent_skill_runs"("created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_skill_runs_skill_id_fkey'
  ) THEN
    ALTER TABLE "agent_skill_runs"
      ADD CONSTRAINT "agent_skill_runs_skill_id_fkey"
      FOREIGN KEY ("skill_id") REFERENCES "agent_skills"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
