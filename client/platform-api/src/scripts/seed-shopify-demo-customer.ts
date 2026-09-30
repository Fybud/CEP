/**
 * One-off: ensure a Shopify customer exists for the CEP inbox contact identifiers
 * and create a few paid test orders so CustomerDetails can load live commerce.
 *
 * Usage: npx tsx src/scripts/seed-shopify-demo-customer.ts
 */
import "../config/load-env.js";
import { shopifyAdminFetch } from "../services/orders/shopify.client.js";
import { prisma } from "../config/db.js";

const EMAIL = "jjagadesh980@gmail.com";
const PHONE = "+916303481401";
const FIRST = "Moola";
const LAST = "Jagadeshwar Reddy";

type ShopifyCustomer = {
  id: number;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type ShopifyOrder = {
  id: number;
  name?: string;
  total_price?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
};

async function findCustomer(): Promise<ShopifyCustomer | null> {
  const byEmail = await shopifyAdminFetch<{ customers: ShopifyCustomer[] }>(
    `/customers/search.json?query=${encodeURIComponent(`email:${EMAIL}`)}&limit=1`,
  );
  if (byEmail.customers?.[0]) return byEmail.customers[0];

  const byPhone = await shopifyAdminFetch<{ customers: ShopifyCustomer[] }>(
    `/customers/search.json?query=${encodeURIComponent(`phone:${PHONE}`)}&limit=1`,
  );
  return byPhone.customers?.[0] ?? null;
}

async function ensureCustomer(): Promise<ShopifyCustomer> {
  const existing = await findCustomer();
  if (existing) {
    console.log(`[shopify-seed] customer exists id=${existing.id}`);
    // Keep phone/email aligned for CEP lookup
    const updated = await shopifyAdminFetch<{ customer: ShopifyCustomer }>(
      `/customers/${existing.id}.json`,
      {
        method: "PUT",
        body: JSON.stringify({
          customer: {
            id: existing.id,
            email: EMAIL,
            phone: PHONE,
            first_name: FIRST,
            last_name: LAST,
            verified_email: true,
          },
        }),
      },
    );
    return updated.customer;
  }

  const created = await shopifyAdminFetch<{ customer: ShopifyCustomer }>(`/customers.json`, {
    method: "POST",
    body: JSON.stringify({
      customer: {
        first_name: FIRST,
        last_name: LAST,
        email: EMAIL,
        phone: PHONE,
        verified_email: true,
        send_email_welcome: false,
        addresses: [
          {
            address1: "12 MG Road",
            city: "Bengaluru",
            province: "Karnataka",
            country: "India",
            zip: "560001",
            phone: PHONE,
            default: true,
          },
        ],
      },
    }),
  });
  console.log(`[shopify-seed] created customer id=${created.customer.id}`);
  return created.customer;
}

async function createDemoOrders(customerId: number) {
  const specs = [
    {
      note: "CEP demo — delivered",
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      created_at: new Date(Date.now() - 14 * 864e5).toISOString(),
      line_items: [
        { title: "FyBud Router Pro", price: "4999.00", quantity: 1 },
        { title: "Ethernet Cable 5m", price: "299.00", quantity: 2 },
      ],
    },
    {
      note: "CEP demo — shipped",
      financial_status: "paid",
      fulfillment_status: "partial",
      created_at: new Date(Date.now() - 5 * 864e5).toISOString(),
      line_items: [{ title: "Mesh Wi‑Fi Node", price: "3499.00", quantity: 1 }],
    },
    {
      note: "CEP demo — confirmed",
      financial_status: "paid",
      fulfillment_status: null,
      created_at: new Date(Date.now() - 1 * 864e5).toISOString(),
      line_items: [
        { title: "Annual Support Plan", price: "1999.00", quantity: 1 },
        { title: "Setup Kit", price: "499.00", quantity: 1 },
      ],
    },
  ] as const;

  const created: ShopifyOrder[] = [];
  for (const spec of specs) {
    const res = await shopifyAdminFetch<{ order: ShopifyOrder }>(`/orders.json`, {
      method: "POST",
      body: JSON.stringify({
        order: {
          customer: { id: customerId },
          email: EMAIL,
          phone: PHONE,
          financial_status: spec.financial_status,
          fulfillment_status: spec.fulfillment_status,
          send_receipt: false,
          send_fulfillment_receipt: false,
          inventory_behaviour: "bypass",
          note: spec.note,
          created_at: spec.created_at,
          currency: "INR",
          line_items: spec.line_items.map((li) => ({
            title: li.title,
            price: li.price,
            quantity: li.quantity,
            requires_shipping: true,
          })),
          billing_address: {
            first_name: FIRST,
            last_name: LAST,
            address1: "12 MG Road",
            city: "Bengaluru",
            province: "Karnataka",
            country: "India",
            zip: "560001",
            phone: PHONE,
          },
          shipping_address: {
            first_name: FIRST,
            last_name: LAST,
            address1: "12 MG Road",
            city: "Bengaluru",
            province: "Karnataka",
            country: "India",
            zip: "560001",
            phone: PHONE,
          },
          transactions: [
            {
              kind: "sale",
              status: "success",
              amount: String(
                spec.line_items.reduce((s, li) => s + Number(li.price) * li.quantity, 0),
              ),
            },
          ],
        },
      }),
    });
    created.push(res.order);
    console.log(
      `[shopify-seed] order ${res.order.name ?? res.order.id} total=${res.order.total_price} status=${res.order.financial_status}/${res.order.fulfillment_status ?? "unfulfilled"}`,
    );
  }
  return created;
}

async function main() {
  const cust = await ensureCustomer();
  const orders = await createDemoOrders(cust.id);
  console.log(
    JSON.stringify(
      {
        shopifyCustomerId: String(cust.id),
        email: EMAIL,
        phone: PHONE,
        ordersCreated: orders.map((o) => o.name ?? String(o.id)),
        hint: "Open Inbox for this contact → Customer context. CEP id stays local; Shopify id is separate.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error("[shopify-seed] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
