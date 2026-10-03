import * as rrweb from "rrweb";
import { useAuthStore } from "../store/auth";
import { apiBaseUrl } from "./runtimeEnv";

let events: any[] = [];
let sessionId: string | null = null;
let flushInFlight = false;
export let stopRecording: (() => void) | null = null;

function API_BASE(): string | null {
  const configured = apiBaseUrl().replace(/\/$/, "");
  if (!configured) return null;
  return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
}

export async function startRrwebTracker() {
  if (sessionId) return; // already tracking

  const base = API_BASE();
  if (!base) return;

  try {
    // 0. Check feature flag
    const featureRes = await fetch(`${base}/features?key=rrweb`);
    if (featureRes.ok) {
      const data = await featureRes.json();
      if (data.enabled === false) return; // Feature is disabled
    }

    const user = useAuthStore.getState().user;

    // 1. Create a session in the backend
    const res = await fetch(`${base}/telemetry/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        browser: navigator.userAgent,
        os: navigator.platform,
        userName: user?.username,
        userEmail: user?.username,
      }),
    });

    if (!res.ok) throw new Error("Could not start telemetry session");

    const data = (await res.json()) as { sessionId?: string };
    if (!data.sessionId) throw new Error("Telemetry session did not return an id");
    sessionId = data.sessionId;

    // 2. Start recording DOM
    stopRecording =
      rrweb.record({
        emit(event) {
          events.push(event);
        },
      }) || null;

    // 3. Flush events every 10 seconds
    window.setInterval(flushEvents, 10000);

    // Fetch requests may be cancelled during navigation; sendBeacon is designed for this case.
    window.addEventListener("pagehide", flushEventsOnExit);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  } catch (err) {
    console.error("rrweb tracker failed to start:", err);
  }
}

async function flushEvents() {
  const base = API_BASE();
  if (!base || !sessionId || events.length === 0 || flushInFlight) return;

  const eventsToSend = [...events];
  events = []; // clear the buffer
  flushInFlight = true;

  try {
    const res = await fetch(`${base}/telemetry/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        events: eventsToSend,
      }),
    });
    if (!res.ok) throw new Error(`Telemetry event upload failed (${res.status})`);
  } catch (err) {
    console.error("rrweb flush failed:", err);
    // Keep failed batches so a later interval can retry them.
    events = [...eventsToSend, ...events];
  } finally {
    flushInFlight = false;
  }
}

function flushEventsOnExit() {
  const base = API_BASE();
  if (!base || !sessionId || events.length === 0 || !navigator.sendBeacon) return;

  const payload = JSON.stringify({ sessionId, events });
  const accepted = navigator.sendBeacon(
    `${base}/telemetry/events`,
    new Blob([payload], { type: "application/json" }),
  );
  if (accepted) events = [];
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    flushEventsOnExit();
  }
}
