const DEVICE_ID_KEY = "knee-timer-device-id";
const ACCESS_CODE_KEY = "knee-timer-access-code";

function generateFallbackId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    try {
      id = crypto.randomUUID();
    } catch {
      id = generateFallbackId();
    }
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
