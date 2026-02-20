const DEVICE_ID_KEY = "knee-timer-device-id";
const ACCESS_CODE_KEY = "knee-timer-access-code";

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

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
    body: JSON.stringify({ type, device_id: getDeviceId(), ...payload }),
    keepalive: true, // survives tab close
  }).catch(() => {
    // fire-and-forget — analytics errors must never affect the user
  });
}
