import { useState, type ReactNode, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Package,
  Truck,
  UserRound,
  X,
  XCircle,
  Ban,
} from "lucide-react";
import type { ChannelType, Contact, Conversation } from "../../api";
import { useBlockedContacts } from "../../api";
import {
  orderService,
  type CustomerCommerceResponse,
  type CustomerOrder,
  type OrderStats,
} from "../../services/order.service";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  CHANNELS,
  channelLabel,
  cn,
  contactDisplayName,
  formatIdentities,
  formatWhatsAppDisplay,
  identitiesFor,
  initials,
} from "./utils";

type Props = {
  contact: Contact | null;
  conversationsByChannel: Partial<Record<ChannelType, Conversation>>;
  onClose: () => void;
};

type TabId = "profile" | "stats" | "orders";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "stats", label: "Order stats" },
  { id: "orders", label: "Recent orders" },
];

function formatInr(amount: number, currency = "INR"): string {
  if (currency === "INR") return `₹${amount.toLocaleString("en-IN")}`;
  return `${currency} ${amount.toLocaleString()}`;
}

function formatOrderDate(date: string): string {
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

function listValues(primary: string | null | undefined, list?: string[] | null): string[] {
  if (list?.length) return list;
  return primary?.trim() ? [primary.trim()] : [];
}

function emptyCommerce(): CustomerCommerceResponse {
  return {
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
  };
}

export function CustomerDetails({ contact, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("profile");
  const queryClient = useQueryClient();
  const { data: blockedRows } = useBlockedContacts();
  const isContactBlocked =
    Boolean(contact?.blocked) ||
    Boolean(contact?.id && blockedRows?.some((row) => row.customerId === contact.id));

  const emails = listValues(contact?.email, contact?.emails);
  const whatsappRaw = listValues(
    contact?.whatsappId ?? contact?.identifiers?.whatsapp,
    contact?.whatsappIds,
  );
  const whatsappIds = whatsappRaw.map(formatWhatsAppDisplay);

  // Prefer raw identifiers for Shopify lookup (display formatting can confuse matchers)
  const lookupEmail = emails[0] ?? null;
  const lookupPhone = whatsappRaw[0] ?? contact?.whatsappId ?? null;
  const canLookup = Boolean(lookupEmail || lookupPhone);

  const {
    data: commerceData,
    isPending: commercePending,
    isError,
    error,
  } = useQuery({
    queryKey: ["customer-commerce", contact?.id, lookupEmail, lookupPhone],
    queryFn: () =>
      orderService.getCustomerCommerce({
        email: lookupEmail,
        phone: lookupPhone,
        customerId: contact?.id,
      }),
    enabled: Boolean(contact && canLookup),
    staleTime: 30_000,
  });

  const commerce = commerceData ?? emptyCommerce();

  // When Shopify attaches email/phone onto this CEP contact, refresh inbox identities
  useEffect(() => {
    if (!commerce.channelsLinked) return;
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
  }, [commerce.channelsLinked, queryClient]);

  useEffect(() => {
    setTab("profile");
  }, [contact?.id]);

  if (!contact) {
    return (
      <aside className="flex w-full h-full flex-col bg-card">
        <Header onClose={onClose} />
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <UserRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No customer selected</p>
          </div>
        </div>
      </aside>
    );
  }

  // Always show loader on contact switch until commerce resolves (or no lookup needed).
  if (canLookup && commercePending) {
    return (
      <aside className="flex w-full h-full flex-col bg-card">
        <Header onClose={onClose} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading customer data…</p>
        </div>
      </aside>
    );
  }

  const name = commerce.customer?.name?.trim() || contactDisplayName(contact);
  const ltv = commerce.stats.lifetimeValue;
  const orderCount = commerce.stats.totalOrders;
  const shopifyCustomerId = commerce.customer?.id ?? null;

  return (
    <aside className="flex w-full h-full flex-col bg-card">
      <Header onClose={onClose} />

      <div className="border-b border-border px-4 pb-4 pt-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
              {initials(name)}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">{name}</h4>
              {isContactBlocked ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  <Ban className="h-3 w-3" />
                  Blocked
                </span>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {shopifyCustomerId
                ? `Shopify #${shopifyCustomerId}`
                : emails[0] || whatsappIds[0] || "No contact identifiers"}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {`LTV ${formatInr(ltv, commerce.stats.currency)} · ${orderCount} orders`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "w-full rounded-lg px-1.5 py-2 text-center text-[10px] font-semibold transition-all",
                tab === item.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-background px-4 py-4">
        {!canLookup && (
          <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            Add an email or WhatsApp number to look up Shopify orders.
          </p>
        )}
        {canLookup && isError && (
          <p className="mb-3 rounded-lg border border-border px-3 py-3 text-xs text-red-600">
            {(error as Error)?.message || "Failed to load Shopify data"}
          </p>
        )}

        {tab === "profile" && (
          <ProfileTab
            contact={contact}
            emails={emails}
            whatsappIds={whatsappIds}
            shopify={commerce.customer}
            provider={commerce.provider}
          />
        )}
        {tab === "stats" && <StatsTab stats={commerce.stats} />}
        {tab === "orders" && (
          <div className="space-y-3">
            {commerce.orders.length > 0 ? (
              <OrdersTable orders={commerce.orders} currency={commerce.stats.currency} />
            ) : (
              <p className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
                No orders found for this customer.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card px-4 py-2.5">
        <p className="text-center text-[10px] text-muted-foreground">
          {commerce.provider === "shopify"
            ? "Order data from Shopify"
            : "Shopify is not connected"}
        </p>
      </div>
    </aside>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Customer</h3>
        <p className="text-[11px] text-muted-foreground">Profile and orders</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onClose}
        aria-label="Close customer panel"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ProfileTab({
  contact,
  emails,
  whatsappIds,
  shopify,
  provider,
}: {
  contact: Contact;
  emails: string[];
  whatsappIds: string[];
  shopify: CustomerCommerceResponse["customer"];
  provider: CustomerCommerceResponse["provider"];
}) {
  const rows = [
    {
      label: "Shopify customer ID",
      value: shopify?.id || (provider === "shopify" ? "Not found in Shopify" : "—"),
    },
    { label: "Name", value: shopify?.name || contact.name || "—" },
    {
      label: "Email",
      value: shopify?.email || (emails.length ? emails.join(", ") : "—"),
    },
    {
      label: "Phone",
      value: shopify?.phone || (whatsappIds.length ? whatsappIds.join(", ") : "—"),
    },
    { label: "Location", value: shopify?.location || "—" },
    { label: "Contact ID", value: contact.id },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle icon={<UserRound className="h-3.5 w-3.5" />} title="Shopify profile" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.label} className={cn(idx !== rows.length - 1 && "border-b border-border")}>
                <th className="w-[42%] px-3 py-2.5 font-medium text-muted-foreground">{row.label}</th>
                <td className="break-all px-3 py-2.5 font-medium text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle icon={<Mail className="h-3.5 w-3.5" />} title="Connected channels" />
      <div className="space-y-2">
        {CHANNELS.map((channel) => {
          const ids = identitiesFor(contact, channel.id);
          if (!ids.length) return null;
          return (
            <div key={channel.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {channelLabel(channel.id)}
                </span>
              </div>
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {formatIdentities(ids, channel.id)}
              </p>
            </div>
          );
        })}
        {CHANNELS.every((c) => !identitiesFor(contact, c.id).length) && (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No channel identities linked yet.
          </p>
        )}
      </div>
    </div>
  );
}

function StatsTab({ stats }: { stats: OrderStats }) {
  const metrics = [
    {
      label: "Delivered",
      value: stats.delivered,
      hint: "Fulfilled",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
    },
    {
      label: "Shipped",
      value: stats.shipped,
      hint: "In transit",
      icon: <Truck className="h-3.5 w-3.5 text-sky-600" />,
    },
    {
      label: "Cancelled",
      value: stats.cancelled,
      hint: "Refunded / void",
      icon: <XCircle className="h-3.5 w-3.5 text-rose-600" />,
    },
    {
      label: "Placed",
      value: stats.placed,
      hint: "Open / confirmed",
      icon: <Package className="h-3.5 w-3.5 text-amber-600" />,
    },
    {
      label: "Total",
      value: stats.totalOrders,
      hint: "All time",
      icon: <Package className="h-3.5 w-3.5 text-muted-foreground" />,
    },
  ];

  const summaryRows = [
    { label: "Lifetime value", value: formatInr(stats.lifetimeValue, stats.currency) },
    { label: "Avg order value", value: formatInr(stats.averageOrderValue, stats.currency) },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle icon={<Package className="h-3.5 w-3.5" />} title="Order performance" />
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.label}
              </span>
              {m.icon}
            </div>
            <p className="text-xl font-semibold tracking-tight text-foreground">{m.value}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{m.hint}</p>
          </div>
        ))}
      </div>

      <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />} title="Commerce summary" />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-xs">
          <tbody>
            {summaryRows.map((row, idx) => (
              <tr key={row.label} className={cn(idx !== summaryRows.length - 1 && "border-b border-border")}>
                <td className="px-3 py-2.5 text-muted-foreground">{row.label}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersTable({
  orders,
  currency,
}: {
  orders: CustomerOrder[];
  currency: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className="px-3 py-2 font-semibold text-muted-foreground">Order</th>
            <th className="px-3 py-2 font-semibold text-muted-foreground">Status</th>
            <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => (
            <tr
              key={order.orderId}
              className={cn(idx !== orders.length - 1 && "border-b border-border")}
            >
              <td className="px-3 py-2.5 align-top">
                <p className="font-semibold text-foreground">#{order.orderId}</p>
                <p className="text-[10px] text-muted-foreground">{formatOrderDate(order.date)}</p>
                <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                  {order.items.map((i) => i.name).join(", ") || "—"}
                </p>
              </td>
              <td className="px-3 py-2.5 align-top">
                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
                  {order.status}
                </Badge>
              </td>
              <td className="px-3 py-2.5 align-top text-right font-semibold text-foreground">
                {formatInr(order.amount, order.currency || currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h5 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h5>
    </div>
  );
}
