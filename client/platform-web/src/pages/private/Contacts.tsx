import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MoreHorizontal, Plus, Edit2, Trash2, Loader2, MessageSquare, Upload, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  useAccounts,
  useContacts,
  useDeleteContact,
  useEnabledChannelTypes,
  useBlockedContacts,
  useUnblockCustomer,
} from "../../api";
import { ContactModal, type ContactFormData } from "../../components/contacts/ContactModal";
import { ContactCsvImportModal } from "../../components/contacts/ContactCsvImportModal";
import { formatWhatsAppDisplay } from "../../components/inbox/utils";
import { useAppStore } from "../../store";

function joinList(primary: string | null | undefined, list?: string[] | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(list ?? []), primary]) {
    const v = raw?.trim();
    if (!v) continue;
    const key = v.replace(/[^\d]/g, "") || v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.length ? out.join(", ") : "—";
}

function instagramUsernameForEdit(c: {
  instagramId?: string | null;
  instagramDetails?: { username?: string | null } | null;
  identifiers?: { instagram?: string } | null;
  identities?: Array<{
    channel?: string;
    displayId?: string;
    metadata?: { username?: string | null };
  }>;
}): string {
  const candidates = [
    c.instagramDetails?.username,
    c.identities?.find((i) => i.channel === "instagram")?.metadata?.username,
    c.identities?.find((i) => i.channel === "instagram")?.displayId,
    c.instagramId,
    c.identifiers?.instagram,
  ]
    .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
    .map((v) => v.replace(/^@/, "").trim());

  const username = candidates.find((v) => v && !/^\d{5,}$/.test(v));
  return username ?? "";
}

function instagramUsernameForTable(c: {
  instagramId?: string | null;
  instagramDetails?: { username?: string | null; senderName?: string | null } | null;
  identifiers?: { instagram?: string } | null;
  identities?: Array<{
    channel?: string;
    displayId?: string;
    metadata?: { username?: string | null; senderName?: string | null };
  }>;
}): string {
  const handle = instagramUsernameForEdit(c);
  if (handle) return `@${handle}`;
  return "—";
}

function joinWhatsApp(primary: string | null | undefined, list?: string[] | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(list ?? []), primary]) {
    const v = raw?.trim();
    if (!v) continue;
    const formatted = formatWhatsAppDisplay(v);
    const key = formatted.replace(/[^\d]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(formatted);
  }
  return out.length ? out.join(", ") : "—";
}

function matchesSearch(
  haystackParts: Array<string | null | undefined>,
  query: string,
): boolean {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return true;
  const text = haystackParts.filter(Boolean).join(" ").toLowerCase();
  if (text.includes(lowerQuery)) return true;
  const digitsQuery = lowerQuery.replace(/[^\d]/g, "");
  if (digitsQuery.length < 4) return false;
  const digitsHay = text.replace(/[^\d]/g, "");
  return digitsHay.includes(digitsQuery);
}

export function ContactsPage() {
  const navigate = useNavigate();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const accountId = accounts?.[0]?.id || "";
  const { data: contacts, isLoading: contactsLoading } = useContacts(accountId);
  const { enabledChannels, channelsReady } = useEnabledChannelTypes();
  const deleteContact = useDeleteContact();
  const { data: blockedRows, isLoading: blockedLoading } = useBlockedContacts();
  const unblockCustomer = useUnblockCustomer();
  const { selectedContactId, setSelectedContactId } = useAppStore();
  // Wait for flags — never flash all channel columns then hide them
  const showEmail = channelsReady && enabledChannels.includes("email");
  const showWa = channelsReady && enabledChannels.includes("whatsapp");
  const showIg = channelsReady && enabledChannels.includes("instagram");
  const showFb = channelsReady && enabledChannels.includes("facebook");
  const [searchQuery, setSearchQuery] = useState("");
  const [listMode, setListMode] = useState<"all" | "blocked">("all");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactFormData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isLoading =
    listMode === "blocked"
      ? blockedLoading
      : accountsLoading || (!!accountId && contactsLoading);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!searchQuery.trim()) return contacts;
    return contacts.filter((c) =>
      matchesSearch(
        [
          c.id,
          c.name,
          c.email,
          c.whatsappId,
          ...(c.emails ?? []),
          ...(c.whatsappIds ?? []),
          c.identifiers?.instagram,
          c.identifiers?.facebook,
          c.facebookId,
          c.identifiers?.whatsapp,
        ],
        searchQuery,
      ),
    );
  }, [contacts, searchQuery]);

  const filteredBlocked = useMemo(() => {
    if (!blockedRows) return [];
    if (!searchQuery.trim()) return blockedRows;
    return blockedRows.filter((row) =>
      matchesSearch(
        [row.customerId, row.customer?.name, row.customer?.email, row.customer?.whatsappId],
        searchQuery,
      ),
    );
  }, [blockedRows, searchQuery]);

  const openCreate = () => {
    setEditingContact(null);
    setIsModalOpen(true);
  };

  const openEdit = (c: (typeof filteredContacts)[number]) => {
    setOpenDropdownId(null);
    setEditingContact({
      id: c.id,
      name: c.name || "",
      emails: c.emails?.length ? c.emails : c.email ? [c.email] : [""],
      whatsappIds: c.whatsappIds?.length
        ? c.whatsappIds
        : c.whatsappId || c.identifiers?.whatsapp
          ? [c.whatsappId || c.identifiers!.whatsapp]
          : [""],
      instagramId: instagramUsernameForEdit(c),
      facebookId: c.facebookId || c.identifiers?.facebook || "",
    });
    setIsModalOpen(true);
  };

  const openChat = (c: (typeof filteredContacts)[number]) => {
    setOpenDropdownId(null);
    setSelectedContactId(c.id);
    navigate("/inbox");
  };

  const openDelete = (c: (typeof filteredContacts)[number]) => {
    setOpenDropdownId(null);
    setPendingDelete({ id: c.id, name: c.name?.trim() || "this contact" });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    deleteContact.mutate(id, {
      onSuccess: (result) => {
        if (selectedContactId === id) setSelectedContactId(null);
        toast.success(
          result.deletedMessages > 0
            ? `Deleted ${name} and ${result.deletedMessages} message${
                result.deletedMessages === 1 ? "" : "s"
              }`
            : `Deleted ${name}`,
        );
        setPendingDelete(null);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to delete contact");
        setPendingDelete(null);
      },
    });
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete contact?"
        description={
          <>
            This permanently removes <strong>{pendingDelete?.name}</strong> and all of their
            WhatsApp, Instagram, Facebook, and Email conversations. This cannot be undone.
          </>
        }
        confirmLabel="Delete contact"
        cancelLabel="Cancel"
        destructive
        confirming={deleteContact.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <div className="border-b border-border bg-card/50 px-6 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground leading-tight">Contacts</h1>
            <p className="text-xs text-muted-foreground">
              People you talk to across channels.
            </p>
            <div
              className="mt-3 inline-flex w-fit items-center rounded-lg border border-border bg-muted/50 p-0.5"
              role="tablist"
              aria-label="Contact list filter"
            >
              <button
                type="button"
                role="tab"
                aria-selected={listMode === "all"}
                className={`min-w-[4.5rem] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  listMode === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setListMode("all")}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listMode === "blocked"}
                className={`min-w-[4.5rem] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  listMode === "blocked"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setListMode("blocked")}
              >
                Blocked{blockedRows?.length ? ` (${blockedRows.length})` : ""}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-10 shrink-0 gap-2"
              onClick={() => setIsImportOpen(true)}
              disabled={!accountId || accountsLoading || listMode === "blocked"}
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button
              className="h-10 shrink-0 gap-2"
              onClick={openCreate}
              disabled={!accountId || accountsLoading || listMode === "blocked"}
            >
              <Plus className="h-4 w-4" />
              Add contact
            </Button>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Search by name, email, or number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide bg-muted/20 px-6 py-6 sm:px-8">
        <Card className="shadow-sm">
          <CardContent className="overflow-x-auto p-0">
            {listMode === "blocked" ? (
              <div className="min-w-[36rem]">
                <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-3 text-sm font-medium text-muted-foreground sm:px-5">
                  <div className="min-w-0 flex-1">Name</div>
                  <div className="hidden w-44 shrink-0 sm:block">Blocked</div>
                  <div className="w-24 shrink-0" />
                </div>
                <div className="divide-y divide-border">
                  {isLoading && (
                    <div className="px-5 py-12 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </div>
                  )}
                  {!isLoading && filteredBlocked.length === 0 && (
                    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                      {searchQuery.trim()
                        ? "No blocked contacts match your search"
                        : "No blocked customers"}
                    </div>
                  )}
                  {!isLoading &&
                    filteredBlocked.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-medium text-destructive">
                            <Ban className="h-4 w-4" />
                          </div>
                          <span className="truncate font-medium text-sm">
                            {row.customer?.name || "—"}
                          </span>
                        </div>
                        <div className="hidden w-44 shrink-0 truncate text-sm text-muted-foreground sm:block">
                          {row.createdAt
                            ? new Date(row.createdAt).toLocaleString()
                            : "—"}
                        </div>
                        <div className="w-24 shrink-0 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={unblockCustomer.isPending}
                            onClick={() => {
                              unblockCustomer.mutate(row.customerId, {
                                onSuccess: () => toast.success("Customer unblocked"),
                                onError: (err) =>
                                  toast.error(err.message || "Failed to unblock"),
                              });
                            }}
                          >
                            Unblock
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-3 text-sm font-medium text-muted-foreground sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">Name</div>
                  {showEmail && (
                    <div className="hidden min-w-0 flex-1 truncate lg:block">Email</div>
                  )}
                  {showWa && (
                    <div className="hidden min-w-0 flex-1 sm:block">WhatsApp</div>
                  )}
                  {showIg && (
                    <div className="hidden min-w-0 flex-1 md:block">Instagram</div>
                  )}
                  {showFb && (
                    <div className="hidden min-w-0 flex-1 xl:block">Facebook</div>
                  )}
                  <div className="w-10 shrink-0" aria-hidden />
                </div>
                <div
                  className="divide-y divide-border"
                  onClick={() => setOpenDropdownId(null)}
                >
                  {isLoading && (
                    <div className="px-5 py-12 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </div>
                  )}
                  {!isLoading && filteredContacts.length === 0 && (
                    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                      {searchQuery.trim() ? "No search results found" : "No contacts yet"}
                    </div>
                  )}
                  {!isLoading &&
                    filteredContacts.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => openChat(c)}
                        className="relative flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:gap-4 sm:px-5"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {c.name
                              ? c.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)
                              : "?"}
                          </div>
                          <span className="truncate text-sm font-medium">
                            {c.name || "—"}
                          </span>
                        </div>
                        {showEmail && (
                          <div className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground lg:block">
                            {joinList(c.email, c.emails)}
                          </div>
                        )}
                        {showWa && (
                          <div className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
                            {joinWhatsApp(
                              c.whatsappId ?? c.identifiers?.whatsapp,
                              c.whatsappIds,
                            )}
                          </div>
                        )}
                        {showIg && (
                          <div className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground md:block">
                            {instagramUsernameForTable(c)}
                          </div>
                        )}
                        {showFb && (
                          <div className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground xl:block">
                            {c.facebookDetails?.senderName ||
                              c.facebookId ||
                              c.identifiers?.facebook ||
                              "—"}
                          </div>
                        )}
                        <div className="relative w-10 shrink-0 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === c.id ? null : c.id);
                            }}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {openDropdownId === c.id && (
                            <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-md">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openChat(c);
                                }}
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Chat
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(c);
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDelete(c);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingContact(null);
        }}
        initialData={editingContact}
        accountId={accountId}
        enabledChannels={enabledChannels}
      />

      <ContactCsvImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </div>
  );
}
