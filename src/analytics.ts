const ACCESS_CODE_KEY = "knee-timer-access-code";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Generated once per page load — shared by all events in this run
const runId = generateUUID();

export interface EventPayload {
  durationMin?: number;
  prepTimeSec?: number;
  speechOn?: boolean;
  cameraOn?: boolean;
  completionPct?: number;
}

export function trackEvent(type: string, payload?: EventPayload, sessionId?: string): void {
  const accessCode = localStorage.getItem(ACCESS_CODE_KEY) ?? "";
  fetch("/api/event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-code": accessCode,
    },
    body: JSON.stringify({ type, ...payload, runId, sessionId: sessionId ?? null }),
    keepalive: true, // survives tab close
  }).catch(() => {
    // fire-and-forget — analytics errors must never affect the user
  });
}
