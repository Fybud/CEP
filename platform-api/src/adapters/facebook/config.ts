import type { FacebookChannelConfig } from "../shared/types.js";

/** Empty defaults — real values come from channels_config (Settings / seed:config). */
export const facebookConfig: FacebookChannelConfig = {
  pageId: "",
  accessToken: "",
  verifyToken: "",
  appSecret: "",
  pageName: "",
};
