import { prisma } from "../config/db.js";

// Basic in-memory cache for feature flags to avoid hitting the DB on every request.
let featuresCache: Record<string, boolean> = {};
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function isFeatureEnabled(key: string, defaultValue = false): Promise<boolean> {
  const now = Date.now();
  if (now - lastCacheUpdate > CACHE_TTL_MS) {
    try {
      const allFeatures = await prisma.featureFlag.findMany();
      const newCache: Record<string, boolean> = {};
      for (const f of allFeatures) {
        newCache[f.key] = f.enabled;
      }
      featuresCache = newCache;
      lastCacheUpdate = now;
    } catch {
      // If DB fails, fallback to existing cache or default
    }
  }

  if (key in featuresCache) {
    return featuresCache[key];
  }
  
  return defaultValue;
}

export async function setFeatureEnabled(key: string, enabled: boolean, description?: string): Promise<boolean> {
  await prisma.featureFlag.upsert({
    where: { key },
    update: { enabled, description },
    create: { key, enabled, description }
  });
  featuresCache[key] = enabled;
  return enabled;
}
