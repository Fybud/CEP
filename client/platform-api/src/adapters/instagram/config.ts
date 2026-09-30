import type { InstagramChannelConfig } from "../shared/types.js";

/** Empty defaults — real values come from channels_config (Settings / seed:config). */
export const instagramConfig: InstagramChannelConfig = {
  accessToken: "",
  verifyToken: "",
  instagramAppSecret: "",
  instagramAppId: "",
  instagramUsername: "",
};
