import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const workspaces = await prisma.workspace.findMany();
  for (const w of workspaces) {
    const features = ["broadcast_enabled", "templates_enabled", "agent_reporting", "advanced_routing"];
    for (const flag of features) {
      await prisma.workspaceFeature.upsert({
        where: {
          workspaceId_flagName: {
            workspaceId: w.id,
            flagName: flag
          }
        },
        update: { enabled: true },
        create: {
          workspaceId: w.id,
          flagName: flag,
          enabled: true
        }
      });
    }
  }
  console.log("Enabled all features.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
