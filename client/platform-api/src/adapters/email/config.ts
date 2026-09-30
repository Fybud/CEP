import type { EmailChannelConfig } from "../shared/types.js";

/** Empty defaults — real values come from channels_config (Settings / seed:config). */
export const emailConfig: EmailChannelConfig = {
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  accessToken: "",
  pubsubTopic: "",
};
