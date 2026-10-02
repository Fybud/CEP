import { ulid } from "ulid";
import { prisma } from "../../config/db.js";
import {
  formatWhatsAppStorage,
  normalizeWhatsAppDigits,
  whatsappDigitsEqual,
} from "../../utils/phone.js";
import { resolveShopifyCredentials } from "./shopify.client.js";
import { shopifyOrderProvider } from "./order.service.js";
import { recomputeCustomerResolved } from "../ResolveService.js";

type InboundChannel = "whatsapp" | "email";

async function findCepCustomerIdByEmail(email: string): Promise<string | null> {
  const em = await prisma.emailChannel.findUnique({ where: { externalId: email } });
  return em?.customerId ?? null;
}

async function findCepCustomerIdByPhone(phoneDigits: string): Promise<string | null> {
  const formatted = formatWhatsAppStorage(phoneDigits);
  const suffix = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
  const candidates = await prisma.whatsAppChannel.findMany({
    where: {
      OR: [
        { externalId: phoneDigits },
        { externalId: `+${phoneDigits}` },
        ...(formatted ? [{ externalId: formatted }] : []),
        { externalId: { endsWith: suffix } },
      ],
    },
    take: 25,
  });
  const wa = candidates.find((c) => whatsappDigitsEqual(c.externalId, phoneDigits));
  return wa?.customerId ?? null;
}

async function ensureEmailIdentity(customerId: string, email: string): Promise<boolean> {
  const em = await prisma.emailChannel.findUnique({ where: { externalId: email } });
  if (!em) {
    await prisma.emailChannel.create({
      data: {
        id: ulid(),
        customerId,
        externalId: email,
        // Ghost until first real message — must not inflate Unresolved badge.
        resolved: true,
        metadata: { source: "shopify" },
      },
    });
    return true;
  }
  if (em.customerId === customerId) return false;
  // Merge onto the target customer (identity already existed on another row)
  await prisma.message.updateMany({
    where: { channelType: "email", channelId: em.id },
    data: { customerId },
  });
  await prisma.emailChannel.update({
    where: { id: em.id },
    data: { customerId },
  });
  await recomputeCustomerResolved(em.customerId);
  return true;
}

async function ensureWhatsAppIdentity(customerId: string, phoneDigits: string): Promise<boolean> {
  const formatted = formatWhatsAppStorage(phoneDigits) ?? phoneDigits;
  const suffix = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
  const candidates = await prisma.whatsAppChannel.findMany({
    where: {
      OR: [
        { externalId: formatted },
        { externalId: phoneDigits },
        { externalId: `+${phoneDigits}` },
        { externalId: { endsWith: suffix } },
      ],
    },
    take: 25,
  });
  const wa =
    candidates.find((c) => whatsappDigitsEqual(c.externalId, phoneDigits)) ?? null;

  if (!wa) {
    await prisma.whatsAppChannel.create({
      data: {
        id: ulid(),
        customerId,
        externalId: formatted,
        resolved: true,
        metadata: { source: "shopify" },
      },
    });
    return true;
  }
  if (wa.customerId !== customerId) {
    await prisma.message.updateMany({
      where: { channelType: "whatsapp", channelId: wa.id },
      data: { customerId },
    });
    await prisma.whatsAppChannel.update({
      where: { id: wa.id },
      data: { customerId, externalId: formatted },
    });
    await recomputeCustomerResolved(wa.customerId);
    return true;
  }
  if (wa.externalId !== formatted) {
    await prisma.whatsAppChannel.update({
      where: { id: wa.id },
      data: { externalId: formatted },
    });
    return true;
  }
  return false;
}

/**
 * Read-only Shopify cross-channel linking for inbound Email / WhatsApp.
 *
 * WhatsApp inbound:
 *   Shopify lookup by phone → get email → if CEP has that email, merge onto it;
 *   else create CEP customer with Shopify email + WhatsApp.
 *
 * Email inbound:
 *   Shopify lookup by email → get phone → if CEP has that WhatsApp, merge onto it;
 *   else create CEP customer with Shopify email + WhatsApp.
 *
 * When `preferredCustomerId` is set (existing CEP thread), never create a new
 * customer — attach Shopify email/phone onto that row instead.
 *
 * CEP id ≠ Shopify id — we never match on Shopify customer id.
 */
export async function enrichCustomerFromShopify(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Which channel triggered this inbound — drives cross-match direction. */
  inboundChannel: InboundChannel;
  /** Existing CEP customer to keep; skip create + keep identities on this row. */
  preferredCustomerId?: string | null;
}): Promise<{ customerId: string; created: boolean; shopifyCustomerId?: string; changed?: boolean } | null> {
  const creds = await resolveShopifyCredentials();
  if (!creds) return null;
  if (!input.email && !input.phone) return null;

  try {
    const shopify = await shopifyOrderProvider.findExistingCustomer({
      email: input.inboundChannel === "email" ? input.email : undefined,
      phone: input.inboundChannel === "whatsapp" ? input.phone : undefined,
    });
    // Fallback: if channel-specific search misses, try with whatever we have
    const shopifyHit =
      shopify ??
      (await shopifyOrderProvider.findExistingCustomer({
        email: input.email,
        phone: input.phone,
      }));
    if (!shopifyHit) return null;

    const shopifyName = [shopifyHit.first_name, shopifyHit.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const shopifyEmail =
      shopifyHit.email?.trim().toLowerCase() || input.email?.trim().toLowerCase() || null;
    const shopifyPhoneDigits =
      normalizeWhatsAppDigits(shopifyHit.phone) || normalizeWhatsAppDigits(input.phone);

    if (!shopifyEmail && !shopifyPhoneDigits) return null;

    let customerId: string | null = input.preferredCustomerId?.trim() || null;
    let createdLocal = false;

    if (!customerId) {
      if (input.inboundChannel === "whatsapp") {
        // Cross-match: use Shopify email to find existing CEP customer
        if (shopifyEmail) customerId = await findCepCustomerIdByEmail(shopifyEmail);
      } else {
        // Cross-match: use Shopify phone to find existing CEP customer
        if (shopifyPhoneDigits) customerId = await findCepCustomerIdByPhone(shopifyPhoneDigits);
      }
    }

    if (!customerId) {
      const created = await prisma.customer.create({
        data: {
          id: ulid(),
          name: shopifyName || input.name || null,
          resolved: false,
          metadata: {},
        },
      });
      customerId = created.id;
      createdLocal = true;
    } else {
      const existing = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!existing) return null;
      const nextName =
        !existing.name || existing.name === "Unknown"
          ? shopifyName || input.name || existing.name
          : existing.name;
      if (nextName !== existing.name) {
        await prisma.customer.update({
          where: { id: customerId },
          data: { name: nextName },
        });
      }
    }

    // Always attach both channels from Shopify when available (merge or new)
    let changed = false;
    if (shopifyEmail) changed = (await ensureEmailIdentity(customerId, shopifyEmail)) || changed;
    if (shopifyPhoneDigits) {
      changed = (await ensureWhatsAppIdentity(customerId, shopifyPhoneDigits)) || changed;
    }

    await recomputeCustomerResolved(customerId);
    console.log(
      `[shopify] ${input.inboundChannel} inbound → customer=${customerId} shopify=${shopifyHit.id} new=${createdLocal} preferred=${input.preferredCustomerId ?? "-"} changed=${changed} email=${shopifyEmail ?? "-"} phone=${shopifyPhoneDigits ? formatWhatsAppStorage(shopifyPhoneDigits) : "-"}`,
    );
    return {
      customerId,
      created: createdLocal,
      shopifyCustomerId: String(shopifyHit.id),
      changed,
    };
  } catch (err) {
    console.warn("[shopify] enrich failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Attach Shopify email/phone onto an existing CEP customer (no new customer).
 * Used when opening the inbox panel and on repeat inbound for known identities.
 */
export async function linkShopifyChannelsToCustomer(
  customerId: string,
  input: {
    email?: string | null;
    phone?: string | null;
  },
): Promise<{ linked: boolean; changed: boolean; email?: string | null; phone?: string | null }> {
  const hasEmail = Boolean(input.email?.trim());
  const hasPhone = Boolean(input.phone?.trim());
  if (!hasEmail && !hasPhone) return { linked: false, changed: false };

  const result = await enrichCustomerFromShopify({
    email: input.email,
    phone: input.phone,
    inboundChannel: hasPhone ? "whatsapp" : "email",
    preferredCustomerId: customerId,
  });

  if (!result) return { linked: false, changed: false };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { emailIdentities: true, whatsappIdentities: true },
  });

  return {
    linked: true,
    changed: Boolean(result.changed),
    email: customer?.emailIdentities[0]?.externalId ?? null,
    phone: customer?.whatsappIdentities[0]?.externalId ?? null,
  };
}

/** @deprecated use enrichCustomerFromShopify */
export async function enrichContactFromShopify(contactId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: contactId },
    include: { emailIdentities: true, whatsappIdentities: true },
  });
  if (!customer) return;
  const hasEmail = Boolean(customer.emailIdentities[0]?.externalId);
  await enrichCustomerFromShopify({
    name: customer.name,
    email: customer.emailIdentities[0]?.externalId,
    phone: customer.whatsappIdentities[0]?.externalId,
    inboundChannel: hasEmail ? "email" : "whatsapp",
  });
}
