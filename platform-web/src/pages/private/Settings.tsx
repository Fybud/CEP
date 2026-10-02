import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "../../store/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  startChannelOAuth,
  startShopifyOAuth,
  useAccounts,
  useDisconnectInbox,
  useInboxes,
  useShopifyConfig,
  useUpdateInbox,
  useUpdateShopifyConfig,
  setupGuidePdfUrl,
  useFeatureFlag,
  useWebChatSettings,
  useUpdateWebChatSettings,
  type Inbox,
} from "../../api";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import {
  Download,
  Eye,
  EyeOff,
  Loader2,
  X,
  Copy,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "../../utils/utils";

type ChannelKey = "whatsapp" | "instagram" | "facebook" | "email" | "shopify";
type ModalKey = Exclude<ChannelKey, "email">;

function normalizeDomainInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  /** Required to enable Connect on first setup. */
  required?: boolean;
};

const WA_FIELDS: FieldDef[] = [
  { key: "phoneNumberId", label: "Phone Number ID", required: true },
  { key: "accessToken", label: "Access Token", secret: true, required: true },
  { key: "verifyToken", label: "Verify Token", secret: true, required: true },
  { key: "appSecret", label: "App Secret", secret: true, required: true },
  { key: "businessAccountId", label: "Business Account ID" },
];

const IG_FIELDS: FieldDef[] = [
  { key: "instagramAppId", label: "Instagram App ID", required: true },
  { key: "instagramAppSecret", label: "Instagram App Secret", secret: true, required: true },
  { key: "verifyToken", label: "Verify Token", secret: true, required: true },
];

const FB_FIELDS: FieldDef[] = [
  { key: "pageId", label: "Page ID", required: true },
  { key: "accessToken", label: "Page Access Token", secret: true, required: true },
  { key: "verifyToken", label: "Verify Token", secret: true, required: true },
  { key: "appSecret", label: "App Secret", secret: true, required: true },
  { key: "pageName", label: "Page Name (optional)" },
];

const SHOPIFY_FIELDS: FieldDef[] = [
  { key: "shop", label: "Shop subdomain", placeholder: "mystore", required: true },
  { key: "clientId", label: "Client ID", required: true },
  { key: "clientSecret", label: "Client Secret", secret: true, required: true },
];

function hasText(value?: string): boolean {
  return Boolean(value?.trim()) && value!.trim() !== "***";
}

function statusFromHealth(
  health?: Inbox["health"],
  connectedFallback = false,
): { label: string; tone: "ok" | "warn" | "error" | "idle" } {
  if (!health) {
    return connectedFallback
      ? { label: "Connected", tone: "ok" }
      : { label: "Not Connected", tone: "idle" };
  }
  if (health.level === "ok") return { label: "Connected", tone: "ok" };
  if (health.level === "warn") return { label: health.summary || "Needs attention", tone: "warn" };
  if (health.level === "error") {
    const missing = health.details.some((d) => /missing|not configured|not connected/i.test(d));
    return {
      label: missing ? "Not Connected" : "Error",
      tone: "error",
    };
  }
  if (health.level === "unknown") return { label: "Not Connected", tone: "idle" };
  return { label: "Not Connected", tone: "idle" };
}

function isLinkedStatus(tone: "ok" | "warn" | "error" | "idle") {
  return tone === "ok" || tone === "warn";
}



function ConnectModal({
  title,
  description,
  fields,
  initialValues,
  submitting,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  fields: FieldDef[];
  initialValues: Record<string, string>;
  submitting: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const canSubmit = fields
    .filter((f) => f.required)
    .every((f) => hasText(values[f.key]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 id="connect-modal-title" className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={submitting}
            className="h-9 w-9 shrink-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit || submitting) return;
            setError(null);
            void onSubmit(values).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Connection failed");
            });
          }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Details
            </p>
            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800">
                {error}
              </div>
            )}
            {fields.map((field) => {
              const show = !field.secret || revealed[field.key];
              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </label>
                  <div className="relative">
                    <Input
                      type={show ? "text" : "password"}
                      value={values[field.key] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      autoComplete="off"
                      spellCheck={false}
                      className={field.secret ? "pr-10" : undefined}
                    />
                    {field.secret && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        title={show ? "Hide" : "Reveal"}
                        onClick={() =>
                          setRevealed((prev) => ({
                            ...prev,
                            [field.key]: !prev[field.key],
                          }))
                        }
                      >
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Saved only after the connection succeeds.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/40 px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChannelRow({
  name,
  busy,
  linked,
  onConnect,
  onDisconnect,
  connectLabel = "Connect",
  linkedLabel = "Disconnect",
}: {
  name: string;
  busy?: boolean;
  linked: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  connectLabel?: string;
  linkedLabel?: string;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm font-semibold text-foreground">{name}</span>
      <div className="flex shrink-0 items-center gap-2">
        {linked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onDisconnect}
            className={cn(
              "h-9 min-w-[8.5rem]",
              linkedLabel === "Disconnect" &&
                "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Working…" : linkedLabel}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={onConnect} disabled={busy} className="h-9 min-w-[8.5rem]">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Connecting" : connectLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function WebChatSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const { data: settings, isLoading } = useWebChatSettings();
  const updateSettings = useUpdateWebChatSettings();

  useEffect(() => {
    if (open && settings) {
      setDomains([...(settings.allowedOrigins ?? [])]);
      setNewDomain("");
    }
  }, [open, settings]);

  if (!open) return null;

  const webOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://cep-demo.fybud.com";
  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "";
  const scriptSrc = `${apiBase || webOrigin}/embed/webchat.js`;
  const snippet = `<script src="${scriptSrc}" async></script>`;
  const hasDomains = domains.length > 0;
  const busy = updateSettings.isPending;

  const persistDomains = (next: string[], opts?: { success?: string }) => {
    setDomains(next);
    updateSettings.mutate(
      { allowedOrigins: next },
      {
        onSuccess: () => {
          if (opts?.success) toast.success(opts.success);
        },
        onError: (err) => {
          setDomains([...(settings?.allowedOrigins ?? [])]);
          toast.error(err.message || "Could not update domains");
        },
      },
    );
  };

  const addDomain = () => {
    const normalized = normalizeDomainInput(newDomain);
    if (!normalized) {
      toast.error("Enter a valid domain (e.g. https://www.example.com)");
      return;
    }
    if (domains.includes(normalized)) {
      toast.error("Domain already added");
      return;
    }
    setNewDomain("");
    persistDomains([...domains, normalized], { success: "Domain added" });
  };

  const removeDomain = (origin: string) => {
    persistDomains(
      domains.filter((d) => d !== origin),
      { success: "Domain removed" },
    );
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Snippet copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="webchat-modal-title"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 id="webchat-modal-title" className="text-lg font-semibold tracking-tight">
              Web Chat
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Authorized domains for your embed
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-9 w-9 shrink-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Authorized domains</label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sites allowed to load the widget. CEP preview is always allowed.
                  </p>
                </div>

                {domains.length > 0 && (
                  <ul className="overflow-hidden rounded-lg border border-border divide-y divide-border">
                    {domains.map((origin) => (
                      <li
                        key={origin}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                          {origin}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          title="Remove domain"
                          onClick={() => removeDomain(origin)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <Input
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="https://www.example.com"
                    className="h-10 font-mono text-xs"
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newDomain.trim()) addDomain();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    className="h-10 shrink-0 gap-1.5 px-3"
                    disabled={busy || !newDomain.trim()}
                    onClick={addDomain}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Embed snippet</label>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                  {snippet}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 gap-2"
                    disabled={!hasDomains}
                    title={hasDomains ? undefined : "Add at least one domain first"}
                    onClick={() => void copySnippet()}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Copy snippet
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-9" asChild>
                    <a href="/chat" target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-border bg-muted/40 px-6 py-4">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);


  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const activeAccount = accounts?.[0];
  const { data: inboxes, isLoading: inboxesLoading } = useInboxes(activeAccount?.id);
  const { mutateAsync: updateInboxAsync } = useUpdateInbox();
  const { mutateAsync: disconnectInboxAsync, isPending: disconnectingInbox } =
    useDisconnectInbox();
  const { data: shopify, isLoading: shopifyLoading } = useShopifyConfig();
  const { mutateAsync: updateShopifyAsync, isPending: shopifyBusy } = useUpdateShopifyConfig();


  // Per-channel admin flags — only show rows after flags resolve, and only if enabled
  const { data: waChannelFlag, isFetched: waFlagFetched } = useFeatureFlag("whatsapp_channel");
  const { data: igChannelFlag, isFetched: igFlagFetched } = useFeatureFlag("instagram_channel");
  const { data: fbChannelFlag, isFetched: fbFlagFetched } = useFeatureFlag("facebook_channel");
  const { data: emailChannelFlag, isFetched: emailFlagFetched } = useFeatureFlag("email_channel");
  const { data: webChatChannelFlag, isFetched: webChatFlagFetched } =
    useFeatureFlag("web_chat_channel");

  const channelFlagsReady =
    waFlagFetched && igFlagFetched && fbFlagFetched && emailFlagFetched && webChatFlagFetched;

  const showWaRow = channelFlagsReady && waChannelFlag?.enabled === true;
  const showIgRow = channelFlagsReady && igChannelFlag?.enabled === true;
  const showFbRow = channelFlagsReady && fbChannelFlag?.enabled === true;
  const showEmailRow = channelFlagsReady && emailChannelFlag?.enabled === true;
  const showWebChat = channelFlagsReady && webChatChannelFlag?.enabled === true;

  const { data: webChatSettings } = useWebChatSettings(showWebChat);
  const webChatLinked = (webChatSettings?.allowedOrigins?.length ?? 0) > 0;

  const [connecting, setConnecting] = useState<"gmail" | "instagram" | "shopify" | null>(null);
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [webChatModalOpen, setWebChatModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<ChannelKey | null>(null);

  useEffect(() => {
    setConnecting(null);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setConnecting(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    const status = searchParams.get("status");
    if (!oauth || !status) return;

    setConnecting(null);
    setModal(null);

    if (status === "success") {
      void queryClient.invalidateQueries({ queryKey: ["inboxes"] });
      void queryClient.invalidateQueries({ queryKey: ["shopify-config"] });
      const who =
        oauth === "gmail"
          ? searchParams.get("email")
          : searchParams.get("username")
            ? `@${searchParams.get("username")}`
            : null;
      const label =
        oauth === "gmail" ? "Gmail" : oauth === "instagram" ? "Instagram" : "Shopify";
      toast.success(who ? `${label} connected · ${who}` : `${label} connected`);
    } else {
      toast.error(searchParams.get("message") || "Connection failed");
    }

    const next = new URLSearchParams(searchParams);
    ["oauth", "status", "message", "email", "username", "tab"].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, queryClient]);

  const waInbox = inboxes?.find((i) => i.channelType === "whatsapp");
  const igInbox = inboxes?.find((i) => i.channelType === "instagram");
  const fbInbox = inboxes?.find((i) => i.channelType === "facebook");
  const emailInbox = inboxes?.find((i) => i.channelType === "email");

  const waStatus = statusFromHealth(waInbox?.health);
  const igStatus = statusFromHealth(igInbox?.health);
  const fbStatus = statusFromHealth(fbInbox?.health);
  const emailStatus = statusFromHealth(emailInbox?.health);
  const shopifyConnected = Boolean(shopify?.connected ?? shopify?.hasClientSecret);

  const startOAuth = async (
    provider: "gmail" | "instagram",
    inboxId: string,
    credentials: Record<string, string> = {},
  ) => {
    setConnecting(provider);
    try {
      const { url } = await startChannelOAuth(provider, inboxId, credentials);
      window.location.assign(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not start connection");
      setConnecting(null);
      throw err;
    }
  };

  const modalConfig = useMemo(() => {
    if (!modal) return null;
    if (modal === "whatsapp") {
      return {
        title: "Connect WhatsApp",
        description: "Enter your WhatsApp Business details to connect.",
        fields: WA_FIELDS,
        initialValues: {} as Record<string, string>,
        submitLabel: "Connect",
      };
    }
    if (modal === "instagram") {
      return {
        title: "Connect Instagram",
        description: "Enter your Instagram app details, then sign in with Instagram.",
        fields: IG_FIELDS,
        initialValues: {} as Record<string, string>,
        submitLabel: connecting === "instagram" ? "Connecting…" : "Connect",
      };
    }
    if (modal === "facebook") {
      return {
        title: "Connect Facebook",
        description: "Enter your Meta Page and app credentials to connect Facebook Messenger.",
        fields: FB_FIELDS,
        initialValues: {} as Record<string, string>,
        submitLabel: "Connect",
      };
    }
    return {
      title: "Connect Shopify",
      description: "Enter the store, then approve access in Shopify.",
      fields: SHOPIFY_FIELDS,
      initialValues: {} as Record<string, string>,
      submitLabel: connecting === "shopify" ? "Connecting…" : "Connect",
    };
  }, [modal, connecting]);

  const disconnectLabel =
    disconnectTarget === "whatsapp"
      ? "WhatsApp"
      : disconnectTarget === "instagram"
        ? "Instagram"
        : disconnectTarget === "facebook"
          ? "Facebook"
          : disconnectTarget === "email"
            ? "Gmail"
            : disconnectTarget === "shopify"
              ? "Shopify"
              : "";

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget) return;
    try {
      if (disconnectTarget === "shopify") {
        await updateShopifyAsync({ disconnect: true });
      } else {
        const inbox =
          disconnectTarget === "whatsapp"
            ? waInbox
            : disconnectTarget === "instagram"
              ? igInbox
              : disconnectTarget === "facebook"
                ? fbInbox
                : emailInbox;
        if (!inbox) throw new Error("Channel is not available.");
        await disconnectInboxAsync(inbox.id);
      }
      toast.success(`${disconnectLabel} disconnected`);
      setDisconnectTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
      setDisconnectTarget(null);
    }
  };

  const handleConnectGmail = () => {
    if (!emailInbox) {
      toast.error("Gmail inbox is not available. Please try again later.");
      return;
    }
    void startOAuth("gmail", emailInbox.id).catch(() => undefined);
  };

  const handleConnectSubmit = async (values: Record<string, string>) => {
    if (!modal) return;
    setSubmitting(true);
    try {
      if (modal === "shopify") {
        setConnecting("shopify");
        try {
          const result = await startShopifyOAuth({
            shop: values.shop,
            clientId: values.clientId,
            clientSecret: values.clientSecret,
          });
          if (result.url) {
            window.location.assign(result.url);
            return;
          }
          toast.success("Shopify connected");
          setModal(null);
          setConnecting(null);
          return;
        } catch (err: unknown) {
          setConnecting(null);
          toast.error(err instanceof Error ? err.message : "Could not start Shopify connection");
          return;
        }
      }

      if (modal === "facebook") {
        if (!fbInbox) throw new Error("Facebook channel is not available. Please try again later.");
        await updateInboxAsync({
          id: fbInbox.id,
          body: { channelConfig: values, enabled: true },
        });
        toast.success("Facebook connected");
        setModal(null);
        return;
      }

      const inbox = modal === "whatsapp" ? waInbox : igInbox;
      if (!inbox) throw new Error("Channel is not available. Please try again later.");

      if (modal === "instagram") {
        await startOAuth("instagram", inbox.id, {
          instagramAppId: values.instagramAppId,
          instagramAppSecret: values.instagramAppSecret,
          verifyToken: values.verifyToken,
        });
        return;
      }

      await updateInboxAsync({
        id: inbox.id,
        body: { channelConfig: values, enabled: true },
      });

      toast.success("WhatsApp connected");
      setModal(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN") {
    return <Navigate to="/inbox" replace />;
  }

  if (accountsLoading || inboxesLoading || shopifyLoading || !channelFlagsReady) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }



  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8 pb-16 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect messaging channels and Shopify.
            </p>
          </div>
          <Button variant="outline" className="h-10 shrink-0 gap-2" asChild>
            <a href={setupGuidePdfUrl()} download="CEP-Channel-Setup-Guide.pdf">
              <Download className="h-4 w-4" />
              Download setup guide
            </a>
          </Button>
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold leading-none">Channels</h2>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {showWaRow && (
              <ChannelRow
                name="WhatsApp"
                linked={isLinkedStatus(waStatus.tone)}
                busy={
                  (submitting && modal === "whatsapp") ||
                  (disconnectingInbox && disconnectTarget === "whatsapp")
                }
                onConnect={() => setModal("whatsapp")}
                onDisconnect={() => setDisconnectTarget("whatsapp")}
              />
            )}
            {showIgRow && (
              <ChannelRow
                name="Instagram"
                linked={isLinkedStatus(igStatus.tone)}
                busy={
                  connecting === "instagram" ||
                  (submitting && modal === "instagram") ||
                  (disconnectingInbox && disconnectTarget === "instagram")
                }
                onConnect={() => setModal("instagram")}
                onDisconnect={() => setDisconnectTarget("instagram")}
              />
            )}
            {showFbRow && (
              <ChannelRow
                name="Facebook"
                linked={isLinkedStatus(fbStatus.tone)}
                busy={
                  (submitting && modal === "facebook") ||
                  (disconnectingInbox && disconnectTarget === "facebook")
                }
                onConnect={() => setModal("facebook")}
                onDisconnect={() => setDisconnectTarget("facebook")}
              />
            )}
            {showEmailRow && (
              <ChannelRow
                name="Gmail"
                linked={isLinkedStatus(emailStatus.tone)}
                busy={
                  connecting === "gmail" ||
                  (disconnectingInbox && disconnectTarget === "email")
                }
                onConnect={handleConnectGmail}
                onDisconnect={() => setDisconnectTarget("email")}
              />
            )}
            {showWebChat && (
              <ChannelRow
                name="Web Chat"
                linked={webChatLinked}
                onConnect={() => setWebChatModalOpen(true)}
                onDisconnect={() => setWebChatModalOpen(true)}
                linkedLabel="Manage"
              />
            )}
            {!showWaRow && !showIgRow && !showFbRow && !showEmailRow && !showWebChat && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No channels enabled. Contact your administrator.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold leading-none">Shopify</h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <ChannelRow
              name="Shopify"
              linked={shopifyConnected}
              busy={
                connecting === "shopify" ||
                (submitting && modal === "shopify") ||
                (shopifyBusy && disconnectTarget === "shopify")
              }
              onConnect={() => setModal("shopify")}
              onDisconnect={() => setDisconnectTarget("shopify")}
            />
          </div>
        </section>

      </div>

      {showWebChat ? (
        <WebChatSetupModal open={webChatModalOpen} onClose={() => setWebChatModalOpen(false)} />
      ) : null}

      {modal && modalConfig && (
        <ConnectModal
          title={modalConfig.title}
          description={modalConfig.description}
          fields={modalConfig.fields}
          initialValues={modalConfig.initialValues}
          submitting={submitting || connecting !== null}
          submitLabel={modalConfig.submitLabel}
          onClose={() => {
            if (submitting || connecting) return;
            setModal(null);
          }}
          onSubmit={handleConnectSubmit}
        />
      )}

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        title={`Disconnect ${disconnectLabel}?`}
        description={
          <>
            This removes the saved credentials and disables {disconnectLabel}. Type{" "}
            <strong className="text-foreground">Disconnect</strong> below to continue.
          </>
        }
        requiredConfirmationText="Disconnect"
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        destructive
        confirming={disconnectingInbox || (shopifyBusy && disconnectTarget === "shopify")}
        onConfirm={() => void handleDisconnectConfirm()}
        onCancel={() => setDisconnectTarget(null)}
      />
    </div>
  );
}
