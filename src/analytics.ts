const ACCESS_CODE_KEY = "knee-timer-access-code";

export interface EventPayload {
  durationMin?: number;
  prepTimeSec?: number;
  speechOn?: boolean;
  cameraOn?: boolean;
  completionPct?: number;
}

export function trackEvent(type: string, payload?: EventPayload): void {
  const accessCode = localStorage.getItem(ACCESS_CODE_KEY) ?? "";
  fetch("/api/event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-code": accessCode,
    },
    body: JSON.stringify({ type, ...payload }),
    keepalive: true, // survives tab close
  }).catch(() => {
    // fire-and-forget — analytics errors must never affect the user
  });
}
