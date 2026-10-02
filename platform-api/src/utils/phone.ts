/** Shared WhatsApp / E.164-ish phone helpers (India default for bare 10-digit locals). */

export const WHATSAPP_DIAL_CODES = [
  "91",
  "1",
  "44",
  "971",
  "65",
  "61",
  "966",
  "974",
  "968",
  "973",
  "852",
  "81",
  "49",
  "33",
  "92",
  "880",
  "94",
  "977",
] as const;

export const DEFAULT_WHATSAPP_DIAL = "91";

export type WhatsAppParts = { dial: string; national: string };

export function normalizeWhatsAppDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || null;
}

/** Longest-prefix dial match; bare 10-digit numbers default to India (+91). */
export function parseWhatsAppParts(raw: string | null | undefined): WhatsAppParts {
  const digits = normalizeWhatsAppDigits(raw);
  if (!digits) return { dial: DEFAULT_WHATSAPP_DIAL, national: "" };

  const dials = [...WHATSAPP_DIAL_CODES].sort((a, b) => b.length - a.length);
  for (const dial of dials) {
    if (digits.startsWith(dial) && digits.length > dial.length) {
      return { dial, national: digits.slice(dial.length) };
    }
  }
  if (digits.length === 10) return { dial: DEFAULT_WHATSAPP_DIAL, national: digits };
  return { dial: DEFAULT_WHATSAPP_DIAL, national: digits };
}

/** Canonical CEP storage/display: "+{dial} {national}" e.g. "+91 6303481402". */
export function formatWhatsAppStorage(raw: string | null | undefined): string | null {
  const digits = normalizeWhatsAppDigits(raw);
  if (!digits) return null;
  const { dial, national } = parseWhatsAppParts(digits);
  if (!national) return `+${digits}`;
  return `+${dial} ${national}`;
}

export function composeWhatsApp(parts: WhatsAppParts): string {
  const national = parts.national.replace(/\D/g, "");
  if (!national) return "";
  return `+${parts.dial} ${national}`;
}

/** Digits-only recipient for WhatsApp Cloud API (`to` field). */
export function whatsappApiRecipient(raw: string | null | undefined): string | null {
  return normalizeWhatsAppDigits(raw);
}

export function whatsappDigitsEqual(a?: string | null, b?: string | null): boolean {
  const da = normalizeWhatsAppDigits(a);
  const db = normalizeWhatsAppDigits(b);
  if (!da || !db) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}
