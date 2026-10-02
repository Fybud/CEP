import { prisma } from "../config/db.js";
import { shapeCustomer } from "./MessagingService.js";

export async function isCustomerBlocked(customerId: string): Promise<boolean> {
  const row = await prisma.blockedContact.findUnique({
    where: { customerId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function blockCustomer(input: {
  customerId: string;
  reason?: string | null;
  blockedBy?: string | null;
}) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!customer) throw new Error("Customer not found");

  return prisma.blockedContact.upsert({
    where: { customerId: input.customerId },
    create: {
      customerId: input.customerId,
      reason: input.reason?.trim() || null,
      blockedBy: input.blockedBy ?? null,
    },
    update: {
      reason: input.reason?.trim() || null,
      blockedBy: input.blockedBy ?? null,
    },
  });
}

export async function unblockCustomer(customerId: string) {
  const existing = await prisma.blockedContact.findUnique({
    where: { customerId },
    select: { id: true },
  });
  if (!existing) return { unblocked: false };
  await prisma.blockedContact.delete({ where: { customerId } });
  return { unblocked: true };
}

export async function listBlockedContacts() {
  const rows = await prisma.blockedContact.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: {
        include: {
          whatsappIdentities: true,
          instagramIdentities: true,
          emailIdentities: true,
          facebookIdentities: true,
          webChatIdentities: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customerId,
    reason: row.reason,
    blockedBy: row.blockedBy,
    createdAt: row.createdAt.toISOString(),
    customer: shapeCustomer(row.customer as any),
  }));
}
