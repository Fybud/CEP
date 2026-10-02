import type {
  CustomerCommerceResponse,
  CustomerOrder,
  OrderItem,
  OrderLookupQuery,
  OrderProvider,
  OrdersResponse,
  ShopifyCustomerSummary,
} from "./types.js";
import {
  isShopifyConfigured,
  normalizePhoneDigits,
  shopifyAdminFetch,
  toE164Phone,
} from "./shopify.client.js";

type ShopifyCustomer = {
  id: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  orders_count?: number;
  total_spent?: string;
  currency?: string;
  default_address?: {
    city?: string | null;
    province?: string | null;
    country?: string | null;
  } | null;
};

type ShopifyLineItem = {
  title?: string;
  name?: string;
  quantity?: number;
};

type ShopifyOrder = {
  id: number | string;
  name?: string;
  order_number?: number;
  created_at?: string;
  total_price?: string;
  currency?: string;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  cancelled_at?: string | null;
  line_items?: ShopifyLineItem[];
};

function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function mapOrderStatus(order: ShopifyOrder): string {
  if (order.cancelled_at) return "Cancelled";
  const financial = (order.financial_status ?? "").toLowerCase();
  const fulfillment = (order.fulfillment_status ?? "").toLowerCase();
  if (financial === "refunded" || financial === "voided") return "Returned";
  if (fulfillment === "fulfilled") return "Delivered";
  if (fulfillment === "partial") return "Shipped";
  if (fulfillment === "in_transit" || fulfillment === "out_for_delivery") {
    return fulfillment === "out_for_delivery" ? "Out for Delivery" : "Shipped";
  }
  if (financial === "paid" || financial === "partially_paid") return "Confirmed";
  return "Placed";
}

function mapOrder(order: ShopifyOrder): CustomerOrder {
  const items: OrderItem[] = (order.line_items ?? []).map((li) => ({
    name: String(li.title || li.name || "Item"),
    quantity: Number(li.quantity ?? 1) || 1,
  }));
  const created = order.created_at ? new Date(order.created_at) : new Date();
  const date = Number.isNaN(created.getTime())
    ? new Date().toISOString().slice(0, 10)
    : created.toISOString().slice(0, 10);
  return {
    orderId: String(order.name || order.order_number || order.id).replace(/^#/, ""),
    status: mapOrderStatus(order),
    amount: Number(order.total_price ?? 0) || 0,
    currency: order.currency || "INR",
    date,
    items,
  };
}

function summarizeCustomer(c: ShopifyCustomer): ShopifyCustomerSummary {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  const addr = c.default_address;
  const location = [addr?.city, addr?.province, addr?.country].filter(Boolean).join(", ");
  return {
    id: String(c.id),
    name: name || null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    ordersCount: Number(c.orders_count ?? 0) || 0,
    totalSpent: Number(c.total_spent ?? 0) || 0,
    currency: c.currency || "INR",
    location: location || null,
  };
}

function buildStats(orders: CustomerOrder[], customer?: ShopifyCustomerSummary | null) {
  const totalOrders = Math.max(orders.length, customer?.ordersCount ?? 0);
  const lifetimeValue =
    customer?.totalSpent && customer.totalSpent > 0
      ? customer.totalSpent
      : orders.reduce((sum, o) => sum + (o.amount || 0), 0);
  const delivered = orders.filter((o) => /deliver/i.test(o.status)).length;
  const shipped = orders.filter((o) => /ship|out for/i.test(o.status)).length;
  const cancelled = orders.filter((o) => /cancel|return/i.test(o.status)).length;
  const placed = orders.filter((o) => /place|confirm/i.test(o.status)).length;
  return {
    totalOrders,
    lifetimeValue,
    averageOrderValue: totalOrders ? Math.round(lifetimeValue / totalOrders) : 0,
    delivered,
    shipped,
    cancelled,
    placed,
    currency: customer?.currency || orders[0]?.currency || "INR",
  };
}

export class ShopifyOrderProvider implements OrderProvider {
  readonly name = "shopify";

  async findCustomer(query: OrderLookupQuery): Promise<ShopifyCustomer | null> {
    const email = normalizeEmail(query.email);
    const phoneE164 = toE164Phone(query.phone);
    const phoneDigits = normalizePhoneDigits(query.phone);

    const clauses: string[] = [];
    if (email) clauses.push(`email:${email}`);
    if (phoneE164) clauses.push(`phone:${phoneE164}`);
    if (phoneDigits && phoneDigits !== phoneE164?.replace(/\D/g, "")) {
      clauses.push(`phone:${phoneDigits}`);
    }
    if (!clauses.length) return null;

    // Try each clause; Shopify search AND/OR is picky.
    for (const q of clauses) {
      const data = await shopifyAdminFetch<{ customers?: ShopifyCustomer[] }>(
        `/customers/search.json?query=${encodeURIComponent(q)}&limit=5`,
      );
      const customers = data.customers ?? [];
      if (!customers.length) continue;

      if (email) {
        const byEmail = customers.find(
          (c) => normalizeEmail(c.email) === email,
        );
        if (byEmail) return byEmail;
      }
      if (phoneDigits) {
        const byPhone = customers.find((c) => {
          const d = normalizePhoneDigits(c.phone);
          return d && (d === phoneDigits || d.endsWith(phoneDigits) || phoneDigits.endsWith(d));
        });
        if (byPhone) return byPhone;
      }
      return customers[0] ?? null;
    }
    return null;
  }

  /** Read-only: look up existing Shopify customer. Never creates or updates in Shopify. */
  async findExistingCustomer(input: {
    email?: string | null;
    phone?: string | null;
  }): Promise<ShopifyCustomer | null> {
    if (!(await isShopifyConfigured())) return null;
    return this.findCustomer({
      email: input.email,
      phone: input.phone,
    });
  }

  async getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse> {
    const commerce = await this.getCustomerCommerce(query);
    return { orders: commerce.orders };
  }

  async getCustomerCommerce(query: OrderLookupQuery): Promise<CustomerCommerceResponse> {
    if (!(await isShopifyConfigured())) {
      return {
        provider: "none",
        customer: null,
        stats: buildStats([]),
        orders: [],
      };
    }

    const found = await this.findCustomer(query);
    let orders: CustomerOrder[] = [];
    let customer: ShopifyCustomerSummary | null = found
      ? summarizeCustomer(found)
      : null;

    if (found) {
      try {
        const data = await shopifyAdminFetch<{ orders?: ShopifyOrder[] }>(
          `/customers/${found.id}/orders.json?status=any&limit=20`,
        );
        orders = (data.orders ?? []).map(mapOrder);
      } catch {
        // Fallback: search orders by email
        const email = normalizeEmail(query.email) || normalizeEmail(found.email);
        if (email) {
          const data = await shopifyAdminFetch<{ orders?: ShopifyOrder[] }>(
            `/orders.json?status=any&email=${encodeURIComponent(email)}&limit=20`,
          );
          orders = (data.orders ?? []).map(mapOrder);
        }
      }
    }

    orders.sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      provider: "shopify",
      customer,
      stats: buildStats(orders, customer),
      orders,
    };
  }
}
