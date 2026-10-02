import { config } from 'dotenv';
config({ path: '.env.svasthyaa' });
import { PrismaClient } from './src/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const config = await prisma.channelConfig.findFirst({
    where: { channelType: 'whatsapp' }
  });
  console.log(config);
}

main().finally(() => prisma.$disconnect());
