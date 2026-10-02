import { describe, expect, it } from "vitest";
import { getMessagingWindow } from "./ConversationWindowService.js";

const HOUR = 60 * 60 * 1000;

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR);
}

describe("getMessagingWindow", () => {
  describe("WhatsApp", () => {
    it("allows normal send within 24h", () => {
      const window = getMessagingWindow("whatsapp", hoursAgo(1));
      expect(window.state).toBe("ACTIVE");
      expect(window.canSendNormalMessage).toBe(true);
      expect(window.requiresTemplate).toBe(false);
    });

    it("requires template after 24h", () => {
      const window = getMessagingWindow("whatsapp", hoursAgo(25));
      expect(window.state).toBe("TEMPLATE_REQUIRED");
      expect(window.canSendNormalMessage).toBe(false);
      expect(window.requiresTemplate).toBe(true);
    });

    it("requires template when customer never messaged", () => {
      const window = getMessagingWindow("whatsapp", null);
      expect(window.state).toBe("TEMPLATE_REQUIRED");
      expect(window.requiresTemplate).toBe(true);
    });
  });

  describe("Instagram", () => {
    it("allows normal send within 24h", () => {
      const window = getMessagingWindow("instagram", hoursAgo(1));
      expect(window.state).toBe("ACTIVE");
      expect(window.canSendNormalMessage).toBe(true);
      expect(window.requiresHumanAgentTag).toBe(false);
      expect(window.requiresExternalInbox).toBe(false);
    });

    it("blocks CEP send and shows external inbox when human agent is disabled (24h–7d)", () => {
      const window = getMessagingWindow("instagram", hoursAgo(48), {
        instagramHumanAgentEnabled: false,
      });
      expect(window.state).toBe("EXTENDED");
      expect(window.canSendNormalMessage).toBe(false);
      expect(window.requiresHumanAgentTag).toBe(false);
      expect(window.requiresExternalInbox).toBe(true);
    });

    it("allows HUMAN_AGENT send when permission is enabled (24h–7d)", () => {
      const window = getMessagingWindow("instagram", hoursAgo(48), {
        instagramHumanAgentEnabled: true,
      });
      expect(window.state).toBe("EXTENDED");
      expect(window.canSendNormalMessage).toBe(true);
      expect(window.requiresHumanAgentTag).toBe(true);
      expect(window.requiresExternalInbox).toBe(false);
    });

    it("blocks send after 7 days", () => {
      const window = getMessagingWindow("instagram", hoursAgo(24 * 8));
      expect(window.state).toBe("EXPIRED");
      expect(window.canSendNormalMessage).toBe(false);
      expect(window.requiresExternalInbox).toBe(true);
    });
  });

  describe("Email", () => {
    it("always allows send", () => {
      const window = getMessagingWindow("email", hoursAgo(24 * 30));
      expect(window.state).toBe("ACTIVE");
      expect(window.canSendNormalMessage).toBe(true);
    });
  });
});
