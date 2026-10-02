import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Loader2 } from "lucide-react";
import { initials } from "./utils";

export function MessageSearchResults({
  query,
  results,
  isLoading,
  onSelect,
}: {
  query: string;
  results: any[];
  isLoading: boolean;
  onSelect: (
    contactId: string,
    channelType: string,
    channelId: string,
    conversationId?: string,
  ) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-foreground">No messages found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
        Message Results ({results.length})
      </div>
      {results.map((msg) => {
        const name =
          msg.customerName || msg.customer?.name || msg.customer?.metadata?.name || "Unknown";

        const content = msg.content || "";
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const matchIndex = lowerContent.indexOf(lowerQuery);

        let snippet = content;
        if (matchIndex !== -1) {
          const start = Math.max(0, matchIndex - 30);
          const end = Math.min(content.length, matchIndex + query.length + 30);
          snippet =
            (start > 0 ? "..." : "") +
            content.slice(start, end) +
            (end < content.length ? "..." : "");
        } else {
          snippet = content.slice(0, 60) + (content.length > 60 ? "..." : "");
        }

        return (
          <button
            key={msg.id}
            type="button"
            onClick={() =>
              onSelect(msg.customerId, msg.channelType, msg.channelId, msg.conversationId)
            }
            className="flex w-full flex-col gap-1 border-b border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                  {initials(name)}
                </div>
                <span className="truncate text-[13px] font-semibold text-foreground">{name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  {msg.channelType === "whatsapp"
                    ? "WA"
                    : msg.channelType === "instagram"
                      ? "IG"
                      : msg.channelType === "facebook"
                        ? "FB"
                        : msg.channelType === "web_chat"
                          ? "Web"
                          : "Email"}
                </span>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {snippet}
            </p>
          </button>
        );
      })}
    </div>
  );
}
