import { useState, useEffect } from "react";
import { useAuthStore } from "../store/auth";

export function useDraft(conversationId: string | undefined) {
  const user = useAuthStore((s: any) => s.user);
  const agentId = user?.id || "unknown";

  const getKey = (cid: string) => `draft_${agentId}_${cid}`;

  const [draft, setDraftState] = useState("");

  // Load from local storage when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setDraftState("");
      return;
    }
    const saved = localStorage.getItem(getKey(conversationId));
    if (saved) {
      setDraftState(saved);
    } else {
      setDraftState("");
    }
  }, [conversationId, agentId]);

  // Save to local storage on change
  const setDraft = (newDraft: string | ((prev: string) => string)) => {
    setDraftState((prev) => {
      const resolved = typeof newDraft === "function" ? newDraft(prev) : newDraft;
      if (conversationId) {
        if (resolved) {
          localStorage.setItem(getKey(conversationId), resolved);
        } else {
          localStorage.removeItem(getKey(conversationId));
        }
      }
      return resolved;
    });
  };

  const clearDraft = () => {
    setDraft("");
  };

  return { draft, setDraft, clearDraft };
}
