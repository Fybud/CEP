/** Keys that must never leave the API in plaintext (XSS / screenshare risk). */
export const CHANNEL_SECRET_KEYS = [
  "accessToken",
  "refreshToken",
  "clientSecret",
  "appSecret",
  "instagramAppSecret",
  "verifyToken",
] as const;

export const SECRET_PLACEHOLDER = "***";

export function isSecretPlaceholder(value: unknown): boolean {
  return typeof value === "string" && value.trim() === SECRET_PLACEHOLDER;
}

export function redactChannelConfigForClient(
  _channelConfig: unknown,
): Record<string, unknown> {
  // Credentials stay on the server. The UI uses health/status only.
  return {};
}
