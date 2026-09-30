import type { WhatsAppChannelConfig } from "../shared/types.js";

/** Empty defaults — real values come from channels_config (Settings / seed:config). */
export const whatsappConfig: WhatsAppChannelConfig = {
  phoneNumberId: "",
  accessToken: "",
  verifyToken: "",
  appSecret: "",
  businessAccountId: "",
};
