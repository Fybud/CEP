import { ulid } from "ulid";
import type { ChannelType } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import {
  formatWhatsAppStorage,
  normalizeWhatsAppId,
  shapeCustomer,
} from "./MessagingService.js";
import { recomputeCustomerResolved } from "./ResolveService.js";
import { enrichCustomerFromShopify } from "./orders/shopify-contact.service.js";
import { suppressInboundIds } from "./SuppressService.js";

function normalizeEmail(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().toLowerCase();
}

function normalizeIg(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/^@+/, "");
}

export function isUnknownName(name?: string | null): boolean {
  if (!name?.trim()) return true;
  return name.trim().toLowerCase() === "unknown";
}

export async function loadCustomerShaped(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      whatsappIdentities: true,
      instagramIdentities: true,
      facebookIdentities: true,
      emailIdentities: true,
      webChatIdentities: true,
    },
  });
  return customer ? shapeCustomer(customer) : null;
}

export async function findMatchingCustomers(input: {
  emails?: string[];
  whatsappIds?: string[];
  instagramId?: string | null;
  facebookId?: string | null;
}) {
  const emails = (input.emails ?? []).map(normalizeEmail).filter(Boolean) as string[];
  const wa = (input.whatsappIds ?? [])
    .map((w) => normalizeWhatsAppId(w) ?? w)
    .filter(Boolean) as string[];
  const ig = normalizeIg(input.instagramId);

  const customerIds = new Set<string>();
  for (const email of emails) {
    const row = await prisma.emailChannel.findUnique({ where: { externalId: email } });
    if (row) customerIds.add(row.customerId);
  }
  for (const phone of wa) {
    const digits = normalizeWhatsAppId(phone) ?? phone.replace(/\D/g, "");
    const formatted = formatWhatsAppStorage(phone) ?? phone;
    const exact = await prisma.whatsAppChannel.findMany({
      where: {
        OR: [
          { externalId: phone },
          { externalId: formatted },
          { externalId: digits },
          { externalId: `+${digits}` },
        ],
      },
    });
    for (const r of exact) customerIds.add(r.customerId);

    if (digits.length >= 10) {
      const suffix = digits.slice(-10);
      const candidates = await prisma.whatsAppChannel.findMany({
        where: { externalId: { endsWith: suffix } },
        take: 25,
      });
      for (const r of candidates) {
        const rd = normalizeWhatsAppId(r.externalId);
        if (rd && (rd === digits || rd.endsWith(digits) || digits.endsWith(rd))) {
          customerIds.add(r.customerId);
        }
      }
    }
  }
  if (ig) {
    const row = await prisma.instagramChannel.findFirst({
      where: {
        OR: [{ externalId: ig }, { metadata: { path: ["username"], equals: ig } }],
      },
    });
    if (row) customerIds.add(row.customerId);
  }

  if (!customerIds.size) return [];
  if (input.facebookId?.trim()) {
    const row = await prisma.facebookChannel.findUnique({ where: { externalId: input.facebookId.trim() } });
    if (row) customerIds.add(row.customerId);
  }

  const customers = await prisma.customer.findMany({
    where: { id: { in: [...customerIds] } },
    include: {
      whatsappIdentities: true,
      instagramIdentities: true,
      facebookIdentities: true,
      emailIdentities: true,
      webChatIdentities: true,
    },
  });
  return customers.map(shapeCustomer);
}

async function attachIdentities(
  customerId: string,
  input: {
    emails?: string[];
    whatsappIds?: string[];
    instagramId?: string | null;
    facebookId?: string | null;
  },
) {
  for (const raw of input.emails ?? []) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const existing = await prisma.emailChannel.findUnique({ where: { externalId: email } });
    if (existing) {
      if (existing.customerId !== customerId) {
        // Move ownership onto this customer (merge-safe)
        await prisma.message.updateMany({
          where: { channelType: "email", channelId: existing.id },
          data: { customerId },
        });
        await prisma.emailChannel.update({
          where: { id: existing.id },
          data: { customerId },
        });
        await recomputeCustomerResolved(existing.customerId);
      }
      continue;
    }
    await prisma.emailChannel.create({
      data: { id: ulid(), customerId, externalId: email, resolved: true, metadata: {} },
    });
  }

  for (const raw of input.whatsappIds ?? []) {
    const digits = normalizeWhatsAppId(raw);
    if (!digits) continue;
    const externalId = formatWhatsAppStorage(digits) ?? digits;
    let existing = await prisma.whatsAppChannel.findFirst({
      where: {
        OR: [
          { externalId },
          { externalId: digits },
          { externalId: `+${digits}` },
        ],
      },
    });
    if (!existing && digits.length >= 10) {
      const candidates = await prisma.whatsAppChannel.findMany({
        where: { externalId: { endsWith: digits.slice(-10) } },
        take: 25,
      });
      existing =
        candidates.find((c) => {
          const rd = normalizeWhatsAppId(c.externalId);
          return rd === digits;
        }) ?? null;
    }
    if (existing) {
      if (existing.customerId !== customerId) {
        await prisma.message.updateMany({
          where: { channelType: "whatsapp", channelId: existing.id },
          data: { customerId },
        });
        await prisma.whatsAppChannel.update({
          where: { id: existing.id },
          data: { customerId, externalId },
        });
        await recomputeCustomerResolved(existing.customerId);
      } else if (existing.externalId !== externalId) {
        // Normalize legacy storage to "+dial national"
        await prisma.whatsAppChannel.update({
          where: { id: existing.id },
          data: { externalId },
        });
      }
      continue;
    }
    await prisma.whatsAppChannel.create({
      data: { id: ulid(), customerId, externalId, resolved: true, metadata: {} },
    });
  }

  const fb = input.facebookId?.trim();
  if (fb) {
    const existing = await prisma.facebookChannel.findUnique({ where: { externalId: fb } });
    if (existing) {
      if (existing.customerId !== customerId) {
        await prisma.message.updateMany({
          where: { channelType: "facebook", channelId: existing.id },
          data: { customerId },
        });
        await prisma.facebookChannel.update({
          where: { id: existing.id },
          data: { customerId },
        });
        await recomputeCustomerResolved(existing.customerId);
      }
    } else {
      await prisma.facebookChannel.create({
        data: { id: ulid(), customerId, externalId: fb, resolved: true, metadata: {} },
      });
    }
  }

  const ig = normalizeIg(input.instagramId);
  if (ig) {
    const existing = await prisma.instagramChannel.findFirst({
      where: {
        OR: [{ externalId: ig }, { metadata: { path: ["username"], equals: ig } }],
      },
    });

    const withUsernameMeta = (metadata: unknown) => {
      const base =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? { ...(metadata as Record<string, unknown>) }
          : {};
      return { ...base, username: ig, senderName: `@${ig}` };
    };

    if (existing) {
      if (existing.customerId !== customerId) {
        await prisma.message.updateMany({
          where: { channelType: "instagram", channelId: existing.id },
          data: { customerId },
        });
        await prisma.instagramChannel.update({
          where: { id: existing.id },
          data: {
            customerId,
            metadata: withUsernameMeta(existing.metadata),
            // Keep numeric Instagram-scoped ids for messaging; username-only rows may rename
            ...(/^\d{5,}$/.test(existing.externalId) ? {} : { externalId: ig }),
          },
        });
        await recomputeCustomerResolved(existing.customerId);
      } else {
        await prisma.instagramChannel.update({
          where: { id: existing.id },
          data: {
            metadata: withUsernameMeta(existing.metadata),
            ...(/^\d{5,}$/.test(existing.externalId) ? {} : { externalId: ig }),
          },
        });
      }
    } else {
      const owned = await prisma.instagramChannel.findFirst({
        where: { customerId },
        orderBy: [{ updatedAt: "desc" }],
      });
      if (owned) {
        // Contact already has an IG thread id — only refresh username metadata
        await prisma.instagramChannel.update({
          where: { id: owned.id },
          data: {
            metadata: withUsernameMeta(owned.metadata),
            ...(/^\d{5,}$/.test(owned.externalId) ? {} : { externalId: ig }),
          },
        });
      } else {
        await prisma.instagramChannel.create({
          data: {
            id: ulid(),
            customerId,
            externalId: ig,
            resolved: true,
            metadata: { username: ig, senderName: `@${ig}` },
          },
        });
      }
    }
  }

  await recomputeCustomerResolved(customerId);
}

/**
 * After an agent edit, keep only the channel ids they submitted.
 * attachIdentities / Shopify enrich only add — without this, removed emails come back.
 */
async function syncIdentitiesToSubmitted(
  customerId: string,
  input: {
    emails?: string[];
    whatsappIds?: string[];
    instagramId?: string | null;
    facebookId?: string | null;
  },
) {
  if (input.emails !== undefined) {
    const keep = new Set(
      (input.emails ?? [])
        .map((e) => normalizeEmail(e))
        .filter((e): e is string => Boolean(e)),
    );
    const rows = await prisma.emailChannel.findMany({ where: { customerId } });
    for (const row of rows) {
      if (!keep.has(row.externalId.trim().toLowerCase())) {
        await prisma.emailChannel.delete({ where: { id: row.id } });
      }
    }
  }

  if (input.whatsappIds !== undefined) {
    const keepDigits = new Set(
      (input.whatsappIds ?? [])
        .map((w) => normalizeWhatsAppId(w))
        .filter((d): d is string => Boolean(d)),
    );
    const rows = await prisma.whatsAppChannel.findMany({ where: { customerId } });
    for (const row of rows) {
      const digits = normalizeWhatsAppId(row.externalId);
      if (!digits || !keepDigits.has(digits)) {
        await prisma.whatsAppChannel.delete({ where: { id: row.id } });
      }
    }
  }

  if (input.facebookId !== undefined) {
    const fb = input.facebookId?.trim();
    const rows = await prisma.facebookChannel.findMany({ where: { customerId } });
    for (const row of rows) {
      if (!fb || row.externalId !== fb) {
        await prisma.facebookChannel.delete({ where: { id: row.id } });
      }
    }
  }

  if (input.instagramId !== undefined) {
    const ig = normalizeIg(input.instagramId);
    const rows = await prisma.instagramChannel.findMany({ where: { customerId } });
    for (const row of rows) {
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const username =
        typeof meta.username === "string" ? meta.username.replace(/^@+/, "") : null;
      const matches =
        Boolean(ig) &&
        (row.externalId === ig ||
          username === ig ||
          (username && ig && username.toLowerCase() === ig.toLowerCase()));
      if (!matches) {
        await prisma.instagramChannel.delete({ where: { id: row.id } });
      }
    }
  }

  await recomputeCustomerResolved(customerId);
}

/** Move every identity + message from source → target, then delete source. */
async function absorbCustomer(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  const source = await prisma.customer.findUnique({
    where: { id: sourceId },
    include: {
      whatsappIdentities: true,
      instagramIdentities: true,
      facebookIdentities: true,
      emailIdentities: true,
      webChatIdentities: true,
    },
  });
  if (!source) return;

  for (const wa of source.whatsappIdentities) {
    const clash = await prisma.whatsAppChannel.findFirst({
      where: { customerId: targetId, externalId: wa.externalId },
    });
    if (clash) {
      await prisma.message.updateMany({
        where: { channelType: "whatsapp", channelId: wa.id },
        data: { channelId: clash.id, customerId: targetId },
      });
      await prisma.whatsAppChannel.delete({ where: { id: wa.id } });
    } else {
      await prisma.whatsAppChannel.update({
        where: { id: wa.id },
        data: { customerId: targetId },
      });
    }
  }
  for (const ig of source.instagramIdentities) {
    const clash = await prisma.instagramChannel.findFirst({
      where: { customerId: targetId, externalId: ig.externalId },
    });
    if (clash) {
      await prisma.message.updateMany({
        where: { channelType: "instagram", channelId: ig.id },
        data: { channelId: clash.id, customerId: targetId },
      });
      await prisma.instagramChannel.delete({ where: { id: ig.id } });
    } else {
      await prisma.instagramChannel.update({
        where: { id: ig.id },
        data: { customerId: targetId },
      });
    }
  }
  for (const fb of source.facebookIdentities) {
    const clash = await prisma.facebookChannel.findFirst({
      where: { customerId: targetId, externalId: fb.externalId },
    });
    if (clash) {
      await prisma.message.updateMany({
        where: { channelType: "facebook", channelId: fb.id },
        data: { channelId: clash.id, customerId: targetId },
      });
      await prisma.facebookChannel.delete({ where: { id: fb.id } });
    } else {
      await prisma.facebookChannel.update({
        where: { id: fb.id },
        data: { customerId: targetId },
      });
    }
  }
  for (const em of source.emailIdentities) {
    const clash = await prisma.emailChannel.findFirst({
      where: { customerId: targetId, externalId: em.externalId },
    });
    if (clash) {
      await prisma.message.updateMany({
        where: { channelType: "email", channelId: em.id },
        data: { channelId: clash.id, customerId: targetId },
      });
      await prisma.emailChannel.delete({ where: { id: em.id } });
    } else {
      await prisma.emailChannel.update({
        where: { id: em.id },
        data: { customerId: targetId },
      });
    }
  }

  await prisma.message.updateMany({
    where: { customerId: sourceId },
    data: { customerId: targetId },
  });
  await prisma.customer.delete({ where: { id: sourceId } }).catch(() => undefined);
}

/**
 * Same path as inbound: local identities already attached upstream → Shopify lookup →
 * attach Shopify email+phone → if Shopify landed on another CEP customer, fold rows together.
 * Returns the survivor customer id to load.
 */
async function applyShopifyCrossChannelLikeInbound(
  preferredCustomerId: string | null,
  input: {
    name?: string | null;
    emails?: string[];
    whatsappIds?: string[];
  },
): Promise<string | null> {
  const hasEmail = Boolean(input.emails?.[0]?.trim());
  const hasPhone = Boolean(input.whatsappIds?.[0]?.trim());
  if (!hasEmail && !hasPhone) return preferredCustomerId;

  try {
    const shopify = await enrichCustomerFromShopify({
      name: input.name,
      email: input.emails?.[0],
      phone: input.whatsappIds?.[0],
      inboundChannel: hasEmail ? "email" : "whatsapp",
    });
    if (!shopify?.customerId) return preferredCustomerId;

    if (!preferredCustomerId) return shopify.customerId;

    if (shopify.customerId === preferredCustomerId) return preferredCustomerId;

    // Prefer keeping the contact the agent is editing; fold Shopify/CEP sibling into it.
    // If Shopify matched an older CEP row (created=false), fold this contact into that row
    // so we don't duplicate — same survivor as createCustomer used historically.
    if (shopify.created) {
      await absorbCustomer(shopify.customerId, preferredCustomerId);
      return preferredCustomerId;
    }
    await absorbCustomer(preferredCustomerId, shopify.customerId);
    return shopify.customerId;
  } catch {
    return preferredCustomerId;
  }
}

export async function createCustomer(input: {
  name?: string | null;
  emails?: string[];
  whatsappIds?: string[];
  instagramId?: string | null;
  facebookId?: string | null;
  mergeIntoId?: string;
  keepName?: string | null;
  force?: boolean;
}) {
  if (input.mergeIntoId) {
    await attachIdentities(input.mergeIntoId, input);
    const survivorId =
      (await applyShopifyCrossChannelLikeInbound(input.mergeIntoId, input)) ?? input.mergeIntoId;
    await attachIdentities(survivorId, input);
    const name = input.keepName ?? input.name;
    if (name && !isUnknownName(name)) {
      await prisma.customer.update({
        where: { id: survivorId },
        data: { name },
      });
    }
    return loadCustomerShaped(survivorId);
  }

  if (!input.force) {
    const matches = await findMatchingCustomers(input);
    if (matches.length) {
      return { needsMerge: true as const, matches };
    }
  }

  // Shopify first (same as inbound): may return existing CEP or create with WA+email
  const shopifySurvivor = await applyShopifyCrossChannelLikeInbound(null, input);
  if (shopifySurvivor) {
    await attachIdentities(shopifySurvivor, input);
    if (input.name && !isUnknownName(input.name)) {
      await prisma.customer.update({
        where: { id: shopifySurvivor },
        data: { name: input.name },
      });
    }
    return loadCustomerShaped(shopifySurvivor);
  }

  const customer = await prisma.customer.create({
    data: {
      id: ulid(),
      name: input.name?.trim() || null,
      resolved: false,
      metadata: {},
    },
  });
  await attachIdentities(customer.id, input);
  return loadCustomerShaped(customer.id);
}

export async function updateCustomer(
  id: string,
  input: {
    name?: string | null;
    emails?: string[];
    whatsappIds?: string[];
    instagramId?: string | null;
    facebookId?: string | null;
    mergeIntoId?: string;
    keepName?: string | null;
    force?: boolean;
    tag?: string | null;
  },
) {
  if (input.mergeIntoId && input.mergeIntoId !== id) {
    await absorbCustomer(id, input.mergeIntoId);
    await attachIdentities(input.mergeIntoId, input);
    const survivorId =
      (await applyShopifyCrossChannelLikeInbound(input.mergeIntoId, input)) ?? input.mergeIntoId;
    await attachIdentities(survivorId, input);
    await syncIdentitiesToSubmitted(survivorId, input);
    const name = input.keepName ?? input.name;
    if (name && !isUnknownName(name)) {
      await prisma.customer.update({
        where: { id: survivorId },
        data: { name },
      });
    } else if (input.keepName) {
      await prisma.customer.update({
        where: { id: survivorId },
        data: { name: input.keepName },
      });
    }
    await recomputeCustomerResolved(survivorId);
    return loadCustomerShaped(survivorId);
  }

  if (!input.force) {
    const matches = await findMatchingCustomers(input);
    const other = matches.filter((m) => m.id !== id);
    if (other.length) {
      return { needsMerge: true as const, matches: other };
    }
  }

  if (input.name !== undefined || input.tag !== undefined) {
    await prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.tag !== undefined ? { tag: input.tag } : {}),
      },
    });
  }
  await attachIdentities(id, input);
  const survivorId = (await applyShopifyCrossChannelLikeInbound(id, input)) ?? id;
  if (survivorId !== id) {
    await attachIdentities(survivorId, input);
  }
  // Agent edit wins: drop identities they removed (incl. Shopify re-attached ones).
  await syncIdentitiesToSubmitted(survivorId, input);
  await recomputeCustomerResolved(survivorId);
  return loadCustomerShaped(survivorId);
}

export async function mergeCustomers(input: {
  targetId: string;
  sourceIds: string[];
  keepName: string;
}) {
  for (const sourceId of input.sourceIds) {
    if (sourceId === input.targetId) continue;
    await absorbCustomer(sourceId, input.targetId);
  }
  await prisma.customer.update({
    where: { id: input.targetId },
    data: { name: input.keepName },
  });
  await recomputeCustomerResolved(input.targetId);
  return loadCustomerShaped(input.targetId);
}

/**
 * Delete a customer and all related chats across channels.
 * Channel identity rows cascade via Prisma; messages are deleted explicitly
 * (Message has no FK relation). Inbound external ids are tombstoned so sync
 * cannot recreate threads for the same addresses.
 */
export async function deleteCustomer(customerId: string): Promise<{
  ok: true;
  deletedMessages: number;
}> {
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing) throw new Error("Customer not found");

  const messages = await prisma.message.findMany({
    where: { customerId },
    select: { channelType: true, externalId: true },
  });

  const byChannel = new Map<ChannelType, string[]>();
  for (const m of messages) {
    if (!m.externalId) continue;
    const list = byChannel.get(m.channelType) ?? [];
    list.push(m.externalId);
    byChannel.set(m.channelType, list);
  }
  for (const [channelType, externalIds] of byChannel) {
    await suppressInboundIds({
      channelType,
      externalIds,
      customerId,
      reason: "customer_deleted",
    });
  }

  const deleted = await prisma.message.deleteMany({ where: { customerId } });
  await prisma.suppressedInbound.updateMany({
    where: { customerId },
    data: { customerId: null },
  });
  // Cascades whatsapp / instagram / email / facebook channel identity rows
  await prisma.customer.delete({ where: { id: customerId } });

  return { ok: true, deletedMessages: deleted.count };
}

export async function bulkImportContacts(contacts: Array<{
  name?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  facebook?: string;
}>): Promise<{ imported: number; updated: number; failed: number; errors: string[] }> {
  let imported = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const row = contacts[i];
    const name = row.name?.trim() || null;
    const whatsappId = row.whatsapp?.trim();
    const email = row.email?.trim();
    const instagramId = row.instagram?.trim();
    const facebookId = row.facebook?.trim();

    if (!name && !whatsappId && !email && !instagramId && !facebookId) {
      continue; // Skip empty rows
    }

    try {
      const emails = email ? [email] : [];
      const whatsappIds = whatsappId ? [whatsappId] : [];

      const matches = await findMatchingCustomers({
        emails,
        whatsappIds,
        instagramId,
        facebookId,
      });

      if (matches.length > 0) {
        const targetId = matches[0].id;
        await attachIdentities(targetId, {
          emails,
          whatsappIds,
          instagramId,
          facebookId,
        });
        if (name && !isUnknownName(name)) {
          await prisma.customer.update({
            where: { id: targetId },
            data: { name },
          });
        }
        await recomputeCustomerResolved(targetId);
        updated++;
      } else {
        await createCustomer({
          name,
          emails,
          whatsappIds,
          instagramId,
          facebookId,
          force: true,
        });
        imported++;
      }
    } catch (err: any) {
      failed++;
      errors.push(`Row ${i + 1} (${name || email || whatsappId || facebookId || "Unnamed"}): ${err.message}`);
    }
  }

  return { imported, updated, failed, errors };
}
