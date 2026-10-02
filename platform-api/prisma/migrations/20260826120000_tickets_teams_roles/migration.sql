-- Additive: roles, teams, tickets (safe for existing prod data — no DROP of core tables)

-- Role enum
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ticket enums
DO $$ BEGIN
  CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TicketEventType" AS ENUM (
    'CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED',
    'TEAM_CHANGED', 'ESCALATED', 'RETURNED', 'NOTE_ADDED', 'REPLIED',
    'RESOLVED', 'CLOSED', 'REOPENED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Ensure newer TicketEventType values exist if enum was created earlier (PG15+)
ALTER TYPE "TicketEventType" ADD VALUE IF NOT EXISTS 'REASSIGNED';
ALTER TYPE "TicketEventType" ADD VALUE IF NOT EXISTS 'PRIORITY_CHANGED';
ALTER TYPE "TicketEventType" ADD VALUE IF NOT EXISTS 'TEAM_CHANGED';
ALTER TYPE "TicketEventType" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "TicketEventType" ADD VALUE IF NOT EXISTS 'CLOSED';

-- Users: evolve from password auth → Google + roles (keep existing rows)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT 'AGENT';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "team_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

-- password_hash no longer required by app; keep column if present but allow null
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_key" ON "users"("google_id");

-- Teams (create before FK from users.team_id)
CREATE TABLE IF NOT EXISTS "teams" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parent_team_id" TEXT,
  "manager_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "teams"
    ADD CONSTRAINT "teams_parent_team_id_fkey"
    FOREIGN KEY ("parent_team_id") REFERENCES "teams"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "teams"
    ADD CONSTRAINT "teams_manager_id_fkey"
    FOREIGN KEY ("manager_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tickets
CREATE TABLE IF NOT EXISTS "tickets" (
  "id" TEXT NOT NULL,
  "number" SERIAL NOT NULL,
  "org_id" TEXT,
  "conversation_id" TEXT,
  "subject" TEXT NOT NULL,
  "description" TEXT,
  "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  "channel" TEXT,
  "customer_id" TEXT,
  "assigned_to" TEXT,
  "team_id" TEXT,
  "created_by" TEXT,
  "escalated_to_user_id" TEXT,
  "escalated_to_team_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tickets_status_idx" ON "tickets"("status");
CREATE INDEX IF NOT EXISTS "tickets_assigned_to_idx" ON "tickets"("assigned_to");
CREATE INDEX IF NOT EXISTS "tickets_team_id_idx" ON "tickets"("team_id");
CREATE INDEX IF NOT EXISTS "tickets_created_by_idx" ON "tickets"("created_by");
CREATE INDEX IF NOT EXISTS "tickets_customer_id_idx" ON "tickets"("customer_id");

DO $$ BEGIN
  ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_assigned_to_fkey"
    FOREIGN KEY ("assigned_to") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tickets"
    ADD CONSTRAINT "tickets_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ticket events
CREATE TABLE IF NOT EXISTS "ticket_events" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "type" "TicketEventType" NOT NULL,
  "from_value" JSONB,
  "to_value" JSONB,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_events_ticket_id_idx" ON "ticket_events"("ticket_id");

DO $$ BEGIN
  ALTER TABLE "ticket_events"
    ADD CONSTRAINT "ticket_events_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ticket notes
CREATE TABLE IF NOT EXISTS "ticket_notes" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "is_internal" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_notes_ticket_id_idx" ON "ticket_notes"("ticket_id");

DO $$ BEGIN
  ALTER TABLE "ticket_notes"
    ADD CONSTRAINT "ticket_notes_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ticket_notes"
    ADD CONSTRAINT "ticket_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
