function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  if (!v?.trim()) return undefined;
  return stripQuotes(v.trim());
}

const region = optional("AWS_REGION") ?? optional("AWS_DEFAULT_REGION");
const bucket = optional("AWS_S3_BUCKET");
const accessKeyId = optional("AWS_ACCESS_KEY_ID");
const secretAccessKey = optional("AWS_SECRET_ACCESS_KEY");

const maxMb = Number(process.env.WHATSAPP_MEDIA_MAX_MB ?? "100");
const maxBytes = Number.isFinite(maxMb) && maxMb > 0 ? Math.floor(maxMb * 1024 * 1024) : 104857600;

export const mediaConfig = {
  enabled: Boolean(region && bucket && accessKeyId && secretAccessKey),
  region: region ?? "",
  bucket: bucket ?? "",
  accessKeyId: accessKeyId ?? "",
  secretAccessKey: secretAccessKey ?? "",
  maxBytes,
};
