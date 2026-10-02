import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Sparkles } from "lucide-react";
import { useAuthStore } from "../../store/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  useAgentSkillRuns,
  useAgentSkills,
  useCannedReplies,
  useCreateCannedReply,
  useDeleteCannedReply,
  useFeatureFlag,
  useUpdateCannedReply,
} from "../../api";

/**
 * Tenant view: read-only premade skills status + canned replies + recent runs.
 * Enable/disable skills and LLM keys are managed in platform-admin per tenant.
 */
export function SkillsPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const { data: agenticFlag } = useFeatureFlag("agentic_replies_enabled");
  const { data: skillsData, isLoading: loadingSkills } = useAgentSkills();
  const { data: canned, isLoading: loadingCanned } = useCannedReplies();
  const { data: runsData } = useAgentSkillRuns();
  const createCanned = useCreateCannedReply();
  const updateCanned = useUpdateCannedReply();
  const deleteCanned = useDeleteCannedReply();

  const [newName, setNewName] = useState("");
  const [newShortcut, setNewShortcut] = useState("");
  const [newBody, setNewBody] = useState("");

  const skills = skillsData?.skills ?? [];

  if (!canManage) {
    return <Navigate to="/inbox" replace />;
  }

  const addCanned = async () => {
    if (!newName.trim() || !newShortcut.trim() || !newBody.trim()) {
      toast.error("Name, shortcut, and body are required");
      return;
    }
    try {
      await createCanned.mutateAsync({
        name: newName.trim(),
        shortcut: newShortcut.trim(),
        body: newBody.trim(),
      });
      setNewName("");
      setNewShortcut("");
      setNewBody("");
      toast.success("Canned reply created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  };

  const enabledLabels = useMemo(
    () => skills.filter((s) => s.enabled).map((s) => s.name).join(", ") || "none",
    [skills],
  );

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-8 pb-16 sm:px-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Agent Skills</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Premade skills are defined in code. Turn them on for this workspace in{" "}
            <span className="font-medium text-foreground">Platform Admin</span> (features +
            LLM key). Master switch:{" "}
            <span className="font-medium text-foreground">
              Agentic Replies {agenticFlag?.enabled ? "(on)" : "(off)"}
            </span>
            . Enabled skills: {enabledLabels}.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Premade skills</h2>
          {loadingSkills ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {skills.map((s) => (
                <div key={s.key} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {s.key}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Match:{" "}
                      {s.intents?.length
                        ? s.intents.join(", ")
                        : s.intentGroups?.length
                          ? `group ${s.intentGroups.join(", ")}`
                          : "—"}
                      {s.tools?.length ? ` · tools: ${s.tools.join(", ")}` : ""}
                    </p>
                  </div>
                  <span
                    className={
                      s.enabled
                        ? "shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                        : "shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {s.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Canned replies</h2>
          <p className="text-sm text-muted-foreground">
            Human agents: type <code>/</code> in the inbox composer. Tokens like{" "}
            <code>{"{{name}}"}</code> work.
          </p>
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input
                placeholder="Shortcut (hello)"
                value={newShortcut}
                onChange={(e) => setNewShortcut(e.target.value)}
              />
              <Button onClick={() => void addCanned()} disabled={createCanned.isPending}>
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Body — Hi {{name}}, …"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
            />
          </div>
          {loadingCanned ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {(canned ?? []).length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No canned replies yet.</p>
              )}
              {(canned ?? []).map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        /{r.shortcut}
                      </span>
                    </div>
                    <textarea
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      defaultValue={r.body}
                      rows={2}
                      onBlur={(e) => {
                        if (e.target.value !== r.body) {
                          updateCanned.mutate(
                            { id: r.id, body: e.target.value },
                            {
                              onSuccess: () => toast.success("Saved"),
                              onError: (err) =>
                                toast.error(err instanceof Error ? err.message : "Save failed"),
                            },
                          );
                        }
                      }}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      deleteCanned.mutate(r.id, { onSuccess: () => toast.success("Deleted") })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent skill runs</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Skill</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(runsData?.runs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-muted-foreground">
                      No runs yet.
                    </td>
                  </tr>
                )}
                {(runsData?.runs ?? []).map((run) => (
                  <tr key={run.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{run.skillKey}</td>
                    <td className="px-3 py-2">{run.action}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                      {run.detail ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
