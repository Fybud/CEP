import { cn } from "./utils";

/** Subtle live-polling indicator (pulsing green dot). */
export function LivePulse({
  label = "Live",
  active = true,
}: {
  label?: string;
  active?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
      title="Inbox is refreshing for new messages"
    >
      <span className="relative flex h-2 w-2">
        {active && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            active ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
      </span>
      {label}
    </span>
  );
}
