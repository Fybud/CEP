import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, X, Send, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useWhatsAppTemplates, type WhatsAppTemplate } from "../../api";
import { Button } from "../ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onSelect: (template: WhatsAppTemplate, variables: Record<string, string>) => void;
  onClose?: () => void;
  disabled?: boolean;
  variant?: "default" | "compact";
  forceOpen?: boolean;
  preferInternalCategory?: string;
  contactName?: string;
}

function extractVariableIndices(template: WhatsAppTemplate): number[] {
  const parts: string[] = [];
  for (const c of template.components ?? []) {
    const type = String(c.type ?? "").toUpperCase();
    if ((type === "BODY" || type === "HEADER") && typeof c.text === "string") {
      parts.push(c.text);
    }
  }
  const text = parts.join(" ");
  const matches = text.match(/\{\{(\d+)\}\}/g) ?? [];
  const nums = [...new Set(matches.map((m) => parseInt(m.replace(/[{}]/g, ""), 10)))];
  return nums.sort((a, b) => a - b);
}

function getBodyText(template: WhatsAppTemplate): string {
  return (
    template.components?.find((c) => String(c.type ?? "").toUpperCase() === "BODY")?.text ?? ""
  );
}

function defaultFullName(contactName?: string): string {
  if (!contactName?.trim()) return "";
  return contactName.replace(/^@+/, "").trim();
}

/** Meta's bundled test template — only works on Meta's public test numbers. */
function isMetaTestTemplate(template: WhatsAppTemplate): boolean {
  return template.name.toLowerCase() === "hello_world";
}

function buildDefaultVariables(indices: number[], contactName?: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (indices.includes(1) && contactName) vars["1"] = defaultFullName(contactName);
  return vars;
}

// Replaces {{n}} placeholders with filled values for preview
function buildPreviewText(template: WhatsAppTemplate, variables: Record<string, string>): string {
  const indices = extractVariableIndices(template);
  let text = getBodyText(template);
  for (const i of indices) {
    const val = variables[`${i}`] || `[variable ${i}]`;
    text = text.replace(new RegExp(`\\{\\{${i}\\}\\}`, "g"), val);
  }
  return text;
}

export function WhatsAppTemplateSelector({
  onSelect,
  onClose,
  disabled,
  variant = "default",
  forceOpen = false,
  preferInternalCategory,
  contactName,
}: Props) {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const [open, setOpen] = useState(forceOpen);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  const approvedTemplates = useMemo(
    () =>
      templates
        .filter((t) => t.status === "APPROVED")
        .filter((t) => !isMetaTestTemplate(t))
        .filter((t) => (preferInternalCategory ? t.internalCategory === preferInternalCategory : true))
        .filter((t) => {
          const q = searchQuery.toLowerCase().trim();
          if (!q) return true;
          return (
            t.name.toLowerCase().includes(q) ||
            t.internalCategory?.toLowerCase().includes(q) ||
            t.metaCategory?.toLowerCase().includes(q) ||
            t.language?.toLowerCase().includes(q) ||
            getBodyText(t).toLowerCase().includes(q)
          );
        }),
    [templates, searchQuery, preferInternalCategory]
  );

  const handleClose = () => {
    setOpen(false);
    setSelectedTemplate(null);
    setVariables({});
    setSearchQuery("");
    onClose?.();
  };

  const handlePick = (template: WhatsAppTemplate) => {
    const indices = extractVariableIndices(template);
    const defaults = buildDefaultVariables(indices, contactName);

    if (indices.length === 0) {
      onSelect(template, {});
      handleClose();
      return;
    }

    // If only variable is {{1}} and we have a contact name, auto-send
    if (indices.length === 1 && indices[0] === 1 && defaults["1"]) {
      onSelect(template, defaults);
      handleClose();
      return;
    }

    setVariables(defaults);
    setSelectedTemplate(template);
  };

  const selectedIndices = selectedTemplate ? extractVariableIndices(selectedTemplate) : [];
  const allFilled = selectedIndices.every((n) => variables[`${n}`]?.trim());

  // ── Trigger button (shown when not open) ────────────────────────────────
  if (!open) {
    if (variant === "compact") return null; // compact variant is always controlled externally
    return (
      <Button
        type="button"
        size="lg"
        onClick={() => setOpen(true)}
        disabled={disabled || isLoading}
        className="w-full gap-2 border border-primary/20 bg-primary/10 font-medium text-primary hover:border-primary/30 hover:bg-primary/20"
      >
        {isLoading ? "Loading…" : "Send a pre-approved template"}
      </Button>
    );
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            {selectedTemplate && (
              <button
                type="button"
                onClick={() => { setSelectedTemplate(null); setVariables({}); }}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {selectedTemplate ? selectedTemplate.name : "Send a template"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedTemplate
                  ? "Fill in the required details below"
                  : `${approvedTemplates.length} approved template${approvedTemplates.length !== 1 ? "s" : ""}${searchQuery ? ` matching "${searchQuery}"` : ""}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <AnimatePresence mode="wait">
          {!selectedTemplate ? (
            /* ── Template list ──────────────────────────────────────────── */
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {/* Search */}
              <div className="px-4 pt-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by name, message text, category or language…"
                    autoFocus
                    className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-8 pr-8 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="max-h-[55vh] flex-1 overflow-y-auto px-4 pb-4">
                {approvedTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <p className="text-sm font-medium">No templates found</p>
                    <p className="mt-1 text-xs">
                      {searchQuery ? "Try a different search term or clear the filter." : "Create and get templates approved on the Templates page."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {approvedTemplates.map((t) => (
                      <TemplateCard key={t.id} template={t} onPick={handlePick} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── Variable fill + preview ────────────────────────────────── */
            <motion.div
              key="fill"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex flex-col overflow-y-auto"
            >
              <div className="space-y-5 px-5 py-4">
                {/* Variable inputs */}
                {selectedIndices.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fill in details</p>
                    {selectedIndices.map((n, i) => {
                      const label = n === 1 ? "Customer name" : `Field ${n}`;
                      return (
                        <div key={n} className="space-y-1">
                          <label className="text-sm font-medium text-foreground">{label}</label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            value={variables[`${n}`] || ""}
                            onChange={(e) =>
                              setVariables((prev) => ({ ...prev, [`${n}`]: e.target.value }))
                            }
                            placeholder={n === 1 ? "e.g. John" : `Enter value for field ${n}`}
                            autoFocus={i === 0}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Message preview */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                      {buildPreviewText(selectedTemplate, variables)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <button
                  type="button"
                  onClick={() => { setSelectedTemplate(null); setVariables({}); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back
                </button>
                <Button
                  onClick={() => {
                    onSelect(selectedTemplate, variables);
                    handleClose();
                  }}
                  disabled={!allFilled}
                  className="gap-2"
                  size="sm"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send message
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );

  return createPortal(modal, document.body);
}

function TemplateCard({
  template,
  onPick,
}: {
  template: WhatsAppTemplate;
  onPick: (t: WhatsAppTemplate) => void;
}) {
  const body = getBodyText(template);
  const hasVars = extractVariableIndices(template).length > 0;

  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className="group w-full rounded-xl border border-border bg-background px-4 py-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
            {template.name.replace(/_/g, " ")}
          </p>
          {body && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {body}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </span>
          {hasVars && (
            <span className="text-[10px] text-muted-foreground">Needs details</span>
          )}
        </div>
      </div>
    </button>
  );
}
