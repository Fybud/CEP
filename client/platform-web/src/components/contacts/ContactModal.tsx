import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  ApiError,
  useCreateContact,
  useMergeContacts,
  useUpdateContact,
  type ContactMatch,
  type ChannelType,
} from "../../api";
import {
  COUNTRY_DIAL_OPTIONS,
  composeWhatsApp,
  formatWhatsAppStorage,
  parseWhatsAppParts,
  type WhatsAppParts,
} from "../../utils/phone";

export type ContactFormData = {
  id?: string;
  name: string;
  emails: string[];
  whatsappIds: string[];
  instagramId: string;
  facebookId?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialData?: ContactFormData | null;
  accountId: string;
  enabledChannels?: ChannelType[];
};

const emptyForm = (): ContactFormData => ({
  name: "",
  emails: [""],
  whatsappIds: [""],
  instagramId: "",
  facebookId: "",
});

function isUnknown(name: string | null | undefined) {
  return !name || name.trim().toLowerCase() === "unknown";
}

function MultiStringField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const rows = values.length ? values : [""];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => onChange([...rows, ""])}
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((value, idx) => (
          <div key={`${label}-${idx}`} className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => {
                const next = [...rows];
                next[idx] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatsAppMultiField({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const rows = (values.length ? values : [""]).map(parseWhatsAppParts);
  const knownDials = new Set(COUNTRY_DIAL_OPTIONS.map((c) => c.dial));

  const updateRow = (idx: number, patch: Partial<WhatsAppParts>) => {
    const next = rows.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    onChange(next.map(composeWhatsApp));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">WhatsApp</label>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => onChange([...(values.length ? values : [""]), ""])}
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const dialOptions = knownDials.has(row.dial)
            ? COUNTRY_DIAL_OPTIONS
            : [{ dial: row.dial, label: `+${row.dial}` }, ...COUNTRY_DIAL_OPTIONS];
          return (
            <div key={`wa-${idx}`} className="flex gap-2">
              <select
                aria-label={`Country code ${idx + 1}`}
                value={row.dial}
                onChange={(e) => updateRow(idx, { dial: e.target.value })}
                className="h-10 min-w-[8.5rem] shrink-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {dialOptions.map((c) => (
                  <option key={c.dial} value={c.dial}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Input
                inputMode="numeric"
                autoComplete="tel-national"
                value={row.national}
                onChange={(e) =>
                  updateRow(idx, { national: e.target.value.replace(/[^\d\s-]/g, "") })
                }
                placeholder="9876543210"
              />
              {rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    const next = values.filter((_, i) => i !== idx);
                    onChange(next.length ? next : [""]);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ContactModal({
  isOpen,
  onClose,
  initialData,
  accountId,
  enabledChannels,
}: Props) {
  const [formData, setFormData] = useState<ContactFormData>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ContactMatch[] | null>(null);
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(null);
  const [keepName, setKeepName] = useState("");
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const mergeContacts = useMergeContacts();

  const channels = enabledChannels ?? [];
  const showEmail = channels.includes("email");
  const showWa = channels.includes("whatsapp");
  const showIg = channels.includes("instagram");
  const showFb = channels.includes("facebook");

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setMatches(null);
    setPendingBody(null);
    if (initialData) {
      setFormData({
        id: initialData.id,
        name: initialData.name || "",
        emails: initialData.emails?.length ? initialData.emails : [""],
        whatsappIds: initialData.whatsappIds?.length ? initialData.whatsappIds : [""],
        instagramId: initialData.instagramId || "",
        facebookId: initialData.facebookId || "",
      });
    } else {
      setFormData(emptyForm());
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(initialData?.id);
  const isPending =
    createContact.isPending || updateContact.isPending || mergeContacts.isPending;

  const cleanList = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

  const buildBody = () => {
    const emails = showEmail ? cleanList(formData.emails) : undefined;
    const whatsappIds = showWa
      ? cleanList(formData.whatsappIds)
          .map((n) => formatWhatsAppStorage(n))
          .filter((n): n is string => Boolean(n))
      : undefined;
    const name = formData.name.trim();
    const instagramId = showIg
      ? formData.instagramId.trim().replace(/^@+/, "")
      : undefined;
    const facebookId = showFb ? formData.facebookId?.trim() : undefined;

    return {
      name: name || undefined,
      ...(emails
        ? {
            emails,
            email: emails[0],
            emailId: emails[0] || undefined,
          }
        : {}),
      ...(whatsappIds
        ? {
            whatsappIds,
            whatsappId: whatsappIds[0],
          }
        : {}),
      // Empty string clears Instagram/Facebook on edit (sync treats defined as authoritative).
      ...(showIg ? { instagramId: instagramId ?? "" } : {}),
      ...(showFb ? { facebookId: facebookId ?? "" } : {}),
    };
  };

  const handleMatchError = (err: unknown, body: Record<string, unknown>) => {
    if (err instanceof ApiError && err.status === 409) {
      const data = err.data as { matches?: ContactMatch[]; error?: string };
      if (data?.error === "customer_match" && data.matches?.length) {
        setMatches(data.matches);
        setPendingBody(body);
        const formName = String(body.name ?? "");
        const matchName = data.matches[0]?.name ?? "";
        if (!isUnknown(formName) && !isUnknown(matchName) && formName && matchName && formName !== matchName) {
          setKeepName(formName);
        } else {
          setKeepName(isUnknown(formName) ? matchName || formName : formName || matchName);
        }
        return;
      }
    }
    const message = err instanceof Error ? err.message : "Failed to save contact";
    setError(message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMatches(null);

    if (!accountId) {
      setError("Workspace is not ready. Refresh and try again.");
      return;
    }

    const body = buildBody();
    const hasChannel =
      Boolean(body.emails?.length) ||
      Boolean(body.whatsappIds?.length) ||
      Boolean(body.instagramId) ||
      Boolean(body.facebookId);
    if (!body.name && !hasChannel) {
      setError("Add a name or at least one channel id.");
      return;
    }

    try {
      if (isEditing && initialData?.id) {
        await updateContact.mutateAsync({ id: initialData.id, body });
      } else {
        await createContact.mutateAsync({ accountId, ...body });
      }
      onClose();
    } catch (err: unknown) {
      handleMatchError(err, body);
    }
  };

  const handleMerge = async () => {
    if (!matches?.length || !pendingBody) return;
    const target = matches[0]!;
    const formName = String(pendingBody.name ?? "");
    const matchName = target.name ?? "";
    const nameConflict =
      !isUnknown(formName) &&
      !isUnknown(matchName) &&
      Boolean(formName) &&
      Boolean(matchName) &&
      formName !== matchName;

    if (nameConflict && !keepName.trim()) {
      setError("Choose which name to keep.");
      return;
    }

    const resolvedName = keepName.trim() || formName || matchName || "Unknown";

    try {
      if (isEditing && initialData?.id && initialData.id !== target.id) {
        await mergeContacts.mutateAsync({
          targetId: target.id,
          sourceIds: [initialData.id],
          keepName: resolvedName,
        });
        await updateContact.mutateAsync({
          id: target.id,
          body: {
            ...pendingBody,
            force: true,
            keepName: resolvedName,
          },
        });
      } else if (isEditing && initialData?.id) {
        await updateContact.mutateAsync({
          id: initialData.id,
          body: {
            ...pendingBody,
            mergeIntoId: target.id,
            keepName: resolvedName,
            force: true,
          },
        });
      } else {
        await createContact.mutateAsync({
          accountId,
          ...pendingBody,
          mergeIntoId: target.id,
          keepName: resolvedName,
          force: true,
        });
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Merge failed";
      setError(message);
    }
  };

  const formName = formData.name.trim();
  const matchName = matches?.[0]?.name ?? "";
  const showNamePicker =
    matches &&
    !isUnknown(formName) &&
    !isUnknown(matchName) &&
    formName &&
    matchName &&
    formName !== matchName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="contact-modal-title" className="text-lg font-semibold tracking-tight">
            {matches ? "Possible duplicate" : isEditing ? "Edit contact" : "Add contact"}
          </h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {matches ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800">
                  {error}
                </div>
              )}
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3">
                <p className="text-sm font-semibold text-amber-950">Possible duplicate</p>
                <p className="mt-1 text-sm text-amber-900/80">
                  This email, WhatsApp, or Instagram already belongs to another contact. Merge
                  them instead of creating a second record.
                </p>
              </div>
              <ul className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                {matches.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium">{m.name || "Unknown"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{m.id}</span>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[
                        ...(m.emails ?? []),
                        ...(m.whatsappIds ?? []),
                        m.identifiers?.instagram,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </li>
                ))}
              </ul>
              {showNamePicker && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Which name should we keep?</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setKeepName(formName)}
                      className={
                        keepName === formName
                          ? "rounded-lg border-2 border-primary bg-primary/5 px-3 py-3 text-left text-sm font-medium text-foreground"
                          : "rounded-lg border border-border bg-background px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/40"
                      }
                    >
                      {formName}
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeepName(matchName)}
                      className={
                        keepName === matchName
                          ? "rounded-lg border-2 border-primary bg-primary/5 px-3 py-3 text-left text-sm font-medium text-foreground"
                          : "rounded-lg border border-border bg-background px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/40"
                      }
                    >
                      {matchName}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/40 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMatches(null);
                  setPendingBody(null);
                }}
                disabled={isPending}
              >
                Back
              </Button>
              <Button type="button" onClick={() => void handleMerge()} disabled={isPending}>
                {isPending ? "Merging…" : "Merge duplicate"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Jane Doe"
                />
                <p className="text-xs text-muted-foreground">
                  We’ll warn you if this email, WhatsApp, or Instagram is already on another
                  contact.
                </p>
              </div>

              {showEmail && (
                <MultiStringField
                  label="Email"
                  values={formData.emails}
                  onChange={(emails) => setFormData({ ...formData, emails })}
                  placeholder="jane@example.com"
                />
              )}

              {showWa && (
                <WhatsAppMultiField
                  values={formData.whatsappIds}
                  onChange={(whatsappIds) => setFormData({ ...formData, whatsappIds })}
                />
              )}

              {showIg && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Instagram</label>
                  <Input
                    value={formData.instagramId}
                    onChange={(e) => setFormData({ ...formData, instagramId: e.target.value })}
                    placeholder="username"
                  />
                </div>
              )}

              {showFb && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Facebook (User / Page-scoped ID)</label>
                  <Input
                    value={formData.facebookId || ""}
                    onChange={(e) => setFormData({ ...formData, facebookId: e.target.value })}
                    placeholder="PSID / Facebook User ID"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/40 px-6 py-4">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !accountId}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
