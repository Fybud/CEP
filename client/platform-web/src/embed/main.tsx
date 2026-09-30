import { createRoot } from "react-dom/client";
import { EmbedWebChat } from "./EmbedWebChat";

declare global {
  interface Window {
    CepWebChat?: {
      init: (options?: EmbedInitOptions) => void;
    };
  }
}

export type EmbedInitOptions = {
  /** Override API base. Defaults to script origin or data-api-base. */
  apiBase?: string;
  title?: string;
  color?: string;
  /** Unique storage key per tenant (auto-derived from api host when omitted). */
  storageKey?: string;
};

function findEmbedScript(): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[src*="webchat"]'),
  );
  return scripts[scripts.length - 1] ?? null;
}

function resolveApiBase(script: HTMLScriptElement | null, override?: string): string {
  if (override?.trim()) return override.trim().replace(/\/$/, "");

  const fromAttr = script?.getAttribute("data-api-base")?.trim();
  if (fromAttr) return fromAttr.replace(/\/$/, "");

  // Script hosted on the tenant API (recommended):
  //   https://api.cep-demo.fybud.com/embed/webchat.js  → api base = that origin
  if (script?.src) {
    try {
      const origin = new URL(script.src).origin;
      if (origin && origin !== "null") return origin;
    } catch {
      /* fall through */
    }
  }

  const baked = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (baked) return baked.replace(/\/$/, "");

  return window.location.origin;
}

function resolveStorageKey(apiBase: string, explicit?: string | null) {
  if (explicit?.trim()) return explicit.trim();
  try {
    const host = new URL(apiBase).host.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `cep_web_chat_${host}`;
  } catch {
    return "cep_web_chat_id";
  }
}

function mount(options: EmbedInitOptions = {}) {
  if (typeof document === "undefined") return;

  const existing = document.getElementById("cep-webchat-root");
  if (existing) return;

  const script = findEmbedScript();
  const apiBase = resolveApiBase(script, options.apiBase);
  const title =
    options.title ?? script?.getAttribute("data-title") ?? "Chat with us";
  const color =
    options.color ?? script?.getAttribute("data-color") ?? "#0f766e";
  const storageKey = resolveStorageKey(
    apiBase,
    options.storageKey ?? script?.getAttribute("data-storage-key"),
  );

  const host = document.createElement("div");
  host.id = "cep-webchat-root";
  document.body.appendChild(host);

  createRoot(host).render(
    <EmbedWebChat
      apiBase={apiBase}
      title={title}
      color={color}
      storageKey={storageKey}
    />,
  );
}

window.CepWebChat = { init: mount };

if (typeof document !== "undefined") {
  const boot = () => mount();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
