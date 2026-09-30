export type OrderStatus =
  | "Placed"
  | "Confirmed"
  | "Shipped"
  | "Out for Delivery"
  | "Delivered"
  | "Cancelled"
  | "Returned";

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface CustomerOrder {
  orderId: string;
  status: OrderStatus | string;
  amount: number;
  currency: string;
  date: string; // ISO date YYYY-MM-DD
  items: OrderItem[];
}

export interface OrdersResponse {
  orders: CustomerOrder[];
}

export interface OrderLookupQuery {
  email?: string | null;
  phone?: string | null;
  /** When set, Shopify email/phone are attached onto this CEP customer. */
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
  /** True when Shopify email/phone were linked onto the CEP customer. */
  channelsLinked?: boolean;
}

export interface OrderProvider {
  readonly name: string;
  getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse>;
  getCustomerCommerce?(query: OrderLookupQuery): Promise<CustomerCommerceResponse>;
}
