// Camera recording utilities (dev-only)
// Follows the same pattern as ttsUtils.ts — pure functions, no React dependencies.

export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export type CameraError =
  | "NotAllowedError"
  | "NotFoundError"
  | "NotReadableError"
  | "Unknown";

const ERROR_MESSAGES: Record<CameraError, string> = {
  NotAllowedError: "Camera permission denied. Check browser settings.",
  NotFoundError: "No camera found on this device.",
  NotReadableError: "Camera is in use by another app.",
  Unknown: "Could not access camera.",
};

export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name in ERROR_MESSAGES) return ERROR_MESSAGES[name as CameraError];
  return ERROR_MESSAGES.Unknown;
}

export async function requestCamera(
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  const merged = constraints ?? {
    video: { width: 1280, height: 720, facingMode: "user" },
  };
  return navigator.mediaDevices.getUserMedia(merged);
}

export function createRecorder(
  stream: MediaStream,
  onDataAvailable: (chunk: Blob) => void,
  onStop: () => void,
): MediaRecorder {
  const mimeType = getSupportedMimeType();
  const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
  const recorder = new MediaRecorder(stream, options);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) onDataAvailable(e.data);
  };
  recorder.onstop = onStop;
  return recorder;
}

export function buildVideoBlob(chunks: Blob[], mimeType: string): Blob {
  return new Blob(chunks, { type: mimeType || "video/webm" });
}

