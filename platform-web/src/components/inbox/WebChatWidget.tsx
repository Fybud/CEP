import { EmbedWebChat } from "../../embed/EmbedWebChat";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * In-app / demo bubble. Production third-party sites should load
 * `/embed/webchat.js` instead of importing this component.
 */
export function WebChatWidget() {
  return (
    <EmbedWebChat
      apiBase={API_BASE || window.location.origin}
      title="Live Chat"
      storageKey="cep_web_chat_demo"
    />
  );
}
