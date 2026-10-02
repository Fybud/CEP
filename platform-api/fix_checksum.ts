import { PrismaClient } from "./src/generated/client/index.js";
import crypto from "crypto";
import fs from "fs";

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: "postgresql://cep:cep@localhost:5432/cep_demo" } } });
  
  const migrationName = "20260901120000_whatsapp_templates_and_window";
  const fileContent = fs.readFileSync(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
  const checksum = crypto.createHash("sha256").update(fileContent).digest("hex");
  
  console.log(`Setting checksum for ${migrationName} to ${checksum}...`);
  await prisma.$executeRawUnsafe(`UPDATE _prisma_migrations SET checksum = $1 WHERE migration_name = $2`, checksum, migrationName);
  console.log("Checksum updated!");
  await prisma.$disconnect();
}
main().catch(console.error);
