import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, XCircle, X } from "lucide-react";
import { request } from "../../api";
import { cn } from "../../utils/utils";

interface ChannelHealth {
  channel: string;
  channelType: string;
  status: "ok" | "warning" | "error";
  message: string;
}

export function ChannelHealthBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data: channels } = useQuery<ChannelHealth[]>({
    queryKey: ["channel-health"],
    queryFn: () => request<ChannelHealth[]>("/api/v1/health/channels"),
    refetchInterval: 5 * 60 * 1000,
  });

  if (dismissed || !channels || channels.length === 0) return null;

  const errorItems = channels.filter((c) => c.status === "error");
  const warningItems = channels.filter((c) => c.status === "warning");

  if (errorItems.length === 0 && warningItems.length === 0) return null;

  const hasError = errorItems.length > 0;
  const displayItems = hasError ? errorItems : warningItems;

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b px-4 py-2.5 text-sm",
        hasError
          ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
          : "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {hasError ? (
          <XCircle className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-0.5">
        {displayItems.map((item) => (
          <span key={`${item.channelType}-${item.channel}`}>
            {item.message}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        className={cn(
          "ml-auto shrink-0 rounded p-0.5 transition-colors",
          hasError
            ? "hover:bg-red-100 dark:hover:bg-red-500/20"
            : "hover:bg-yellow-100 dark:hover:bg-yellow-500/20",
        )}
        aria-label="Dismiss health alert"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
