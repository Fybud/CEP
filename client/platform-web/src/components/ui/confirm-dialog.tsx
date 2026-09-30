import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "../../utils/utils";

type Props = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  destructive?: boolean;
  requiredConfirmationText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirming = false,
  destructive = false,
  requiredConfirmationText,
  onConfirm,
  onCancel,
}: Props) {
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (open) setConfirmation("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirming, onCancel]);

  if (!open) return null;

  const confirmationMatches =
    !requiredConfirmationText || confirmation.trim() === requiredConfirmationText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        disabled={confirming}
        onClick={() => {
          if (!confirming) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg",
        )}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <div id="confirm-dialog-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </div>
        {requiredConfirmationText ? (
          <div className="mt-4 space-y-1.5">
            <label htmlFor="confirm-dialog-input" className="text-sm font-medium text-foreground">
              Confirmation
            </label>
            <Input
              id="confirm-dialog-input"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={requiredConfirmationText}
              autoComplete="off"
              autoFocus
              disabled={confirming}
            />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={confirming}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={confirming || !confirmationMatches}
            onClick={onConfirm}
          >
            {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
