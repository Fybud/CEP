import "../config/load-env.js";
import { findOrCreateGoogleUser } from "../services/UserService.js";
import { prisma } from "../config/db.js";

async function main() {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || "fiberai.akesh@gmail.com";
  console.log(`[seed:user] Seeding admin user: ${adminEmail}`);

  // Mock a google ID for local dev if they want to seed
  const user = await findOrCreateGoogleUser(adminEmail, "dev-seed-google-id");
  console.log(`[seed:user] seeded id=${user.id} username=${user.username} role=${user.role}`);
}

main()
  .catch((err) => {
    console.error("[seed:user] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
