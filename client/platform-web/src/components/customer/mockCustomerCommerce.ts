/** Demo ecommerce context for the agent sidebar (replace with live OMS later). */

export type OrderStatusKey =
  | "delivered"
  | "rto"
  | "cancelled"
  | "in_transit"
  | "placed"
  | "exchanged";

export type MockOrderRow = {
  orderId: string;
  placedOn: string;
  status: string;
  statusKey: OrderStatusKey;
  amount: number;
  payment: string;
  items: string;
  city: string;
};

export type MockOrderStats = {
  totalOrders: number;
  delivered: number;
  rto: number;
  cancelled: number;
  inTransit: number;
  exchanged: number;
  lifetimeValue: number;
  avgOrderValue: number;
  rtoRate: number;
  lastOrderDaysAgo: number;
};

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h || 1;
}

function pick<T>(seed: number, arr: T[], offset = 0): T {
  return arr[(seed + offset) % arr.length]!;
}

const CITIES = ["Bengaluru", "Hyderabad", "Mumbai", "Delhi NCR", "Pune", "Chennai"];
const PRODUCTS = [
  "Ashwagandha Capsules",
  "Vitamin C Serum",
  "Herbal Tea Combo",
  "Protein Bar Box",
  "Skin Glow Kit",
  "Daily Essentials Pack",
];

export function buildMockCustomerCommerce(contactKey: string): {
  stats: MockOrderStats;
  orders: MockOrderRow[];
} {
  const seed = hashSeed(contactKey || "guest");
  const delivered = 3 + (seed % 5);
  const rto = seed % 3;
  const cancelled = seed % 2;
  const inTransit = 1 + (seed % 2);
  const exchanged = seed % 2;
  const totalOrders = delivered + rto + cancelled + inTransit + exchanged;
  const lifetimeValue = 4200 + (seed % 9000);
  const avgOrderValue = Math.round(lifetimeValue / Math.max(totalOrders, 1));

  const statuses: Array<{ status: string; statusKey: OrderStatusKey }> = [
    { status: "Delivered", statusKey: "delivered" },
    { status: "In transit", statusKey: "in_transit" },
    { status: "RTO", statusKey: "rto" },
    { status: "Delivered", statusKey: "delivered" },
    { status: "Cancelled", statusKey: "cancelled" },
    { status: "Exchanged", statusKey: "exchanged" },
  ];

  const orders: MockOrderRow[] = Array.from({ length: 5 }, (_, i) => {
    const s = pick(seed, statuses, i);
    const day = 1 + ((seed + i * 3) % 27);
    const month = 8 - (i % 3);
    const amount = 699 + ((seed + i * 137) % 3500);
    const qty = 1 + ((seed + i) % 3);
    const product = pick(seed, PRODUCTS, i);
    return {
      orderId: `ORD-${10240 - i * 17 - (seed % 40)}`,
      placedOn: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      status: s.status,
      statusKey: s.statusKey,
      amount,
      payment: (seed + i) % 2 === 0 ? "Prepaid" : "COD",
      items: qty > 1 ? `${product} × ${qty}` : product,
      city: pick(seed, CITIES, i),
    };
  });

  return {
    stats: {
      totalOrders,
      delivered,
      rto,
      cancelled,
      inTransit,
      exchanged,
      lifetimeValue,
      avgOrderValue,
      rtoRate: Math.round((rto / Math.max(totalOrders, 1)) * 100),
      lastOrderDaysAgo: 1 + (seed % 12),
    },
    orders,
  };
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatOrderDate(date: string): string {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return date;
  }
}
