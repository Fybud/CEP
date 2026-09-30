import { useState, useMemo, useEffect, useRef } from "react";
import {
  useWhatsAppTemplates,
  useSyncTemplates,
  useDeleteTemplate,
  type WhatsAppTemplate,
} from "../../api";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  MinusCircle,
  AlertTriangle,
  Eye,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { WhatsAppTemplateCreateModal } from "./WhatsAppTemplateCreateModal";
import { WhatsAppTemplateDetailDrawer } from "./WhatsAppTemplateDetailDrawer";
import { motion, AnimatePresence } from "framer-motion";

const STATUS_CFG = {
  APPROVED: {
    label: "Approved",
    Icon: CheckCircle2,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  PENDING: {
    label: "Pending",
    Icon: Clock,
    cls: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
  },
  REJECTED: {
    label: "Rejected",
    Icon: XCircle,
    cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  },
  PAUSED: {
    label: "Paused",
    Icon: PauseCircle,
    cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  },
  DISABLED: {
    label: "Disabled",
    Icon: MinusCircle,
    cls: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20",
  },
  UNKNOWN: {
    label: "Unknown",
    Icon: AlertTriangle,
    cls: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20",
  },
} as const;

function StatusBadge({ status }: { status: WhatsAppTemplate["status"] }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.UNKNOWN;
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.cls}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  CUSTOMER_REENGAGEMENT: "Re-engagement",
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  OTHER: "Other",
};

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function getBodyPreview(components: any[]): string {
  return components?.find((c) => c.type === "BODY" || c.type === "body")?.text ?? "";
}


function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${40 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  );
}

function EmptyState({
  filtered,
  onNew,
  onSync,
  isSyncing,
}: {
  filtered: boolean;
  onNew: () => void;
  onSync: () => void;
  isSyncing: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <RefreshCw className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="text-base font-semibold">
          {filtered ? "No templates match your filters" : "No templates yet"}
        </p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {filtered
            ? "Try changing your search or filters."
            : "Sync from Meta to import existing templates, or create a new one."}
        </p>
      </div>
      {!filtered && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing} className="gap-2">
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync from Meta
          </Button>
          <Button size="sm" onClick={onNew} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            New Template
          </Button>
        </div>
      )}
    </div>
  );
}
const TABLE_HEADERS = ["Name", "Internal Category", "Language", "Status", "Actions"];

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "Hindi",
};

export function WhatsAppTemplateManager() {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const { mutate: syncTemplates, isPending: isSyncing } = useSyncTemplates();
  const { mutate: deleteTemplate, isPending: isDeleting } = useDeleteTemplate();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const selectedTemplate = useMemo(() => templates.find((t: WhatsAppTemplate) => t.id === selectedTemplateId) || null, [templates, selectedTemplateId]);

  const [templateToDelete, setTemplateToDelete] = useState<WhatsAppTemplate | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeMenuId) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveMenuId(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [activeMenuId]);

  const handleConfirmDelete = () => {
    if (!templateToDelete) return;
    deleteTemplate(templateToDelete.id, {
      onSuccess: () => {
        toast.success(`Template "${templateToDelete.name}" deleted from Meta and database`);
        setTemplateToDelete(null);
      },
      onError: (err: any) => {
        toast.error(err.message || "Failed to delete template from Meta");
      },
    });
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const handleSync = () => {
    syncTemplates(undefined, {
      onSuccess: (data: { removedOrphans?: string[] }) => {
        const removed = data?.removedOrphans ?? [];
        if (removed.length > 0) {
          toast.success(
            `Synced from Meta. Removed ${removed.length} template(s) not found in Meta: ${removed.join(", ")}`,
          );
        } else {
          toast.success("Templates synced from Meta");
        }
      },
      onError: (err: any) => toast.error(err.message ?? "Sync failed"),
    });
  };

  const allCategories = useMemo(
    () => [...new Set(templates.map((t: WhatsAppTemplate) => t.internalCategory))],
    [templates]
  );

  const filtered = useMemo(() => {
    return templates.filter((t: WhatsAppTemplate) => {
      const matchSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.language.toLowerCase().includes(search.toLowerCase()) ||
        t.metaCategory.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
      const matchCategory =
        categoryFilter === "ALL" || t.internalCategory === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    });
  }, [templates, search, statusFilter, categoryFilter]);

  const statusCounts = useMemo(() => {
    return templates.reduce(
      (acc: Record<string, number>, t: WhatsAppTemplate) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      },
      {}
    );
  }, [templates]);

  const lastSyncTime = useMemo(() => {
    const times = templates
      .map((t) => t.lastSyncedAt)
      .filter((t): t is string => Boolean(t))
      .map((t) => new Date(t).getTime());
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  }, [templates]);

  return (
    <div className="space-y-6">
      {!isLoading && templates.length > 0 && (
        <div className="flex w-max rounded-xl bg-muted/40 p-1">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              statusFilter === "ALL"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            All <span className="ml-1 text-xs opacity-60">{templates.length}</span>
          </button>

          {Object.entries(statusCounts).map(([status, count]) => {
            if (count === 0) return null;
            const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.UNKNOWN;
            const active = statusFilter === status;

            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <cfg.Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-70"}`} />
                {cfg.label}
                <span className="text-xs opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search templates…"
            className="w-full rounded-xl border border-border bg-muted/50 py-2.5 pl-9 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {allCategories.length > 1 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="shrink-0 cursor-pointer rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="ALL">All internal categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        )}

        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-2"
            title={lastSyncTime && !isSyncing ? `Last synced ${formatRelativeTime(lastSyncTime)}` : "Sync templates from Meta"}
          >
            {isSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync from Meta
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            New Template
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {TABLE_HEADERS.map((h) => (
                    <th key={h} className="whitespace-nowrap px-6 py-3.5 font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...Array(4)].map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            filtered={search !== "" || statusFilter !== "ALL" || categoryFilter !== "ALL"}
            onNew={() => setCreateOpen(true)}
            onSync={handleSync}
            isSyncing={isSyncing}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {TABLE_HEADERS.map((h) => (
                    <th
                      key={h}
                      className={`whitespace-nowrap px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                        h === "Actions" ? "w-20 text-right pr-6" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {filtered.map((template: WhatsAppTemplate) => (
                    <motion.tr
                      key={template.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <span className="text-sm font-semibold text-foreground">{template.name}</span>
                          <p
                            className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground"
                            title={getBodyPreview(template.components)}
                          >
                            {getBodyPreview(template.components)}
                          </p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {CATEGORY_LABELS[template.internalCategory] ?? template.internalCategory}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {LANGUAGE_LABELS[template.language] ?? template.language}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <StatusBadge status={template.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="relative inline-flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === template.id ? null : template.id);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {activeMenuId === template.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setSelectedTemplateId(template.id);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                View
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setTemplateToDelete(template);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(templateToDelete)}
        title="Delete WhatsApp Template"
        description={
          templateToDelete ? (
            <span>
              Are you sure you want to delete template{" "}
              <strong className="text-foreground font-semibold">{templateToDelete.name}</strong>?
              This will permanently delete it from Meta Business Manager and your local database.
            </span>
          ) : ""
        }
        confirmLabel="Delete from Meta"
        destructive
        confirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setTemplateToDelete(null)}
      />

      <WhatsAppTemplateCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <WhatsAppTemplateDetailDrawer
        template={selectedTemplate}
        onClose={() => setSelectedTemplateId(null)}
      />
    </div>
  );
}
