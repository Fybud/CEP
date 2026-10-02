import { EmbedWebChat } from "../../embed/EmbedWebChat";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Public preview page for the embeddable web chat (`/chat`) — FyBud portfolio look. */
export function WebChatPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0918] text-[#f6f5fb]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139,125,240,0.38), transparent), radial-gradient(ellipse 50% 40% at 100% 40%, rgba(184,167,245,0.16), transparent), radial-gradient(ellipse 40% 30% at 0% 80%, rgba(92,77,181,0.2), transparent)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b8a7f5]">
          FyBud · Web Chat
        </p>
        <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-white">Fy</span>
          <span className="fybud-grad-text">Bud</span>
          <span className="mt-2 block text-3xl font-medium text-[#f6f5fb] sm:text-4xl">
            Preview your site widget
          </span>
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-[#9d97b8]">
          Same bubble your customers see. Open it, share a name and WhatsApp number, and
          the thread shows up in the CEP inbox under Web Chat.
        </p>
        <p className="mt-8 text-sm text-[#6f6a86]">
          Use the chat button in the corner to try a conversation.
        </p>
      </div>
      <style>{`
        @keyframes fybud-shift {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
        .fybud-grad-text {
          display: inline-block;
          background: linear-gradient(110deg, #b8a7f5 0%, #ffffff 45%, #8b7df0 70%, #b8a7f5 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: fybud-shift 4.5s linear infinite;
        }
      `}</style>
      <EmbedWebChat
        apiBase={API_BASE || window.location.origin}
        title="Chat with us"
        storageKey="cep_web_chat_preview"
      />
    </div>
  );
}
