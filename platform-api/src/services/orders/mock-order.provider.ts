import type { CustomerOrder, OrderLookupQuery, OrderProvider, OrdersResponse } from "./types.js";

/**
 * In-memory mock ecommerce provider.
 * Replace with Shopify / WooCommerce / custom D2C API without changing OrderService.
 */
const MOCK_ORDERS: Array<CustomerOrder & { emails: string[]; phones: string[] }> = [
  {
    orderId: "ORD-10234",
    status: "Delivered",
    amount: 1499,
    currency: "INR",
    date: "2026-08-05",
    emails: ["thanish@gmail.com", "support@example.com"],
    phones: ["919876543210", "+919876543210", "9876543210"],
    items: [
      { name: "Product A", quantity: 2 },
      { name: "Product B", quantity: 1 },
    ],
  },
  {
    orderId: "ORD-10188",
    status: "Shipped",
    amount: 899,
    currency: "INR",
    date: "2026-08-01",
    emails: ["thanish@gmail.com"],
    phones: ["919876543210", "+919876543210"],
    items: [{ name: "Herbal Tea Pack", quantity: 1 }],
  },
  {
    orderId: "ORD-9981",
    status: "Placed",
    amount: 2499,
    currency: "INR",
    date: "2026-07-28",
    emails: ["priya@example.com"],
    phones: ["918888777666", "+918888777666"],
    items: [
      { name: "Wellness Kit", quantity: 1 },
      { name: "Travel Pouch", quantity: 1 },
    ],
  },
];

function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  // Compare on last 10 digits for IN mobile numbers
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb || a.replace(/\D/g, "").endsWith(nb) || b.replace(/\D/g, "").endsWith(na);
}

export class MockOrderProvider implements OrderProvider {
  readonly name = "mock";

  async getOrdersForCustomer(query: OrderLookupQuery): Promise<OrdersResponse> {
    const email = normalizeEmail(query.email);
    const phone = normalizePhone(query.phone);

    if (!email && !phone) {
      return { orders: [] };
    }

    const orders = MOCK_ORDERS.filter((order) => {
      const emailHit = email
        ? order.emails.some((e) => normalizeEmail(e) === email)
        : false;
      const phoneHit = phone
        ? order.phones.some((p) => phonesMatch(p, phone))
        : false;
      return emailHit || phoneHit;
    }).map(({ emails: _e, phones: _p, ...order }) => order);

    orders.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { orders };
  }
}
