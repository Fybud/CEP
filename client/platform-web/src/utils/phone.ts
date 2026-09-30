/** Shared WhatsApp phone helpers — keep in sync with platform-api/src/utils/phone.ts */

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

export const COUNTRY_DIAL_OPTIONS: { dial: string; label: string }[] = [
  { dial: "91", label: "India (+91)" },
  { dial: "1", label: "US/CA (+1)" },
  { dial: "44", label: "UK (+44)" },
  { dial: "971", label: "UAE (+971)" },
  { dial: "65", label: "Singapore (+65)" },
  { dial: "61", label: "Australia (+61)" },
  { dial: "966", label: "Saudi (+966)" },
  { dial: "974", label: "Qatar (+974)" },
  { dial: "968", label: "Oman (+968)" },
  { dial: "973", label: "Bahrain (+973)" },
  { dial: "852", label: "Hong Kong (+852)" },
  { dial: "81", label: "Japan (+81)" },
  { dial: "49", label: "Germany (+49)" },
  { dial: "33", label: "France (+33)" },
  { dial: "92", label: "Pakistan (+92)" },
  { dial: "880", label: "Bangladesh (+880)" },
  { dial: "94", label: "Sri Lanka (+94)" },
  { dial: "977", label: "Nepal (+977)" },
];

export function normalizeWhatsAppDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || null;
}

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

/** Display/storage: "+{dial} {national}" e.g. "+91 6303481402". */
export function formatWhatsAppDisplay(raw: string): string {
  const formatted = formatWhatsAppStorage(raw);
  return formatted ?? raw.trim();
}

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
