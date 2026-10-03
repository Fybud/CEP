import { EmbedWebChat } from "../../embed/EmbedWebChat";
import { apiBaseUrl } from "../../lib/runtimeEnv";

/**
 * In-app / demo bubble. Production third-party sites should load
 * `/embed/webchat.js` instead of importing this component.
 */
export function WebChatWidget() {
  return (
    <EmbedWebChat
      apiBase={apiBaseUrl() || window.location.origin}
      title="Live Chat"
      storageKey="cep_web_chat_demo"
    />
  );
}
