import { prisma } from "../config/db.js";

/** Only identities that have actually messaged count toward resolve / Unresolved. */
function isActiveIdentity(row: { lastMessageAt: Date | null; resolved: boolean }) {
  return row.lastMessageAt != null;
}

/** Customer.resolved = true iff every *active* channel identity is resolved (or none active). */
export async function recomputeCustomerResolved(customerId: string): Promise<boolean> {
  const [wa, ig, fb, em, wc] = await Promise.all([
    prisma.whatsAppChannel.findMany({
      where: { customerId },
      select: { resolved: true, lastMessageAt: true },
    }),
    prisma.instagramChannel.findMany({
      where: { customerId },
      select: { resolved: true, lastMessageAt: true },
    }),
    prisma.facebookChannel.findMany({
      where: { customerId },
      select: { resolved: true, lastMessageAt: true },
    }),
    prisma.emailChannel.findMany({
      where: { customerId },
      select: { resolved: true, lastMessageAt: true },
    }),
    prisma.webChatChannel.findMany({
      where: { customerId },
      select: { resolved: true, lastMessageAt: true },
    }),
  ]);
  const all = [...wa, ...ig, ...fb, ...em, ...wc].filter(isActiveIdentity);
  const resolved = all.length === 0 ? true : all.every((r) => r.resolved);
  await prisma.customer.update({
    where: { id: customerId },
    data: { resolved },
  });
  return resolved;
}

export async function setChannelResolved(input: {
  channelType: "whatsapp" | "instagram" | "facebook" | "email" | "web_chat";
  channelId: string;
  resolved: boolean;
}): Promise<{ customerId: string; customerResolved: boolean }> {
  if (input.channelType === "whatsapp") {
    const row = await prisma.whatsAppChannel.update({
      where: { id: input.channelId },
      data: { resolved: input.resolved },
    });
    const customerResolved = await recomputeCustomerResolved(row.customerId);
    return { customerId: row.customerId, customerResolved };
  }
  if (input.channelType === "instagram") {
    const row = await prisma.instagramChannel.update({
      where: { id: input.channelId },
      data: { resolved: input.resolved },
    });
    const customerResolved = await recomputeCustomerResolved(row.customerId);
    return { customerId: row.customerId, customerResolved };
  }
  if (input.channelType === "facebook") {
    const row = await prisma.facebookChannel.update({
      where: { id: input.channelId },
      data: { resolved: input.resolved },
    });
    const customerResolved = await recomputeCustomerResolved(row.customerId);
    return { customerId: row.customerId, customerResolved };
  }
  if (input.channelType === "email") {
    const row = await prisma.emailChannel.update({
      where: { id: input.channelId },
      data: { resolved: input.resolved },
    });
    const customerResolved = await recomputeCustomerResolved(row.customerId);
    return { customerId: row.customerId, customerResolved };
  }
  if (input.channelType === "web_chat") {
    const row = await prisma.webChatChannel.update({
      where: { id: input.channelId },
      data: { resolved: input.resolved },
    });
    const customerResolved = await recomputeCustomerResolved(row.customerId);
    return { customerId: row.customerId, customerResolved };
  }
  throw new Error("Unknown channel for resolving");
}

export async function resolveAllIdentitiesForCustomerChannel(input: {
  customerId: string;
  channelType: "whatsapp" | "instagram" | "facebook" | "email" | "web_chat";
}): Promise<boolean> {
  if (input.channelType === "whatsapp") {
    await prisma.whatsAppChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  } else if (input.channelType === "instagram") {
    await prisma.instagramChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  } else if (input.channelType === "facebook") {
    await prisma.facebookChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  } else if (input.channelType === "email") {
    await prisma.emailChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  } else if (input.channelType === "web_chat") {
    await prisma.webChatChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  }
  return recomputeCustomerResolved(input.customerId);
}
