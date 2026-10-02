import { PrismaClient } from "./src/generated/client/index.js";

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: "postgresql://cep:cep@localhost:5432/cep_demo" } } });
  const templates = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_templates'`;
  console.log(templates);
  await prisma.$disconnect();
}
main().catch(console.error);
