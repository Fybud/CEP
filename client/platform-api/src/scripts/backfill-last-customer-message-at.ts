/**
 * Backfill last_customer_message_at on whatsapp_channel, instagram_channel,
 * and email_channel from the latest inbound (customer) message per identity.
 *
 * Safe to run multiple times — only updates rows where the stored timestamp
 * is NULL or older than the latest inbound message.
 *
 * Usage (on server inside API container or locally):
 *   npm run backfill:last-customer-message
 *   # or: tsx src/scripts/backfill-last-customer-message-at.ts
 */
import "../config/load-env.js";
import { prisma } from "../config/db.js";

type ChannelTable = "whatsapp_channel" | "instagram_channel" | "facebook_channel" | "email_channel";
type ChannelType = "whatsapp" | "instagram" | "facebook" | "email";

const CHANNELS: Array<{ table: ChannelTable; type: ChannelType }> = [
  { table: "whatsapp_channel", type: "whatsapp" },
  { table: "instagram_channel", type: "instagram" },
  { table: "facebook_channel", type: "facebook" },
  { table: "email_channel", type: "email" },
];

async function backfillChannel(table: ChannelTable, channelType: ChannelType) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ channel_id: string; max_at: Date }>
  >(
    `SELECT "channel_id", MAX("created_at") AS max_at
     FROM "messages"
     WHERE "channel_type" = $1 AND "direction" = 'incoming'
     GROUP BY "channel_id"`,
    channelType,
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}"
       SET "last_customer_message_at" = $1
       WHERE "id" = $2
         AND ("last_customer_message_at" IS NULL OR "last_customer_message_at" < $1)`,
      row.max_at,
      row.channel_id,
    );
    if (result > 0) updated += 1;
    else skipped += 1;
  }

  console.log(`[backfill] ${table}: identities=${rows.length} updated=${updated} skipped=${skipped}`);
  return { updated, skipped, total: rows.length };
}

async function main() {
  console.log("[backfill] last_customer_message_at — starting");
  let totalUpdated = 0;

  for (const { table, type } of CHANNELS) {
    const stats = await backfillChannel(table, type);
    totalUpdated += stats.updated;
  }

  console.log(`[backfill] done — total rows updated: ${totalUpdated}`);
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
