import { isShopifyConfigured, resolveShopifyCredentials } from "./shopify.client.js";
import { ShopifyOrderProvider } from "./shopify.provider.js";
import { linkShopifyChannelsToCustomer } from "./shopify-contact.service.js";
import type {
  CustomerCommerceResponse,
  OrderLookupQuery,
  OrdersResponse,
} from "./types.js";

function buildStatsFromOrders(orders: OrdersResponse["orders"]): CustomerCommerceResponse["stats"] {
  const totalOrders = orders.length;
  const lifetimeValue = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
  return {
    totalOrders,
    lifetimeValue,
    averageOrderValue: totalOrders ? Math.round(lifetimeValue / totalOrders) : 0,
    delivered: orders.filter((o) => /deliver/i.test(o.status)).length,
    shipped: orders.filter((o) => /ship|out for/i.test(o.status)).length,
    cancelled: orders.filter((o) => /cancel|return/i.test(o.status)).length,
    placed: orders.filter((o) => /place|confirm/i.test(o.status)).length,
    currency: orders[0]?.currency || "INR",
  };
}

/**
 * Application-facing order / commerce service.
 * Uses Shopify when shopify_config is set in DB. Never invents mock commerce.
 */
export class OrderService {
  private shopify = new ShopifyOrderProvider();

  async getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse> {
    if (!(await isShopifyConfigured())) return { orders: [] };
    return this.shopify.getOrdersForCustomer({
      email: query.email ?? undefined,
      phone: query.phone ?? undefined,
    });
  }

  async getCustomerCommerce(
    query: OrderLookupQuery & { customerId?: string | null },
  ): Promise<CustomerCommerceResponse & { channelsLinked?: boolean }> {
    if (!(await isShopifyConfigured())) {
      return {
        provider: "none",
        customer: null,
        stats: buildStatsFromOrders([]),
        orders: [],
      };
    }
    const commerce = await this.shopify.getCustomerCommerce({
      email: query.email ?? undefined,
      phone: query.phone ?? undefined,
    });

    let channelsLinked = false;
    const customerId = query.customerId?.trim();
    if (customerId && commerce.customer) {
      try {
        const link = await linkShopifyChannelsToCustomer(customerId, {
          email: commerce.customer.email || query.email,
          phone: commerce.customer.phone || query.phone,
        });
        channelsLinked = link.changed;
      } catch (err) {
        console.warn(
          "[commerce] shopify channel link skipped:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { ...commerce, channelsLinked };
  }

  async isLive(): Promise<boolean> {
    return isShopifyConfigured();
  }

  async shopDomain(): Promise<string> {
    const creds = await resolveShopifyCredentials();
    return creds ? `${creds.shop}.myshopify.com` : "";
  }
}

export const orderService = new OrderService();
export const shopifyOrderProvider = new ShopifyOrderProvider();

export type {
  OrderLookupQuery,
  OrdersResponse,
  CustomerOrder,
  OrderItem,
  CustomerCommerceResponse,
  OrderStats,
  ShopifyCustomerSummary,
} from "./types.js";
