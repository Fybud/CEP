import { useState, useEffect } from "react";
import { useCannedReplies } from "../../api";
import { cn } from "./utils";

interface Props {
  search: string;
  onSelect: (body: string) => void;
  onClose: () => void;
  variables: Record<string, string>;
}

export function CannedReplyPicker({ search, onSelect, onClose, variables }: Props) {
  const { data: replies } = useCannedReplies();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = (replies || []).filter(
    (r) =>
      r.shortcut.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const reply = filtered[selectedIndex];
        if (reply) {
          let body = reply.body;
          // Interpolate variables
          for (const [key, value] of Object.entries(variables)) {
            body = body.replace(new RegExp(`{{${key}}}`, "g"), value);
          }
          onSelect(body);
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filtered, selectedIndex, variables, onSelect, onClose]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full mb-1 left-0 w-[300px] bg-card border border-border rounded-lg shadow-xl p-3 text-sm text-muted-foreground z-50">
        No canned replies found.
      </div>
    );
  }

  return (
    <div className="absolute bottom-full mb-1 left-0 w-[300px] max-h-[250px] overflow-y-auto bg-card border border-border rounded-lg shadow-xl z-50 py-1 flex flex-col">
      {filtered.map((r, i) => (
        <button
          key={r.id}
          className={cn(
            "flex flex-col items-start px-3 py-2 text-left hover:bg-muted transition-colors",
            i === selectedIndex && "bg-muted"
          )}
          onMouseEnter={() => setSelectedIndex(i)}
          onClick={() => {
            let body = r.body;
            for (const [key, value] of Object.entries(variables)) {
              body = body.replace(new RegExp(`{{${key}}}`, "g"), value);
            }
            onSelect(body);
          }}
        >
          <div className="flex items-center justify-between w-full">
            <span className="font-medium text-sm text-foreground">{r.name}</span>
            <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1 rounded">/{r.shortcut}</span>
          </div>
          <span className="text-xs text-muted-foreground truncate w-full mt-0.5">{r.body}</span>
        </button>
      ))}
    </div>
  );
}
