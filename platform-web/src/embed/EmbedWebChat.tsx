import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  COUNTRY_DIAL_OPTIONS,
  DEFAULT_WHATSAPP_DIAL,
  composeWhatsApp,
} from "../utils/phone";

export type EmbedWebChatProps = {
  /** Tenant API origin, e.g. https://api.cep-demo.fybud.com */
  apiBase: string;
  /** Header title */
  title?: string;
  /** Accent color override (defaults to FyBud lavender) */
  color?: string;
  /** localStorage namespace so multiple tenants on one browser don't collide */
  storageKey?: string;
};

type ChatMessage = {
  id: string;
  content: string;
  direction: "incoming" | "outgoing";
  createdAt: string;
};

/** FyBud portfolio palette — navy + lavender */
const FYBUD = {
  navy: "#12122b",
  navyDeep: "#0a0918",
  navyMid: "#1c1b35",
  accent: "#8b7df0",
  accentLight: "#b8a7f5",
  accentDim: "#7c66d9",
  accentDeep: "#5c4db5",
  accentSurface: "#ebe8f8",
  offWhite: "#f6f5fb",
  muted: "#6f6a86",
  border: "#e6e2f0",
  ink: "#12122b",
} as const;

const DEFAULT_COLOR = FYBUD.accent;

function normalizeApiBase(raw: string) {
  return raw.replace(/\/$/, "");
}

function isValidNational(national: string) {
  const digits = national.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 12;
}

function FyBudMark({ size = 18 }: { size?: number }) {
  return (
    <span
      style={{
        fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.04em",
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "baseline",
      }}
      aria-label="FyBud"
    >
      <span style={{ color: "#fff" }}>Fy</span>
      <span className="cep-wc-grad-text">Bud</span>
    </span>
  );
}

export function EmbedWebChat({
  apiBase,
  title = "Chat with us",
  color = DEFAULT_COLOR,
  storageKey = "cep_web_chat_id",
}: EmbedWebChatProps) {
  const base = normalizeApiBase(apiBase);

  const widgetHeaders = (json = false): HeadersInit => {
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    return h;
  };

  const [open, setOpen] = useState(false);
  const [externalId, setExternalId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const [name, setName] = useState("");
  const [dialCode, setDialCode] = useState(DEFAULT_WHATSAPP_DIAL);
  const [nationalNumber, setNationalNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async (id: string) => {
    try {
      const res = await fetch(
        `${base}/api/v1/web-chat/messages?externalId=${encodeURIComponent(id)}`,
        { headers: widgetHeaders() },
      );
      if (!res.ok) return;
      const data = (await res.json()) as ChatMessage[];
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      /* ignore transient poll errors */
    }
  };

  const startSession = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Please enter your name");
      return;
    }
    if (!isValidNational(nationalNumber)) {
      setFormError("Enter a valid WhatsApp number");
      return;
    }

    const whatsapp = composeWhatsApp({ dial: dialCode, national: nationalNumber });
    const fullDigits = whatsapp.replace(/\D/g, "");
    if (fullDigits.length < 10 || fullDigits.length > 15) {
      setFormError("Enter a valid WhatsApp number");
      return;
    }

    setBooting(true);
    try {
      const res = await fetch(`${base}/api/v1/web-chat`, {
        method: "POST",
        headers: widgetHeaders(true),
        body: JSON.stringify({
          name: name.trim(),
          whatsapp,
          externalId: externalId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error || "Could not start chat");
        return;
      }
      setExternalId(data.externalId);
      try {
        localStorage.setItem(storageKey, data.externalId);
      } catch {
        /* private mode */
      }
      await fetchMessages(data.externalId);
    } catch {
      setFormError("Network error — please try again");
    } finally {
      setBooting(false);
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !externalId || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    const optimistic: ChatMessage = {
      id: `tmp_${Date.now()}`,
      content,
      direction: "incoming",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await fetch(`${base}/api/v1/web-chat/messages`, {
        method: "POST",
        headers: widgetHeaders(true),
        body: JSON.stringify({ externalId, content }),
      });
      await fetchMessages(externalId);
    } catch {
      setFormError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!open || !externalId) return;
    void fetchMessages(externalId);
    const t = setInterval(() => void fetchMessages(externalId), 3000);
    return () => clearInterval(t);
  }, [open, externalId, base]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const cssVars = {
    ["--cep-wc-color" as string]: color,
    ["--cep-wc-navy" as string]: FYBUD.navy,
    ["--cep-wc-accent" as string]: color,
    ["--cep-wc-accent-light" as string]: FYBUD.accentLight,
  } as CSSProperties;

  const primaryBtn: CSSProperties = {
    ...primaryBtnStyle,
    background: `linear-gradient(135deg, ${FYBUD.accentDeep} 0%, ${color} 50%, ${FYBUD.accentLight} 100%)`,
    backgroundSize: "200% 200%",
  };

  return (
    <div style={{ ...rootStyle, ...cssVars }} data-cep-webchat>
      <style>{WIDGET_CSS}</style>
      {open ? (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <div style={{ minWidth: 0 }}>
              <FyBudMark size={20} />
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  marginTop: 8,
                  color: "rgba(246, 245, 251, 0.92)",
                }}
              >
                {title}
              </div>
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2, color: FYBUD.accentLight }}>
                We typically reply within minutes
              </div>
            </div>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              style={iconBtnStyle}
            >
              ✕
            </button>
          </div>

          {!externalId ? (
            <div style={formWrapStyle}>
              <label style={labelStyle}>
                Name
                <input
                  style={inputStyle}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </label>
              <label style={labelStyle}>
                WhatsApp number
                <div style={phoneRowStyle}>
                  <select
                    aria-label="Country code"
                    value={dialCode}
                    onChange={(e) => setDialCode(e.target.value)}
                    style={dialSelectStyle}
                    disabled={booting}
                  >
                    {COUNTRY_DIAL_OPTIONS.map((c) => (
                      <option key={c.dial} value={c.dial}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    value={nationalNumber}
                    onChange={(e) =>
                      setNationalNumber(e.target.value.replace(/[^\d\s-]/g, ""))
                    }
                    placeholder="9876543210"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    disabled={booting}
                  />
                </div>
              </label>
              {formError && <p style={errorStyle}>{formError}</p>}
              <button
                type="button"
                className="cep-wc-btn"
                onClick={() => void startSession()}
                disabled={booting}
                style={{ ...primaryBtn, opacity: booting ? 0.7 : 1, marginTop: 4 }}
              >
                {booting ? "Connecting…" : "Start chat"}
              </button>
            </div>
          ) : (
            <>
              <div style={messagesStyle}>
                {messages.length === 0 && (
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: FYBUD.muted,
                      marginTop: 24,
                    }}
                  >
                    Say hello — send your first message.
                  </p>
                )}
                {messages.map((msg) => {
                  const isVisitor = msg.direction === "incoming";
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: isVisitor ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          ...bubbleStyle,
                          background: isVisitor
                            ? `linear-gradient(135deg, ${FYBUD.accentDeep}, ${color})`
                            : "#fff",
                          color: isVisitor ? "#fff" : FYBUD.ink,
                          border: isVisitor ? "none" : `1px solid ${FYBUD.border}`,
                          boxShadow: isVisitor
                            ? "0 8px 20px -10px rgba(92, 77, 181, 0.55)"
                            : "none",
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form onSubmit={sendMessage} style={composerStyle}>
                <input
                  style={{ ...inputStyle, flex: 1, margin: 0 }}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message…"
                />
                <button
                  type="submit"
                  className="cep-wc-btn"
                  disabled={!input.trim() || sending}
                  style={{
                    ...primaryBtn,
                    width: "auto",
                    padding: "10px 16px",
                    opacity: !input.trim() || sending ? 0.5 : 1,
                  }}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          aria-label="Open chat"
          className="cep-wc-fab"
          onClick={() => setOpen(true)}
          style={fabStyle}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Scoped CSS — portfolio GradientText sweep + FAB shimmer (no framer-motion in embed). */
const WIDGET_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap');

@keyframes cep-wc-grad-shift {
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
}
@keyframes cep-wc-fab-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes cep-wc-glow {
  0%, 100% { box-shadow: 0 12px 32px -8px rgba(92, 77, 181, 0.55), 0 0 0 0 rgba(184, 167, 245, 0.35); }
  50% { box-shadow: 0 16px 40px -6px rgba(139, 125, 240, 0.7), 0 0 0 6px rgba(184, 167, 245, 0.18); }
}

[data-cep-webchat] .cep-wc-grad-text {
  display: inline-block;
  background: linear-gradient(110deg, #b8a7f5 0%, #ffffff 45%, #8b7df0 70%, #b8a7f5 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: cep-wc-grad-shift 4.5s linear infinite;
}

[data-cep-webchat] .cep-wc-fab {
  background: linear-gradient(135deg, #5c4db5 0%, #8b7df0 40%, #b8a7f5 70%, #8b7df0 100%) !important;
  background-size: 220% 220% !important;
  animation: cep-wc-fab-shift 5s ease infinite, cep-wc-glow 3.2s ease-in-out infinite;
}

[data-cep-webchat] .cep-wc-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}
[data-cep-webchat] .cep-wc-btn:disabled {
  cursor: not-allowed;
}
[data-cep-webchat] input:focus,
[data-cep-webchat] select:focus {
  border-color: #8b7df0 !important;
  box-shadow: 0 0 0 3px rgba(139, 125, 240, 0.22);
}
`;

const rootStyle: CSSProperties = {
  all: "initial",
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  position: "fixed",
  right: 20,
  bottom: 20,
  zIndex: 2147483000,
  boxSizing: "border-box",
};

const fabStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panelStyle: CSSProperties = {
  width: 360,
  maxWidth: "calc(100vw - 24px)",
  height: 520,
  maxHeight: "calc(100vh - 40px)",
  background: FYBUD.offWhite,
  borderRadius: 18,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 32px 80px -36px rgba(18, 18, 43, 0.45)",
  border: `1px solid ${FYBUD.border}`,
};

const headerStyle: CSSProperties = {
  background: `radial-gradient(ellipse 90% 120% at 10% -20%, rgba(184, 167, 245, 0.35), transparent 55%), linear-gradient(160deg, ${FYBUD.navyDeep} 0%, ${FYBUD.navy} 55%, ${FYBUD.navyMid} 100%)`,
  color: "#fff",
  padding: "16px 18px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const iconBtnStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 999,
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: "6px 8px",
  opacity: 0.95,
};

const formWrapStyle: CSSProperties = {
  padding: "20px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  flex: 1,
  justifyContent: "flex-start",
  background: FYBUD.offWhite,
  boxSizing: "border-box",
  width: "100%",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: FYBUD.ink,
  width: "100%",
  boxSizing: "border-box",
};

const phoneRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  width: "100%",
  alignItems: "stretch",
};

const dialSelectStyle: CSSProperties = {
  border: `1px solid ${FYBUD.border}`,
  borderRadius: 10,
  padding: "0 8px",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  color: FYBUD.ink,
  fontFamily: "inherit",
  minWidth: 118,
  maxWidth: 132,
  flexShrink: 0,
  cursor: "pointer",
  height: 42,
  boxSizing: "border-box",
};

const inputStyle: CSSProperties = {
  border: `1px solid ${FYBUD.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: FYBUD.ink,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
  height: 42,
};

const primaryBtnStyle: CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "12px 14px",
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  width: "100%",
  fontFamily: "inherit",
  boxShadow: "0 12px 28px -12px rgba(92, 77, 181, 0.65)",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#b42318",
};

const messagesStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 16,
  background: `linear-gradient(180deg, ${FYBUD.accentSurface} 0%, ${FYBUD.offWhite} 40%)`,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const bubbleStyle: CSSProperties = {
  maxWidth: "80%",
  borderRadius: 14,
  padding: "8px 12px",
  fontSize: 13,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const composerStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 12,
  borderTop: `1px solid ${FYBUD.border}`,
  background: "#fff",
};
