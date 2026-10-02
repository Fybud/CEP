-- Simplify skills: drop editable AgentSkill; keep audit runs; add per-tenant LLM config

-- Drop old skill config + FK from runs
ALTER TABLE IF EXISTS "agent_skill_runs" DROP CONSTRAINT IF EXISTS "agent_skill_runs_skill_id_fkey";
DROP TABLE IF EXISTS "agent_skills";

-- Recreate audit table without skill_id (idempotent-ish)
CREATE TABLE IF NOT EXISTS "agent_skill_runs" (
    "id" TEXT NOT NULL,
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

-- If table already existed with skill_id, drop that column
ALTER TABLE "agent_skill_runs" DROP COLUMN IF EXISTS "skill_id";

CREATE INDEX IF NOT EXISTS "agent_skill_runs_skill_key_idx" ON "agent_skill_runs"("skill_key");
CREATE INDEX IF NOT EXISTS "agent_skill_runs_channel_type_channel_id_idx"
  ON "agent_skill_runs"("channel_type", "channel_id");
CREATE INDEX IF NOT EXISTS "agent_skill_runs_created_at_idx" ON "agent_skill_runs"("created_at");

CREATE TABLE IF NOT EXISTS "llm_config" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "api_key" TEXT NOT NULL DEFAULT '',
    "base_url" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "llm_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "llm_config" ("id", "provider", "api_key", "base_url", "model", "updated_at")
VALUES ('llm_default', 'openai', '', '', 'gpt-4o-mini', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
