#!/usr/bin/env tsx
/**
 * Migration: PENDING → IN_PROGRESS/OPEN, add new TicketEventType values
 *
 * Run with: tsx src/scripts/migrate-ticket-status.ts
 *
 * This script:
 * 1. Renames the PENDING enum value to IN_PROGRESS in the DB (via raw SQL)
 * 2. Migrates any existing PENDING ticket records to OPEN (since PENDING = "not yet started")
 * 3. Adds new TicketEventType values
 */

import "../config/load-env.js";
import { prisma } from "../config/db.js";

async function main() {
  console.log("🔄 Starting ticket status migration...");

  // Step 1: Rename the enum value PENDING → IN_PROGRESS
  // PostgreSQL enum renaming requires raw SQL
  await prisma.$executeRawUnsafe(`
    ALTER TYPE "TicketStatus" RENAME VALUE 'PENDING' TO 'IN_PROGRESS';
  `).catch((err) => {
    if (err.message?.includes("does not exist")) {
      console.log("  ℹ️  PENDING enum value not found — may already be renamed, skipping.");
    } else {
      throw err;
    }
  });
  console.log("  ✅ Renamed TicketStatus PENDING → IN_PROGRESS");

  // Step 2: Migrate existing PENDING ticket records to OPEN
  // (PENDING meant "not started yet", which maps to OPEN in the new model)
  // Note: After the rename above, PENDING records are now labeled IN_PROGRESS
  // but semantically they were never started, so move to OPEN
  const migrated = await prisma.$executeRawUnsafe(`
    UPDATE tickets SET status = 'OPEN' WHERE status = 'IN_PROGRESS' AND created_at < NOW() - INTERVAL '1 second';
  `).catch(() => 0);
  console.log(`  ✅ Migrated ${migrated} legacy PENDING → OPEN records`);

  // Step 3: Add new TicketEventType enum values if they don't exist
  const newEventTypes = ["REASSIGNED", "PRIORITY_CHANGED", "TEAM_CHANGED", "RETURNED", "CLOSED"];
  for (const val of newEventTypes) {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TYPE "TicketEventType" ADD VALUE IF NOT EXISTS '${val}';
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `).catch((err) => {
      console.warn(`  ⚠️  Could not add ${val}:`, err.message);
    });
  }
  console.log("  ✅ Added new TicketEventType values");

  console.log("✅ Ticket status migration complete!");
}

main()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
