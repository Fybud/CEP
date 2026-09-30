type EnvMap = Record<string, string | undefined>;

declare global {
  interface Window {
    __ENV__?: EnvMap;
  }
}

/**
 * Runtime config for the built SPA.
 *
 * Priority:
 *  1. `window.__ENV__` — injected at container start (`/env.js`, written by
 *     docker-entrypoint.sh from `VITE_*` env vars). This is what makes a single
 *     image serve every tenant.
 *  2. `import.meta.env` — compile-time Vite values (dev / build fallback).
 */
export function env(key: string): string | undefined {
  const injected = typeof window !== "undefined" ? window.__ENV__?.[key] : undefined;
  if (injected !== undefined && injected !== "") return injected;
  const fromBuild = (import.meta as unknown as { env: EnvMap }).env;
  return fromBuild?.[key];
}

export function envOr(key: string, fallback = ""): string {
  return env(key) ?? fallback;
}

export function apiBaseUrl(): string {
  return envOr("VITE_API_BASE_URL");
}

export function googleClientId(): string {
  return envOr("VITE_GOOGLE_CLIENT_ID");
}
