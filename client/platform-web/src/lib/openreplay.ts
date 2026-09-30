import Tracker from "@openreplay/tracker";

const projectKey = import.meta.env.VITE_OPENREPLAY_PROJECT_KEY;
const ingestPoint = import.meta.env.VITE_OPENREPLAY_INGEST_URL;

let trackerInstance: Tracker | null = null;

export function startTracker() {
  if (!projectKey || trackerInstance) return trackerInstance;

  trackerInstance = new Tracker({
    projectKey,
    ingestPoint: ingestPoint || "http://localhost:8080/ingest",
    __DISABLE_SECURE_MODE: true, // For localhost/http testing if needed
  });

  trackerInstance.start();
  return trackerInstance;
}

export function getTracker() {
  return trackerInstance;
}
