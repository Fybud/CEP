import { useQuery } from "@tanstack/react-query";
import { Loader2, Package } from "lucide-react";
import { orderService, type CustomerOrder } from "../../services/order.service";
import { Badge } from "../ui/badge";
import { cn } from "../../utils/utils";

type Props = {
  email?: string | null;
  phone?: string | null;
};

function formatAmount(amount: number, currency = "INR"): string {
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

function statusClass(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("deliver"))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  if (value.includes("ship") || value.includes("out for"))
    return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20";
  if (value.includes("cancel") || value.includes("return"))
    return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/20";
  if (value.includes("place") || value.includes("confirm"))
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function OrderCard({ order }: { order: CustomerOrder }) {
  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h6 className="text-xs font-semibold text-foreground">Order #{order.orderId}</h6>
        <Badge
          variant="outline"
          className={cn("h-5 rounded px-1.5 text-[10px]", statusClass(order.status))}
        >
          {order.status}
        </Badge>
      </div>

      <dl className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-medium text-foreground">
            {formatAmount(order.amount, order.currency)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Date</dt>
          <dd className="font-medium text-foreground">{formatOrderDate(order.date)}</dd>
        </div>
      </dl>

      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Items</p>
        <ul className="space-y-0.5">
          {order.items.map((item) => (
            <li key={`${order.orderId}-${item.name}`} className="text-xs text-foreground">
              {item.name}
              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function OrderWidget({ email, phone }: Props) {
  const enabled = Boolean(email?.trim() || phone?.trim());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["customer-orders", email ?? null, phone ?? null],
    queryFn: () => orderService.getOrdersForCustomer({ email, phone }),
    enabled,
    staleTime: 30_000,
  });

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Package className="h-3.5 w-3.5 text-muted-foreground" />
        <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Orders
        </h5>
      </div>

      {!enabled && (
        <p className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
          No orders found for this customer.
        </p>
      )}

      {enabled && isLoading && (
        <div className="flex items-center justify-center rounded-lg border border-border py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {enabled && isError && (
        <p className="rounded-lg border border-border px-3 py-3 text-xs text-red-600">
          {(error as Error)?.message || "Failed to load orders."}
        </p>
      )}

      {enabled && !isLoading && !isError && (data?.orders?.length ?? 0) === 0 && (
        <p className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
          No orders found for this customer.
        </p>
      )}

      {enabled && !isLoading && !isError && (data?.orders?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {data!.orders.map((order) => (
            <OrderCard key={order.orderId} order={order} />
          ))}
        </div>
      )}
    </section>
  );
}
