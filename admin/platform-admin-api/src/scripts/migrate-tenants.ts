import { PrismaClient as AdminPrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import path from "path";

async function main() {
  const adminPrisma = new AdminPrismaClient();
  const orgs = await adminPrisma.organization.findMany();
  
  console.log(`Found ${orgs.length} organizations.`);
  
  for (const org of orgs) {
    if (!org.dbUrl) {
      console.log(`Skipping ${org.name} - no dbUrl configured.`);
      continue;
    }
    
    console.log(`\n--- Migrating ${org.name} ---`);
    try {
      const clientApiDir = path.resolve(__dirname, "../../../../client/platform-api");
      execSync("node dist/scripts/migrate.js", {
        cwd: clientApiDir,
        env: {
          ...process.env,
          PLATFORM_DATABASE_URL: org.dbUrl,
          DATABASE_URL: org.dbUrl,
        },
        stdio: "inherit"
      });
      console.log(`Successfully migrated ${org.name}.`);
    } catch (err) {
      console.error(`Failed to migrate ${org.name}:`, err);
    }
  }
  
  await adminPrisma.$disconnect();
}

main().catch(console.error);
