import { Fragment, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../utils/utils";

interface ShortcutRow {
  key: string;
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { key: "↓", description: "Next conversation" },
  { key: "↑", description: "Previous conversation" },
  { key: "R", description: "Resolve conversation" },
  { key: "?", description: "Show keyboard shortcuts" },
];

interface KeyboardShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsOverlay({
  open,
  onClose,
}: KeyboardShortcutsOverlayProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbd-shortcuts-title"
    >
      {/* Dark overlay */}
      <button
        type="button"
        aria-label="Close keyboard shortcuts"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={cn(
          "relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg",
        )}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="kbd-shortcuts-title"
            className="text-base font-semibold text-foreground"
          >
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shortcut grid */}
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
          {SHORTCUTS.map(({ key, description }) => (
            <Fragment key={key}>
              <kbd className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                {key}
              </kbd>
              <span className="text-sm text-muted-foreground">{description}</span>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
