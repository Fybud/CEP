import {
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  XCircle,
  MinusCircle,
  Send,
  CheckCheck,
  Eye as EyeIcon,
  MessageSquare,
} from "lucide-react";
import {
  type WhatsAppTemplate,
  useTemplateAnalytics,
  usePatchTemplate,
} from "../../api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

const INTERNAL_CATEGORIES = [
  { value: "CUSTOMER_REENGAGEMENT", label: "Customer Re-engagement" },
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
  { value: "AUTHENTICATION", label: "Authentication" },
  { value: "OTHER", label: "Other" },
];

const STATUS_CONFIG = {
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  PENDING: {
    label: "Pending",
    icon: Clock,
    cls: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  },
  REJECTED: {
    label: "Rejected",
    icon: XCircle,
    cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  PAUSED: {
    label: "Paused",
    icon: PauseCircle,
    cls: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  DISABLED: {
    label: "Disabled",
    icon: MinusCircle,
    cls: "bg-muted text-muted-foreground border-border",
  },
  UNKNOWN: {
    label: "Unknown",
    icon: AlertTriangle,
    cls: "bg-muted text-muted-foreground border-border",
  },
} as const;

function getBodyText(components: any[]): string {
  return components?.find((c) => c.type === "BODY" || c.type === "body")?.text ?? "";
}

function getHeader(components: any[]): { format: string; text?: string } | null {
  const h = components?.find((c) => c.type === "HEADER" || c.type === "header");
  if (!h) return null;
  return { format: h.format, text: h.text };
}

function getFooter(components: any[]): string | null {
  return components?.find((c) => c.type === "FOOTER" || c.type === "footer")?.text ?? null;
}

function getButtons(components: any[]): any[] {
  return components?.find((c) => c.type === "BUTTONS" || c.type === "buttons")?.buttons ?? [];
}

function StatusBadge({ status }: { status: WhatsAppTemplate["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UNKNOWN;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function AnalyticsSection({ templateId }: { templateId: string }) {
  const { data: analytics, isLoading } = useTemplateAnalytics(templateId);

  if (isLoading || !analytics?.available) return null;

  const hasStats = analytics.sent > 0 || analytics.delivered > 0 || analytics.read > 0;
  const hasUsage = (analytics.usageCount ?? 0) > 0;
  if (!hasStats && !hasUsage) return null;

  return (
    <section className="px-6 py-4 border-b border-border">
      <h3 className="text-sm font-semibold text-foreground mb-3">Usage · last 30 days</h3>
      {hasUsage && (
        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Sent from inbox: <span className="font-medium text-foreground">{analytics.usageCount}</span>
        </p>
      )}
      {hasStats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Send className="h-3 w-3" /> Sent</p>
            <p className="text-lg font-semibold tabular-nums">{analytics.sent}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CheckCheck className="h-3 w-3" /> Delivered</p>
            <p className="text-lg font-semibold tabular-nums">{analytics.delivered}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><EyeIcon className="h-3 w-3" /> Read</p>
            <p className="text-lg font-semibold tabular-nums">{analytics.read}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function WhatsAppPreview({
  header,
  body,
  footer,
  buttons,
}: {
  header: { format: string; text?: string } | null;
  body: string;
  footer: string | null;
  buttons: any[];
}) {
  return (
    <div className="rounded-xl bg-[#efeae2] dark:bg-[#0b141a] p-4">
      <div className="max-w-[280px]">
        <div className="rounded-lg rounded-tl-none bg-white dark:bg-[#202c33] shadow-sm overflow-hidden">
          {header && (
            <div className="px-3 pt-2 pb-1">
              {header.format === "TEXT" ? (
                <p className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">{header.text}</p>
              ) : (
                <div className="h-24 rounded-md bg-black/5 dark:bg-white/5 flex items-center justify-center text-xs text-muted-foreground">
                  {header.format}
                </div>
              )}
            </div>
          )}
          {body && (
            <p className="px-3 py-2 text-sm text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap leading-relaxed">
              {body}
            </p>
          )}
          <div className="px-3 pb-2 flex items-end justify-between gap-2">
            {footer ? (
              <span className="text-xs text-[#667781] dark:text-[#8696a0]">{footer}</span>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">12:00</span>
          </div>
        </div>
        {buttons.length > 0 && (
          <div className="mt-1 space-y-1">
            {buttons.map((btn, i) => (
              <div
                key={i}
                className="rounded-lg bg-white dark:bg-[#202c33] px-3 py-2 text-center text-sm font-medium text-[#00a884]"
              >
                {btn.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  template: WhatsAppTemplate | null;
  onClose: () => void;
}

export function WhatsAppTemplateDetailDrawer({ template, onClose }: Props) {
  const { mutateAsync: patchTemplate, isPending: isPatching } = usePatchTemplate();

  const header = template ? getHeader(template.components) : null;
  const body = template ? getBodyText(template.components) : "";
  const footer = template ? getFooter(template.components) : null;
  const buttons = template ? getButtons(template.components) : [];

  const content = (
    <AnimatePresence>
      {template && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          />
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-6 pt-3 pb-4">
              <div className="min-w-0">
                <h2 className="truncate font-mono text-base font-semibold">{template.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={template.status} />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {template.language}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {template.metaCategory}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <section className="space-y-4 border-b border-border px-6 py-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Inbox category
                  </label>
                  <select
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={template.internalCategory}
                    disabled={isPatching}
                    onChange={async (e) => {
                      try {
                        await patchTemplate({ id: template.id, internalCategory: e.target.value });
                        toast.success("Category updated");
                      } catch (err: any) {
                        toast.error(err.message || "Failed to update category");
                      }
                    }}
                  >
                    {INTERNAL_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {template.status === "REJECTED" && template.rejectionReason && (
                <section className="mx-6 my-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">Rejected by Meta</p>
                  <p className="mt-1 text-sm text-red-700/90 dark:text-red-300">{template.rejectionReason}</p>
                </section>
              )}

              <section className="border-b border-border px-6 py-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Meta details
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Meta template ID</dt>
                    <dd className="font-mono text-right text-foreground">
                      {template.metaTemplateId || "Not submitted"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Business account</dt>
                    <dd className="font-mono text-right text-foreground">
                      {template.wabaId || "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              <AnalyticsSection templateId={template.id} />

              <section className="px-6 py-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Preview</h3>
                <WhatsAppPreview header={header} body={body} footer={footer} buttons={buttons} />
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
