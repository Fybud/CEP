import "../config/load-env.js";
import { prisma } from "../config/db.js";
import { emailAdapter } from "../adapters/email/index.js";
import type { EmailChannelConfig } from "../adapters/shared/types.js";

async function main() {
  const messages = await prisma.message.findMany({
    where: { channelType: "email" },
    select: {
      id: true,
      content: true,
      contentType: true,
      subject: true,
      rawPayload: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  let skipped = 0;

  for (const message of messages) {
    if (!message.rawPayload) {
      skipped += 1;
      continue;
    }

    const parsed = emailAdapter.parseInbound(
      {} as EmailChannelConfig,
      message.rawPayload,
    )[0];
    if (!parsed || parsed.type !== "message" || !parsed.content) {
      skipped += 1;
      continue;
    }

    const subject = parsed.subject ?? message.subject;
    if (
      message.content === parsed.content &&
      message.contentType === parsed.contentType &&
      message.subject === subject
    ) {
      continue;
    }

    await prisma.message.update({
      where: { id: message.id },
      data: {
        content: parsed.content,
        contentType: parsed.contentType,
        subject,
      },
    });
    updated += 1;
  }

  console.log(`[email:backfill] updated=${updated} skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error("[email:backfill] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
