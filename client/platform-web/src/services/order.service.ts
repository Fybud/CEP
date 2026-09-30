import { useAuthStore } from "../store/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface CustomerOrder {
  orderId: string;
  status: string;
  amount: number;
  currency?: string;
  date: string;
  items: OrderItem[];
}

export interface OrdersResponse {
  orders: CustomerOrder[];
}

export interface OrderLookupQuery {
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
}

export interface ShopifyCustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  ordersCount: number;
  totalSpent: number;
  currency: string;
  location: string | null;
}

export interface OrderStats {
  totalOrders: number;
  lifetimeValue: number;
  averageOrderValue: number;
  delivered: number;
  shipped: number;
  cancelled: number;
  placed: number;
  currency: string;
}

export interface CustomerCommerceResponse {
  provider: "shopify" | "mock" | "none";
  customer: ShopifyCustomerSummary | null;
  stats: OrderStats;
  orders: CustomerOrder[];
  channelsLinked?: boolean;
}

async function requestJson<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body) as { error?: string };
      throw new Error(parsed.error || body || "Request failed");
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(body || "Request failed");
      throw err;
    }
  }
  return res.json() as Promise<T>;
}

function queryString(query: OrderLookupQuery): string {
  const params = new URLSearchParams();
  if (query.email?.trim()) params.set("email", query.email.trim());
  if (query.phone?.trim()) params.set("phone", query.phone.trim());
  if (query.customerId?.trim()) params.set("customerId", query.customerId.trim());
  return params.toString();
}

/**
 * Frontend order service — only talks to the platform orders API.
 */
export const orderService = {
  getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse> {
    const qs = queryString(query);
    if (!qs) return Promise.resolve({ orders: [] });
    return requestJson<OrdersResponse>(`/api/v1/orders?${qs}`);
  },

  getCustomerCommerce(query: OrderLookupQuery): Promise<CustomerCommerceResponse> {
    const qs = queryString(query);
    if (!qs) {
      return Promise.resolve({
        provider: "none",
        customer: null,
        stats: {
          totalOrders: 0,
          lifetimeValue: 0,
          averageOrderValue: 0,
          delivered: 0,
          shipped: 0,
          cancelled: 0,
          placed: 0,
          currency: "INR",
        },
        orders: [],
      });
    }
    return requestJson<CustomerCommerceResponse>(`/api/v1/orders/commerce?${qs}`);
  },
};
