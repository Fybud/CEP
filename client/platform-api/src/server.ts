import "./config/load-env.js";
import { env } from "./config/env.js";
import { prisma } from "./config/db.js";
import { buildApp } from "./app.js";
import { runDatabaseMigrations } from "./scripts/migrate.js";
import { bootstrapRuntime } from "./services/StartupService.js";
import { startGmailWatchScheduler } from "./services/EmailService.js";
import { startInstagramTokenScheduler } from "./services/OAuthService.js";
import { startTelemetryCleanupScheduler } from "./services/TelemetryCleanupService.js";
import { startBroadcastScheduler } from "./services/BroadcastScheduler.js";

async function main() {
  // Always apply pending prisma/migrations (+ critical schema safety nets) before listen.
  console.log("[boot] Running database migrations…");
  await runDatabaseMigrations();
  console.log("[boot] Database ready");

  // Workspace + sync .env channel creds + enable channels + Gmail watch + IG subscribe
  // Channel steps never abort boot (warnings only)
  await bootstrapRuntime();

  const app = await buildApp();
  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    app.log.info(`platform-api listening on :${env.port}`);
    app.log.info(
      `webhooks: /webhooks/whatsapp | /webhooks/instagram | /webhooks/email/pubsub`,
    );
    startGmailWatchScheduler();
    startInstagramTokenScheduler();
    startTelemetryCleanupScheduler();
    startBroadcastScheduler();
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
