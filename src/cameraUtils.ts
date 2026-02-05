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

export function canShareFiles(): boolean {
  return typeof navigator.share === "function" && typeof navigator.canShare === "function";
}

export async function shareBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  await navigator.share({ files: [file] });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateFilename(): string {
  const d = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `knee-session-${date}-${time}.webm`;
}
