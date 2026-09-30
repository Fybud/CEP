import { prisma } from "../config/db.js";

// Run cleanup every 24 hours
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Keep sessions for 7 days
const RETENTION_DAYS = 7;

export function startTelemetryCleanupScheduler() {
  console.log(`[Telemetry Cleanup] Scheduler started. Runs every 24 hours. Retention: ${RETENTION_DAYS} days.`);
  
  // Run it immediately on boot
  runCleanup();

  // Schedule for subsequent runs
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

async function runCleanup() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    // Prisma doesn't directly support `deleteMany` with nested relations if we wanted to just delete events,
    // but because we set `onDelete: Cascade` on the `session` relation inside SessionEvent, 
    // deleting the UserSession will automatically wipe out all of its massive JSON events as well.
    const result = await prisma.userSession.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    if (result.count > 0) {
      console.log(`[Telemetry Cleanup] Deleted ${result.count} old user sessions and their associated rrweb events.`);
    }
  } catch (err) {
    console.error("[Telemetry Cleanup] Error running cleanup:", err);
  }
}
