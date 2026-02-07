// Motivational 30-Second Timer (Knee Rehab)
// ---------------------------------------------------------------
// Features:
// - Single timer at a time
// - Duration set in whole minutes only
// - Speaks a motivational line every 30 seconds
// - Speaks the user's name once at the start
// - Congratulates the user at the end
// - Milestone callouts at 25%, 50%, 75%, 90%
// ---------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MINUTES,
  buildCongratsLine,
  buildMotivationLine,
  buildPrefetchLines,
  buildStartLine,
  clampFloat,
  clampInt,
  computeMilestones,
  formatMMSS,
  padShortUtterance,
  pickMotivation,
  type PrefetchLine,
} from "./ttsUtils";
import backMusicUrl from "./assets/backmusic-x.mp3";
import {
  cameraErrorMessage,
  createRecorder,
  buildVideoBlob,
  getSupportedMimeType,
  requestCamera,
} from "./cameraUtils";

type VoiceOption = {
  id: string;
  label: string;
  lang: string;
  gender: "F" | "M";
  grade: string;
};

type TtsMode = "kokoro";

const DEFAULT_VOICE_ID = "echo";
const SPEED_DEFAULT = 1;
const SPEED_MIN = 0.8;
const SPEED_MAX = 1.2;
const SPEED_STEP = 0.05;
const DUCK_VOLUME = 0.05;
const NORMAL_VOLUME = 0.4;

// Access code key in localStorage
const ACCESS_CODE_KEY = "knee-timer-access-code";

// Browser-compatible SHA-256 hash (matches api/tts.js cache key format)
async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// iOS requires audio elements to be created and "unlocked" during user gesture for full volume playback.
// We create a single reusable element and keep it alive.
let sharedTtsAudio: HTMLAudioElement | null = null;

function getSharedTtsAudio(): HTMLAudioElement {
  if (!sharedTtsAudio) {
    sharedTtsAudio = new Audio();
    // Prevent iOS from treating this as ambient/background audio
    sharedTtsAudio.setAttribute("playsinline", "true");
  }
  return sharedTtsAudio;
}

// ---- Circular Progress Ring Component ----
function ProgressRing({
  progress,
  size = 280,
  strokeWidth = 8,
  isRunning,
  isFinished,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  isRunning: boolean;
  isFinished: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const strokeColor = isFinished
    ? "var(--color-warmsuccess)"
    : "var(--color-warmgold)";

  return (
    <svg
      width={size}
      height={size}
      className={`-rotate-90 ${isRunning && !isFinished ? "animate-breathe-ring" : ""}`}
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="progress-ring-track"
        strokeWidth={strokeWidth}
      />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="progress-ring-fill"
        strokeWidth={strokeWidth + 1}
        stroke={strokeColor}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export default function App() {
  const [minutesInput, setMinutesInput] = useState<string>(String(DEFAULT_MINUTES));
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_MINUTES);
  const [secondsLeft, setSecondsLeft] = useState<number>(DEFAULT_MINUTES * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  // Wait time before timer starts
  const [waitSeconds, setWaitSeconds] = useState<number>(0);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [waitSecondsLeft, setWaitSecondsLeft] = useState<number>(0);

  // Access code gate
  const [accessCode, setAccessCode] = useState<string>(() => localStorage.getItem(ACCESS_CODE_KEY) || "");
  const [accessCodeInput, setAccessCodeInput] = useState<string>("");
  const [accessCodeError, setAccessCodeError] = useState<string>("");

  // TTS muted banner (shown when both static + API fail)
  const [ttsMuted, setTtsMuted] = useState<boolean>(false);

  // Privacy modal
  const [showPrivacy, setShowPrivacy] = useState<boolean>(false);

  // Personalization (kept internally, not exposed in UI)
  const [activity] = useState<string>("physio");

  // Speech settings
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(true);
  const [speechSpeed, setSpeechSpeed] = useState<number>(SPEED_DEFAULT);
  const [speechVolume] = useState<number>(1);
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [speedRange, setSpeedRange] = useState({ min: SPEED_MIN, max: SPEED_MAX, step: SPEED_STEP });
  const [ttsMode, setTtsMode] = useState<TtsMode>("kokoro");
  const ttsNoteRef = useRef<string>("");

  const intervalRef = useRef<number | null>(null);
  const waitIntervalRef = useRef<number | null>(null);
  const lastSpokenRef = useRef<number | string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const ttsCacheRef = useRef<Map<string, Blob>>(new Map());
  const ttsInFlightRef = useRef<Map<string, Promise<Blob>>>(new Map());
  const prefetchIdRef = useRef<number>(0);
  const speechEnabledRef = useRef<boolean>(speechEnabled);
  const ttsModeRef = useRef<TtsMode>(ttsMode);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  // Web Audio API for iOS-compatible volume control
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgGainNodeRef = useRef<GainNode | null>(null);
  const bgSourceConnectedRef = useRef<boolean>(false);

  // Camera (dev-only)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [showCamera, setShowCamera] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string>("");

  const totalSeconds = useMemo(() => durationMinutes * 60, [durationMinutes]);
  const progress = useMemo(() => {
    const done = totalSeconds - secondsLeft;
    return totalSeconds === 0 ? 0 : Math.min(1, Math.max(0, done / totalSeconds));
  }, [secondsLeft, totalSeconds]);

  const milestones = useMemo(() => computeMilestones(totalSeconds), [totalSeconds]);

  // Refs for values that need to be current inside interval callbacks (avoids stale closure)
  const totalSecondsRef = useRef<number>(totalSeconds);
  const milestonesRef = useRef<ReturnType<typeof computeMilestones>>(milestones);

  useEffect(() => {
    totalSecondsRef.current = totalSeconds;
    milestonesRef.current = milestones;
  }, [totalSeconds, milestones]);

  useEffect(() => {
    let cancelled = false;
    async function loadVoices() {
      try {
        const res = await fetch("/api/voices");
        if (!res.ok) throw new Error(`voice load failed: ${res.status}`);
        const data = (await res.json()) as {
          voices: VoiceOption[];
          defaultVoiceId: string;
          speed: { min: number; max: number; step: number; recommended: number };
        };
        if (cancelled) return;
        const voices = Array.isArray(data.voices) ? data.voices : [];
        setVoiceOptions(voices);
        if (data.speed) {
          const min = data.speed.min ?? SPEED_MIN;
          const max = data.speed.max ?? SPEED_MAX;
          const step = data.speed.step ?? SPEED_STEP;
          setSpeedRange({ min, max, step });
          if (typeof data.speed.recommended === "number") {
            setSpeechSpeed(clampFloat(data.speed.recommended, min, max));
          }
        }
        const nextVoice =
          typeof data.defaultVoiceId === "string" && data.defaultVoiceId
            ? data.defaultVoiceId
            : voices[0]?.id || DEFAULT_VOICE_ID;
        setVoiceId((prev) => prev || nextVoice);
        setTtsMode("kokoro");
        ttsNoteRef.current = "";
      } catch {
        if (cancelled) return;
        setVoiceOptions([]);
        setSpeechEnabled(false);
        ttsNoteRef.current = "OpenAI TTS unavailable.";
      }
    }
    loadVoices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      if (waitIntervalRef.current != null) window.clearInterval(waitIntervalRef.current);
      waitIntervalRef.current = null;
      stopAudio();
      stopBackgroundMusic();
    };
  }, []);

  useEffect(() => {
    if (!speechEnabled) stopSpeech();
  }, [speechEnabled]);

  useEffect(() => {
    speechEnabledRef.current = speechEnabled;
  }, [speechEnabled]);

  useEffect(() => {
    ttsModeRef.current = ttsMode;
  }, [ttsMode]);

  // Camera cleanup
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraStream]);

  // Attach camera stream to preview element after React commits the DOM
  useEffect(() => {
    if (previewRef.current && cameraStream && !recordedBlob) {
      previewRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, recordedBlob]);

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      // Don't destroy the shared audio element, just clear the reference
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  function stopSpeech() {
    stopAudio();
  }

  function startBackgroundMusic() {
    // If the pipeline was pre-built by unlockAudio() (wait-time path),
    // the audio is playing silently at gain 0 — raise gain after resume.
    if (backgroundAudioRef.current && bgGainNodeRef.current && audioContextRef.current) {
      const ctx = audioContextRef.current;
      const gain = bgGainNodeRef.current;
      const audio = backgroundAudioRef.current;
      // Ensure context is running FIRST, then raise gain and ensure playback
      ctx.resume().then(() => {
        gain.gain.setValueAtTime(NORMAL_VOLUME, ctx.currentTime);
        audio.play().catch(() => {});
      });
      return;
    }

    // Otherwise create everything from scratch (no-wait path, user gesture context)
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      // Fallback for browsers without Web Audio API
      const audio = new Audio(backMusicUrl);
      audio.loop = true;
      audio.volume = NORMAL_VOLUME;
      audio.play();
      backgroundAudioRef.current = audio;
      return;
    }

    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const audio = new Audio(backMusicUrl);
    audio.loop = true;
    audio.crossOrigin = "anonymous";
    backgroundAudioRef.current = audio;

    // Connect through Web Audio API gain node
    const source = ctx.createMediaElementSource(audio);
    const gainNode = ctx.createGain();
    gainNode.gain.value = NORMAL_VOLUME;
    bgGainNodeRef.current = gainNode;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    bgSourceConnectedRef.current = true;

    // Resume context (required for iOS after user gesture)
    ctx.resume().then(() => {
      audio.play().catch(() => {});
    });
  }

  function stopBackgroundMusic() {
    if (backgroundAudioRef.current) {
      backgroundAudioRef.current.pause();
      backgroundAudioRef.current.currentTime = 0;
      backgroundAudioRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    bgGainNodeRef.current = null;
    bgSourceConnectedRef.current = false;
  }

  function duckBackgroundMusic() {
    const gain = bgGainNodeRef.current;
    if (gain && audioContextRef.current) {
      // Use Web Audio API's built-in ramping for smooth transitions
      gain.gain.cancelScheduledValues(audioContextRef.current.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, audioContextRef.current.currentTime);
      gain.gain.linearRampToValueAtTime(DUCK_VOLUME, audioContextRef.current.currentTime + 0.1);
    } else if (backgroundAudioRef.current) {
      // Fallback for non-Web Audio path
      backgroundAudioRef.current.volume = DUCK_VOLUME;
    }
  }

  function restoreBackgroundMusic() {
    const gain = bgGainNodeRef.current;
    if (gain && audioContextRef.current) {
      gain.gain.cancelScheduledValues(audioContextRef.current.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, audioContextRef.current.currentTime);
      gain.gain.linearRampToValueAtTime(NORMAL_VOLUME, audioContextRef.current.currentTime + 0.15);
    } else if (backgroundAudioRef.current) {
      backgroundAudioRef.current.volume = NORMAL_VOLUME;
    }
  }

  async function playBlob(blob: Blob): Promise<void> {
    stopAudio();
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    // Reuse shared audio element for iOS compatibility (must be created during user gesture)
    const audio = getSharedTtsAudio();
    audio.src = url;
    audio.volume = clampFloat(speechVolume, 0, 1);
    audioRef.current = audio;

    return new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
        }
        restoreBackgroundMusic();
        resolve();
      };
      audio.onerror = () => {
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
        }
        restoreBackgroundMusic();
        resolve(); // treat playback error as "speech finished"
      };
      // Duck first, then wait for the ramp to complete before playing TTS
      duckBackgroundMusic();
      setTimeout(() => {
        audio.play().catch(reject);
      }, 120);
    });
  }

  function makeClientCacheKey(text: string, voice: string, speed: number) {
    return `${voice}|${speed.toFixed(2)}|${text}`;
  }

  async function fetchTtsBlob(text: string, voice: string, speed: number) {
    // Try static pre-generated audio first (zero API cost)
    try {
      const hash = await sha256Hex(`${voice}|${speed.toFixed(2)}|${text}`);
      const staticUrl = `/audio/${voice}-${speed.toFixed(2)}/${hash}.mp3`;
      const staticRes = await fetch(staticUrl);
      if (staticRes.ok) {
        return await staticRes.blob();
      }
    } catch {
      // Static fetch failed — fall through to API
    }

    // Fall back to /api/tts
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const code = localStorage.getItem(ACCESS_CODE_KEY);
    if (code) {
      headers["x-access-code"] = code;
    }
    const res = await fetch("/api/tts", {
      method: "POST",
      headers,
      body: JSON.stringify({ text, voice, speed }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || `TTS failed (${res.status})`);
    }
    return await res.blob();
  }

  async function getTtsBlob(text: string, voice: string, speed: number) {
    const key = makeClientCacheKey(text, voice, speed);
    const cached = ttsCacheRef.current.get(key);
    if (cached) return cached;
    const inFlight = ttsInFlightRef.current.get(key);
    if (inFlight) return await inFlight;

    const request = fetchTtsBlob(text, voice, speed)
      .then((blob) => {
        ttsInFlightRef.current.delete(key);
        ttsCacheRef.current.set(key, blob);
        if (ttsCacheRef.current.size > 200) {
          const firstKey = ttsCacheRef.current.keys().next().value;
          if (firstKey) ttsCacheRef.current.delete(firstKey);
        }
        return blob;
      })
      .catch((err) => {
        ttsInFlightRef.current.delete(key);
        throw err;
      });

    ttsInFlightRef.current.set(key, request);
    return await request;
  }

  function cancelPrefetch() {
    prefetchIdRef.current += 1;
  }

  // ---- Camera handlers (dev-only) ----
  const handleEnableCamera = useCallback(async () => {
    setCameraError("");
    try {
      const stream = await requestCamera();
      setCameraStream(stream);
      setRecordedBlob(null);
      setPlaybackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    } catch (err) {
      setCameraError(cameraErrorMessage(err));
    }
  }, []);

  const handleDisableCamera = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setIsRecording(false);
    setRecordedBlob(null);
    setCameraError("");
    videoChunksRef.current = [];
    setPlaybackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }, [cameraStream]);

  const startRecording = useCallback(() => {
    if (!cameraStream) return;
    const mimeType = getSupportedMimeType();
    if (!mimeType && typeof MediaRecorder === "undefined") {
      setCameraError("Recording not supported in this browser.");
      return;
    }
    videoChunksRef.current = [];
    setRecordedBlob(null);
    setPlaybackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    try {
      const recorder = createRecorder(
        cameraStream,
        (chunk) => videoChunksRef.current.push(chunk),
        () => {
          const mime = mimeType || "video/webm";
          const blob = buildVideoBlob(videoChunksRef.current, mime);
          const url = URL.createObjectURL(blob);
          // Set URL before blob so both are ready when React renders
          setPlaybackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
          setRecordedBlob(blob);
          setIsRecording(false);
        },
      );
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setCameraError("Recording failed unexpectedly.");
    }
  }, [cameraStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleDeleteRecording = useCallback(() => {
    setRecordedBlob(null);
    setPlaybackUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
  }, []);

  async function prefetchLines(lines: PrefetchLine[], voice: string, speed: number) {
    const prefetchId = ++prefetchIdRef.current;
    for (const line of lines) {
      if (prefetchIdRef.current !== prefetchId) return;
      if (!speechEnabledRef.current || ttsModeRef.current !== "kokoro") return;
      const text = padShortUtterance(line.text);
      try {
        await getTtsBlob(text, voice, speed);
      } catch {
        // Prefetch errors are not fatal - audio will be fetched on-demand
        // Don't disable TTS for transient network issues
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  async function speakKokoro(text: string) {
    const padded = padShortUtterance(text);
    const speed = clampFloat(speechSpeed, speedRange.min, speedRange.max);
    const blob = await getTtsBlob(padded, voiceId, speed);
    await playBlob(blob);
  }

  const ttsFailCountRef = useRef<number>(0);

  function speakWithSettings(text: string) {
    if (!speechEnabled) return;
    void (async () => {
      try {
        await speakKokoro(text);
        ttsFailCountRef.current = 0; // Reset on success
      } catch {
        ttsFailCountRef.current += 1;
        // Only disable TTS after 3 consecutive failures
        if (ttsFailCountRef.current >= 3) {
          setSpeechEnabled(false);
          setTtsMuted(true);
          ttsNoteRef.current = "Voice coaching temporarily unavailable.";
        }
      }
    })();
  }

  function clearIntervalIfAny() {
    if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  function clearWaitIntervalIfAny() {
    if (waitIntervalRef.current != null) window.clearInterval(waitIntervalRef.current);
    waitIntervalRef.current = null;
  }

  function announce(currentSecondsLeft: number) {
    if (!speechEnabled) return;

    // Never speak at 0:00 (reserved for congratulations)
    if (currentSecondsLeft === 0) return;

    // Use refs to get current values (avoids stale closure in interval callbacks)
    const ts = totalSecondsRef.current;
    const ms = milestonesRef.current;
    const elapsedSeconds = ts - currentSecondsLeft;

    // Milestones take precedence
    for (const m of ms) {
      if (elapsedSeconds === m.elapsed && lastSpokenRef.current !== m.key) {
        lastSpokenRef.current = m.key;
        speakWithSettings(m.text);
        return;
      }
    }

    // Regular cadence: every 30 seconds
    if (currentSecondsLeft % 30 !== 0) return;
    if (lastSpokenRef.current === currentSecondsLeft) return;

    lastSpokenRef.current = currentSecondsLeft;
    const elapsed30 = Math.floor(elapsedSeconds / 30);
    const base = pickMotivation(elapsed30);
    speakWithSettings(buildMotivationLine(base, activity));
  }

  // Build full background music pipeline at gain 0 (silent) during a user
  // gesture. Browsers block AudioContext creation and audio.play() outside
  // gesture context, but startTimer() fires from setTimeout after the wait.
  // Audio is routed through Web Audio gain node at 0 — NOT native volume
  // (which is read-only on iOS). startBackgroundMusic() raises the gain.
  function unlockAudio() {
    // 1. Build full background music pipeline at gain 0 (silent)
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const audio = new Audio(backMusicUrl);
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      backgroundAudioRef.current = audio;

      const source = ctx.createMediaElementSource(audio);
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0; // silent — routed through Web Audio, not native volume
      bgGainNodeRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      bgSourceConnectedRef.current = true;

      // Start playing silently to unlock the Audio element for later use
      ctx.resume().then(() => { audio.play().catch(() => {}); });
    }

    // 2. Unlock the shared TTS audio element with a silent play
    const ttsAudio = getSharedTtsAudio();
    ttsAudio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    ttsAudio.volume = 0;
    ttsAudio.play().then(() => {
      ttsAudio.pause();
      ttsAudio.volume = 1;
      ttsAudio.src = "";
    }).catch(() => {});
  }

  function startTimer() {
    const mins = clampInt(parseInt(minutesInput, 10), 1, 15);
    const startSeconds = mins * 60;

    // Update refs synchronously BEFORE any announce calls (avoids stale closure)
    totalSecondsRef.current = startSeconds;
    milestonesRef.current = computeMilestones(startSeconds);

    setDurationMinutes(mins);
    setSecondsLeft(startSeconds);
    setIsFinished(false);
    setIsRunning(true);

    lastSpokenRef.current = null;
    stopSpeech();
    cancelPrefetch();

    if (speechEnabled && ttsMode === "kokoro") {
      const lines = buildPrefetchLines(startSeconds, activity);
      void prefetchLines(lines, voiceId, clampFloat(speechSpeed, speedRange.min, speedRange.max));
    }

    if (speechEnabled) {
      void (async () => {
        try {
          await speakKokoro(buildStartLine());
          ttsFailCountRef.current = 0;
        } catch {
          ttsFailCountRef.current += 1;
          if (ttsFailCountRef.current >= 3) {
            setSpeechEnabled(false);
            setTtsMuted(true);
            ttsNoteRef.current = "Voice coaching temporarily unavailable.";
          }
        }
        startBackgroundMusic();
      })();
    } else {
      startBackgroundMusic();
    }

    // Auto-start camera recording if enabled
    if (autoRecord && cameraStream && !isRecording) {
      startRecording();
    }

    // start boundary
    announce(startSeconds);

    clearIntervalIfAny();
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;

        if (next <= 0) {
          stopBackgroundMusic();
          if (speechEnabled) {
            speakWithSettings(buildCongratsLine());
          }
          clearIntervalIfAny();
          setIsRunning(false);
          setIsFinished(true);
          // Stop camera recording when timer finishes
          if (mediaRecorderRef.current?.state === "recording") stopRecording();
          return 0;
        }

        announce(next);
        return next;
      });
    }, 1000);
  }

  function start() {
    if (waitSeconds === 0) {
      startTimer();
      return;
    }

    // Silently unlock AudioContext and TTS audio element while we still have
    // user-gesture context. startTimer() fires from setTimeout inside
    // setInterval which is no longer a gesture, so browsers would block
    // AudioContext creation and audio.play() without this.
    unlockAudio();

    // Prefetch TTS lines during the wait so audio blobs are cached and ready
    if (speechEnabled && ttsMode === "kokoro") {
      const mins = clampInt(parseInt(minutesInput, 10), 1, 15);
      const lines = buildPrefetchLines(mins * 60, activity);
      void prefetchLines(lines, voiceId, clampFloat(speechSpeed, speedRange.min, speedRange.max));
    }

    // Start wait countdown
    setIsWaiting(true);
    setWaitSecondsLeft(waitSeconds);

    clearWaitIntervalIfAny();
    waitIntervalRef.current = window.setInterval(() => {
      setWaitSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearWaitIntervalIfAny();
          setIsWaiting(false);
          // Use setTimeout to ensure state flush before starting timer
          setTimeout(() => startTimer(), 0);
          return 0;
        }
        return next;
      });
    }, 1000);
  }

  function pause() {
    setIsRunning(false);
    clearIntervalIfAny();
    stopSpeech();
    backgroundAudioRef.current?.pause();
  }

  function resume() {
    if (secondsLeft <= 0) return;
    setIsRunning(true);

    if (speechEnabled && ttsMode === "kokoro") {
      const lines = buildPrefetchLines(totalSeconds, activity);
      void prefetchLines(lines, voiceId, clampFloat(speechSpeed, speedRange.min, speedRange.max));
    }

    // Resume AudioContext for iOS, then play audio
    if (audioContextRef.current) {
      audioContextRef.current.resume().then(() => {
        backgroundAudioRef.current?.play();
      });
    } else {
      backgroundAudioRef.current?.play();
    }

    announce(secondsLeft);

    clearIntervalIfAny();
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;

        if (next <= 0) {
          stopBackgroundMusic();
          if (speechEnabled) {
            speakWithSettings(buildCongratsLine());
          }
          clearIntervalIfAny();
          setIsRunning(false);
          setIsFinished(true);
          // Stop camera recording when timer finishes
          if (mediaRecorderRef.current?.state === "recording") stopRecording();
          return 0;
        }

        announce(next);
        return next;
      });
    }, 1000);
  }

  function reset() {
    clearWaitIntervalIfAny();
    setIsWaiting(false);
    setWaitSecondsLeft(0);
    pause();
    setIsFinished(false);
    setSecondsLeft(durationMinutes * 60);
    lastSpokenRef.current = null;
    cancelPrefetch();
  }

  function stopAndClear() {
    clearWaitIntervalIfAny();
    setIsWaiting(false);
    setWaitSecondsLeft(0);
    pause();
    setIsFinished(false);
    setSecondsLeft(durationMinutes * 60);
    lastSpokenRef.current = null;
    cancelPrefetch();
    stopBackgroundMusic();
    // Stop camera recording on manual stop
    if (mediaRecorderRef.current?.state === "recording") stopRecording();
  }

  const speechAvailable = ttsMode === "kokoro";

  // Status helpers for UI
  const isPaused = !isRunning && !isWaiting && !isFinished && secondsLeft > 0 && secondsLeft !== totalSeconds;
  const isReady = !isRunning && !isWaiting && !isFinished && secondsLeft === totalSeconds;

  // Motivational subtitle that changes with state
  const motivationalSubtitle = isWaiting
    ? "Take a breath. Find your position."
    : isFinished
      ? "You showed up and pushed through. That takes real strength."
      : isRunning
        ? "You're rebuilding your future mobility \u2014 stay steady."
        : isPaused
          ? "Take a moment. When you're ready, continue."
          : "Every session brings you closer to freedom of movement.";

  const percentComplete = Math.round(progress * 100);

  const [accessCodeLoading, setAccessCodeLoading] = useState(false);

  function handleAccessCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = accessCodeInput.trim();
    if (!code) {
      setAccessCodeError("Please enter an access code.");
      return;
    }
    setAccessCodeLoading(true);
    setAccessCodeError("");
    fetch("/api/verify-code", {
      method: "POST",
      headers: { "x-access-code": code },
    })
      .then((res) => {
        if (res.ok) {
          localStorage.setItem(ACCESS_CODE_KEY, code);
          setAccessCode(code);
        } else {
          setAccessCodeError("Invalid access code. Please try again.");
        }
      })
      .catch(() => {
        setAccessCodeError("Could not verify code. Check your connection and try again.");
      })
      .finally(() => setAccessCodeLoading(false));
  }

  // Access code gate — show code entry screen if no code stored
  if (!accessCode) {
    return (
      <div className="min-h-screen bg-warm-gradient grain-overlay font-[family-name:var(--font-body)] text-warmtext flex flex-col items-center justify-center p-4 selection:bg-warmgold/30">
        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-8 animate-fade-in-up">
            <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-warmcream tracking-tight leading-tight">
              Knee Rehab
              <span className="block text-warmgold">Companion</span>
            </h1>
            <p className="mt-3 text-warmmuted text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
              Enter the access code shared in the Facebook group to get started.
            </p>
          </div>
          <form onSubmit={handleAccessCodeSubmit} className="panel-warm p-6 sm:p-8 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            <label className="block">
              <div className="text-xs text-warmmuted uppercase tracking-wider mb-2">Access code</div>
              <input
                type="text"
                className="input-warm w-full text-lg"
                value={accessCodeInput}
                onChange={(e) => { setAccessCodeInput(e.target.value); setAccessCodeError(""); }}
                placeholder="Enter code..."
                autoFocus
              />
            </label>
            {accessCodeError && (
              <div className="mt-3 text-sm text-warmred">{accessCodeError}</div>
            )}
            <button type="submit" className="btn-primary w-full mt-5 text-base" disabled={accessCodeLoading}>
              {accessCodeLoading ? "Verifying..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-gradient grain-overlay font-[family-name:var(--font-body)] text-warmtext flex flex-col items-center justify-center p-4 selection:bg-warmgold/30">
      <div className="relative z-10 w-full max-w-lg">
        {/* ---- Header ---- */}
        <div className="text-center mb-8 animate-fade-in-up">
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-warmcream tracking-tight leading-tight">
            Knee Rehab
            <span className="block text-warmgold">Companion</span>
          </h1>
          <p className="mt-3 text-warmmuted text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
            {motivationalSubtitle}
          </p>
        </div>

        {/* ---- Main Panel ---- */}
        <div className="panel-warm p-6 sm:p-8 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>

          {/* ---- Timer Display ---- */}
          <div className="flex flex-col items-center">
            {isWaiting ? (
              /* ---- Wait Countdown ---- */
              <div className="text-center animate-fade-in-up">
                <div className="relative inline-flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-warmamber/5 animate-breathe" />
                  <div className="relative py-8">
                    <div className="text-warmmuted text-sm uppercase tracking-widest mb-3">Starting in</div>
                    <div className="font-[family-name:var(--font-display)] text-7xl sm:text-8xl text-warmamber tabular-nums tracking-tight">
                      {formatMMSS(waitSecondsLeft)}
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-2 text-warmamber/70">
                      <span className="h-2 w-2 rounded-full bg-warmamber animate-pulse-dot" />
                      <span className="text-sm">Get into position</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ---- Main Timer with Ring ---- */
              <div className="relative flex items-center justify-center">
                <ProgressRing
                  progress={progress}
                  size={260}
                  strokeWidth={6}
                  isRunning={isRunning}
                  isFinished={isFinished}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {isFinished ? (
                    <div className="text-center animate-celebration">
                      <div className="text-warmsuccess text-sm uppercase tracking-widest mb-1">Session Complete</div>
                      <div className="font-[family-name:var(--font-display)] text-5xl sm:text-6xl text-warmcream tabular-nums">
                        {formatMMSS(secondsLeft)}
                      </div>
                      <div className="mt-2 shimmer-text text-sm font-medium">
                        Be proud of showing up
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-warmmuted text-xs uppercase tracking-widest mb-1">
                        {isRunning ? `${percentComplete}% complete` : isPaused ? "Paused" : "Ready"}
                      </div>
                      <div className={`font-[family-name:var(--font-display)] text-5xl sm:text-6xl tabular-nums tracking-tight ${
                        isRunning ? "text-warmcream" : "text-warmmuted"
                      }`}>
                        {formatMMSS(secondsLeft)}
                      </div>
                      {isRunning && (
                        <div className="mt-2 text-warmgold/80 text-xs">
                          {durationMinutes} min session
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---- Setup Controls ---- */}
          {!isRunning && !isWaiting && (
            <div className="mt-8 space-y-5 animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
              {/* Duration + Wait */}
              <div className="flex items-start gap-4 flex-wrap">
                <label className="flex-1 min-w-[140px]">
                  <div className="text-xs text-warmmuted uppercase tracking-wider mb-2">Duration</div>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    step={1}
                    inputMode="numeric"
                    className="input-warm w-full text-lg"
                    value={minutesInput}
                    onChange={(e) => setMinutesInput(e.target.value)}
                    disabled={isRunning || isWaiting}
                  />
                  <div className="text-xs text-warmmuted mt-1">1 &ndash; 15 minutes</div>
                </label>

                <div className="flex-1 min-w-[140px]">
                  <div className="text-xs text-warmmuted uppercase tracking-wider mb-2">Prep time</div>
                  <div className="flex rounded-xl overflow-hidden border border-warmborder">
                    {([
                      { val: 0, label: "None" },
                      { val: 30, label: "30s" },
                      { val: 60, label: "1m" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.val}
                        className={`wait-btn flex-1 ${waitSeconds === opt.val ? "active" : ""}`}
                        onClick={() => setWaitSeconds(opt.val)}
                        disabled={isRunning || isWaiting}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs mt-1">&nbsp;</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 flex-wrap">
                {isReady && (
                  <button className="btn-primary flex-1 text-base" onClick={start}>
                    Begin Session
                  </button>
                )}
                {isPaused && (
                  <button className="btn-primary flex-1 text-base" onClick={resume}>
                    Continue
                  </button>
                )}
                {isFinished && (
                  <button className="btn-primary flex-1 text-base" onClick={reset}>
                    New Session
                  </button>
                )}
                {(isPaused || isFinished) && (
                  <button
                    className="btn-secondary"
                    onClick={reset}
                    disabled={totalSeconds === 0}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ---- Running Controls ---- */}
          {(isRunning || isWaiting) && (
            <div className="mt-8 flex gap-3 justify-center animate-fade-in-up">
              {isRunning && (
                <button className="btn-secondary flex-1 max-w-[160px]" onClick={pause}>
                  Pause
                </button>
              )}
              <button className="btn-ghost flex-1 max-w-[160px]" onClick={stopAndClear}>
                Stop
              </button>
            </div>
          )}
        </div>

        {/* ---- Voice Settings ---- */}
        <div className="panel-warm mt-4 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          <div className="p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex-1 min-w-[160px]">
                <div className="text-xs text-warmmuted uppercase tracking-wider mb-2">Coach voice</div>
                <select
                  className="select-warm w-full"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  disabled={ttsMode !== "kokoro" || voiceOptions.length === 0}
                >
                  {voiceOptions.length === 0 ? (
                    <option value={voiceId}>Loading voices...</option>
                  ) : (
                    voiceOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.lang} {v.gender}, {v.grade})
                      </option>
                    ))
                  )}
                </select>
              </label>
              <div className="self-end">
                <button
                  className="btn-ghost text-sm"
                  onClick={() => {
                    speakWithSettings(buildMotivationLine("Preview: You're doing great. Keep going.", activity));
                  }}
                  disabled={!speechAvailable || !speechEnabled}
                >
                  Test voice
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Camera Section ---- */}
        <div className="panel-warm mt-4 animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left group"
            onClick={() => setShowCamera((v) => !v)}
          >
            <span className="text-sm font-semibold text-warmcream flex items-center gap-2">
              <svg className="h-4 w-4 text-warmmuted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Camera
            </span>
            <svg
              className={`h-4 w-4 text-warmmuted transition-transform duration-300 ${showCamera ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showCamera && (
            <div className="px-5 pb-5 space-y-4 animate-fade-in-up">
              {cameraError && (
                <div className="rounded-xl bg-warmred/10 border border-warmred/30 px-4 py-3 text-sm text-warmred">
                  {cameraError}
                </div>
              )}

              <div className="relative aspect-video rounded-xl bg-warmblack overflow-hidden border border-warmborderfaint">
                {cameraStream && !recordedBlob ? (
                  <video
                    key="preview"
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : recordedBlob && playbackUrl ? (
                  <video
                    key="playback"
                    src={playbackUrl}
                    controls
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-warmmuted text-sm">
                    Enable camera to see preview
                  </div>
                )}

                {isRecording && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 rounded-full px-3 py-1.5">
                    <span className="h-2 w-2 rounded-full bg-warmred animate-pulse-dot" />
                    <span className="text-xs font-semibold text-warmred">REC</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 flex-wrap">
                {!cameraStream ? (
                  <button className="btn-secondary text-sm" onClick={handleEnableCamera}>
                    Enable Camera
                  </button>
                ) : (
                  <button className="btn-secondary text-sm" onClick={handleDisableCamera}>
                    Disable Camera
                  </button>
                )}

                {!isRecording ? (
                  <button
                    className="btn-secondary text-sm disabled:opacity-35 disabled:cursor-not-allowed"
                    onClick={startRecording}
                    disabled={!cameraStream}
                  >
                    Start Recording
                  </button>
                ) : (
                  <button
                    className="btn-ghost text-sm !border-warmred/40 !text-warmred hover:!bg-warmred/10"
                    onClick={stopRecording}
                  >
                    Stop Recording
                  </button>
                )}

                {recordedBlob && (
                  <button className="btn-ghost text-sm" onClick={handleDeleteRecording}>
                    Delete
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-warmgold rounded"
                  checked={autoRecord}
                  onChange={(e) => setAutoRecord(e.target.checked)}
                />
                <span className="text-sm text-warmmuted">Auto-record when timer starts</span>
              </label>
            </div>
          )}
        </div>

        {/* ---- TTS Muted Banner ---- */}
        {ttsMuted && (
          <div className="panel-warm mt-4 p-4 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-warmamber shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <div>
                <p className="text-sm text-warmcream">Voice coaching is temporarily unavailable.</p>
                <p className="text-xs text-warmmuted mt-1">The timer will continue without audio. Your session is unaffected.</p>
              </div>
            </div>
          </div>
        )}

        {/* ---- Disclaimer + Privacy ---- */}
        <div className="mt-6 text-center animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
          <p className="text-xs text-warmmuted/60 leading-relaxed max-w-sm mx-auto">
            If your session is extremely painful or worsening, follow your clinician's guidance.
            This timer is for encouragement, not medical advice.
          </p>
          <button
            className="mt-3 text-xs text-warmmuted/50 hover:text-warmmuted/80 transition-colors underline underline-offset-2"
            onClick={() => setShowPrivacy(true)}
          >
            Privacy
          </button>
        </div>
      </div>

      {/* ---- Privacy Modal ---- */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowPrivacy(false)}>
          <div className="panel-warm w-full max-w-md p-6 sm:p-8 animate-fade-in-up max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-warmcream mb-4">Privacy</h2>
            <div className="space-y-3 text-sm text-warmmuted leading-relaxed">
              <p>
                <strong className="text-warmcream">Your videos never leave your device.</strong> They exist only in your browser's temporary memory and are erased when you close the tab.
              </p>
              <p>
                <strong className="text-warmcream">No personal data is collected.</strong> No tracking. No cookies. No accounts. No analytics.
              </p>
              <p>
                <strong className="text-warmcream">Voice coaching uses pre-recorded audio files.</strong> No data about you is sent to any server during normal use.
              </p>
              <p>
                This app is open source &mdash; you can inspect the code at{" "}
                <a href="https://github.com/Carboteiro/knee-timer" target="_blank" rel="noopener noreferrer" className="text-warmgold hover:text-warmamber underline underline-offset-2">
                  GitHub
                </a>.
              </p>
            </div>
            <button className="btn-secondary w-full mt-5" onClick={() => setShowPrivacy(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Lightweight sanity tests (run only outside the browser)
// ---------------------------------------------------------------
(function runSanityChecks() {
  if (typeof window !== "undefined") return;

  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`Sanity check failed: ${msg}`);
  };

  // Existing checks (kept + expanded)
  assert(formatMMSS(0) === "00:00", "formatMMSS(0)");
  assert(formatMMSS(61) === "01:01", "formatMMSS(61)");
  assert(formatMMSS(600) === "10:00", "formatMMSS(600)");

  assert(clampInt(0, 1, 5) === 1, "clampInt low");
  assert(clampInt(999, 1, 5) === 5, "clampInt high");
  assert(clampInt(3.9, 1, 5) === 3, "clampInt truncates");

  const ms120 = computeMilestones(120);
  const elapsed120 = ms120.map((m) => m.elapsed);
  assert(elapsed120.includes(30), "milestone 25% of 120");
  assert(elapsed120.includes(60), "milestone 50% of 120");
  assert(elapsed120.includes(90), "milestone 75% of 120");
  assert(elapsed120.includes(108), "milestone 90% of 120");

  // Milestones should always be within [0, totalSeconds]
  const ms37 = computeMilestones(37);
  for (const m of ms37) {
    assert(m.elapsed >= 0 && m.elapsed <= 37, `milestone within bounds: ${m.key}`);
  }
})();
