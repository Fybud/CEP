import { useState } from "react";
import { toast } from "sonner";
import { StickyNote, Trash2, Plus, X, Loader2 } from "lucide-react";
import { useHandoverNotes, useAddHandoverNote, useDeleteHandoverNote } from "../../api";
import { useAuthStore } from "../../store/auth";
import { formatDistanceToNow } from "date-fns";

export function HandoverNotes({ contactId }: { contactId: string }) {
  const { data: notes, isLoading } = useHandoverNotes(contactId);
  const addNote = useAddHandoverNote();
  const deleteNote = useDeleteHandoverNote();
  const user = useAuthStore((s) => s.user);

  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [newNote, setNewNote] = useState("");

  if (isLoading) return null;

  const hasNotes = notes && notes.length > 0;

  if (!expanded && !hasNotes) {
    return (
      <div className="shrink-0 border-b border-border bg-amber-500/5 px-4 py-2">
        <button
          onClick={() => {
            setExpanded(true);
            setComposing(true);
          }}
          className="text-xs font-medium text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1.5"
        >
          <StickyNote className="h-3.5 w-3.5" />
          Add shift/handover note
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="shrink-0 border-b border-border bg-amber-500/10 px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-amber-500/20 transition-colors"
           onClick={() => setExpanded(true)}>
        <div className="flex items-center gap-2 overflow-hidden text-amber-900">
          <StickyNote className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold shrink-0">{notes!.length} Handover Note{notes!.length === 1 ? "" : "s"}</span>
          <span className="text-xs opacity-70 truncate mx-2">— {notes![0].body}</span>
        </div>
      </div>
    );
  }

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    try {
      addNote.mutate({ contactId: contactId, content: newNote });
      setNewNote("");
      setComposing(false);
      toast.success("Note added");
    } catch (err: any) {
      toast.error(err.message || "Failed to add note");
    }
  };

  return (
    <div className="shrink-0 border-b border-border bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-400 p-4 max-h-64 overflow-y-auto relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 font-semibold text-sm">
          <StickyNote className="h-4 w-4" />
          Handover Notes
        </div>
        <button onClick={() => setExpanded(false)} className="hover:bg-amber-200/50 p-1 rounded transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {notes?.map((n) => (
        <div key={n.id} className="mb-3 last:mb-0 pb-3 border-b border-amber-200/50 last:border-0 last:pb-0">
          <div className="flex items-start justify-between">
            <p className="text-xs whitespace-pre-wrap">{n.body}</p>
            {(n.authorId === user?.id || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") && (
              <button
                onClick={() => deleteNote.mutate(n.id)}
                className="ml-3 shrink-0 opacity-50 hover:opacity-100 transition-opacity hover:text-red-600"
                title="Delete note"
              >
                {deleteNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] opacity-70 font-medium">
            <span>{n.author?.name || n.author?.username.split("@")[0] || "Unknown"}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
          </div>
        </div>
      ))}

      {composing ? (
        <div className="mt-3 bg-white dark:bg-black/20 rounded border border-amber-200 dark:border-amber-900/30 overflow-hidden">
          <textarea
            autoFocus
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Write a note for the next agent..."
            className="w-full text-xs p-2 bg-transparent outline-none resize-none min-h-[60px]"
          />
          <div className="flex items-center justify-end gap-2 bg-amber-50/50 dark:bg-black/10 px-2 py-1.5 border-t border-amber-100 dark:border-amber-900/30">
            <button onClick={() => setComposing(false)} className="text-xs px-2 py-1 hover:bg-amber-200/50 rounded font-medium">
              Cancel
            </button>
            <button onClick={handleAdd} disabled={addNote.isPending || !newNote.trim()} className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded font-medium flex items-center gap-1">
              {addNote.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Save Note
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setComposing(true)} className="mt-2 text-xs font-semibold flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
          <Plus className="h-3.5 w-3.5" />
          Add Note
        </button>
      )}
    </div>
  );
}
