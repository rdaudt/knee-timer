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
import backMusicUrl from "./assets/backmusic.mp3";
import {
  cameraErrorMessage,
  createRecorder,
  buildVideoBlob,
  isIOS,
  isMobile,
  saveBlob,
  downloadBlob,
  generateFilename,
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

const DEFAULT_VOICE_ID = "af_heart";
const SPEED_DEFAULT = 1;
const SPEED_MIN = 0.8;
const SPEED_MAX = 1.2;
const SPEED_STEP = 0.05;
const DUCK_VOLUME = 0.05;
const NORMAL_VOLUME = 0.4;

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

export default function App() {
  const [minutesInput, setMinutesInput] = useState<string>(String(DEFAULT_MINUTES));
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_MINUTES);
  const [secondsLeft, setSecondsLeft] = useState<number>(DEFAULT_MINUTES * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  // Personalization
  const [userName, setUserName] = useState<string>("");
  const [activity, setActivity] = useState<string>("physio");

  // Speech settings
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(true);
  const [speechSpeed, setSpeechSpeed] = useState<number>(SPEED_DEFAULT);
  const [speechVolume, setSpeechVolume] = useState<number>(1);
  const [voiceId, setVoiceId] = useState<string>(DEFAULT_VOICE_ID);
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>([]);
  const [speedRange, setSpeedRange] = useState({ min: SPEED_MIN, max: SPEED_MAX, step: SPEED_STEP });
  const [ttsMode, setTtsMode] = useState<TtsMode>("kokoro");
  const [ttsNote, setTtsNote] = useState<string>("");

  const intervalRef = useRef<number | null>(null);
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

  // Camera (dev-only)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement>(null);
  const playbackUrlRef = useRef<string>("");

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
        setTtsNote("");
      } catch {
        if (cancelled) return;
        setVoiceOptions([]);
        setSpeechEnabled(false);
        setTtsNote("OpenAI TTS unavailable.");
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
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
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
    // Use Web Audio API for iOS-compatible volume control
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

    // Resume context (required for iOS after user gesture)
    ctx.resume().then(() => {
      audio.play();
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

  async function playBlob(blob: Blob) {
    stopAudio();
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    // Reuse shared audio element for iOS compatibility (must be created during user gesture)
    const audio = getSharedTtsAudio();
    audio.src = url;
    audio.volume = clampFloat(speechVolume, 0, 1);
    audioRef.current = audio;
    audio.onended = () => {
      if (audioRef.current === audio) audioRef.current = null;
      if (audioUrlRef.current === url) {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      }
      restoreBackgroundMusic();
    };
    audio.onerror = () => {
      if (audioUrlRef.current === url) {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      }
      restoreBackgroundMusic();
    };
    // Duck first, then wait for the ramp to complete before playing TTS
    duckBackgroundMusic();
    await new Promise((r) => setTimeout(r, 120));
    await audio.play();
  }

  function makeClientCacheKey(text: string, voice: string, speed: number) {
    return `${voice}|${speed.toFixed(2)}|${text}`;
  }

  async function fetchTtsBlob(text: string, voice: string, speed: number) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      if (playbackUrlRef.current) {
        URL.revokeObjectURL(playbackUrlRef.current);
        playbackUrlRef.current = "";
      }
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
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = "";
    }
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
    setShowSavePrompt(false);
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = "";
    }
    try {
      const recorder = createRecorder(
        cameraStream,
        (chunk) => videoChunksRef.current.push(chunk),
        () => {
          const mime = mimeType || "video/webm";
          const blob = buildVideoBlob(videoChunksRef.current, mime);
          setRecordedBlob(blob);
          setIsRecording(false);
          const url = URL.createObjectURL(blob);
          if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
          playbackUrlRef.current = url;
          if (isMobile()) {
            setShowSavePrompt(true);
          }
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

  const handleSaveRecording = useCallback(async () => {
    if (!recordedBlob) return;
    if (isIOS()) {
      await saveBlob(recordedBlob, generateFilename(recordedBlob.type));
    } else {
      downloadBlob(recordedBlob, generateFilename(recordedBlob.type));
    }
    setShowSavePrompt(false);
  }, [recordedBlob]);

  const handleDeleteRecording = useCallback(() => {
    setRecordedBlob(null);
    setShowSavePrompt(false);
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = "";
    }
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
          setTtsNote("OpenAI TTS unavailable.");
        }
      }
    })();
  }

  function clearIntervalIfAny() {
    if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
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

  function start() {
    const mins = clampInt(parseInt(minutesInput, 10), 1, 180);
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
    startBackgroundMusic();

    if (speechEnabled && ttsMode === "kokoro") {
      const lines = buildPrefetchLines(startSeconds, activity, userName);
      void prefetchLines(lines, voiceId, clampFloat(speechSpeed, speedRange.min, speedRange.max));
    }

    if (speechEnabled) {
      speakWithSettings(buildStartLine(userName, activity));
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
          if (speechEnabled) {
            speakWithSettings(buildCongratsLine(userName, activity));
          }
          stopBackgroundMusic();
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
      const lines = buildPrefetchLines(totalSeconds, activity, userName);
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
          if (speechEnabled) {
            speakWithSettings(buildCongratsLine(userName, activity));
          }
          stopBackgroundMusic();
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
    pause();
    setIsFinished(false);
    setSecondsLeft(durationMinutes * 60);
    lastSpokenRef.current = null;
    cancelPrefetch();
  }

  function stopAndClear() {
    pause();
    setIsFinished(false);
    setSecondsLeft(durationMinutes * 60);
    lastSpokenRef.current = null;
    cancelPrefetch();
    stopBackgroundMusic();
    // Stop camera recording on manual stop
    if (mediaRecorderRef.current?.state === "recording") stopRecording();
  }

  const statusText = isFinished
    ? "Session complete - nice work."
    : isRunning
      ? "Running"
      : secondsLeft === totalSeconds
        ? "Ready"
        : "Paused";
  const speechStatusText = ttsMode === "kokoro" ? "OpenAI TTS" : "Unavailable";
  const speechAvailable = ttsMode === "kokoro";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="rounded-2xl bg-zinc-900/60 shadow-xl border border-zinc-800 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Motivational 30-Second Timer</h1>
              <p className="text-zinc-300 mt-1">Rehab is hard. This keeps you moving through it.</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-zinc-400">Status</div>
              <div className="text-base font-medium">{statusText}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label>
                <div className="text-sm text-zinc-300 mb-1">Your name</div>
                <input
                  type="text"
                  placeholder="e.g., Alex"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={isRunning}
                />
              </label>

              <label>
                <div className="text-sm text-zinc-300 mb-1">What you're doing</div>
                <input
                  type="text"
                  placeholder="e.g., physiotherapy"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  disabled={isRunning}
                />
              </label>
            </div>

            <div className="mt-5 flex items-end gap-3 flex-wrap">
              <label className="flex-1 min-w-[180px]">
                <div className="text-sm text-zinc-300 mb-1">Minutes (1-180)</div>
                <input
                  type="number"
                  min={1}
                  max={180}
                  step={1}
                  inputMode="numeric"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                  value={minutesInput}
                  onChange={(e) => setMinutesInput(e.target.value)}
                  disabled={isRunning}
                />
              </label>

              {!isRunning && secondsLeft === totalSeconds ? (
                <button
                  className="rounded-xl px-4 py-2 bg-zinc-50 text-zinc-950 font-semibold hover:opacity-90 transition"
                  onClick={start}
                >
                  Start
                </button>
              ) : null}

              {isRunning ? (
                <button
                  className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition"
                  onClick={pause}
                >
                  Pause
                </button>
              ) : secondsLeft > 0 && secondsLeft !== totalSeconds ? (
                <button
                  className="rounded-xl px-4 py-2 bg-zinc-50 text-zinc-950 font-semibold hover:opacity-90 transition"
                  onClick={resume}
                >
                  Resume
                </button>
              ) : null}

              <button
                className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition"
                onClick={reset}
                disabled={isRunning || totalSeconds === 0}
              >
                Reset
              </button>

              <button
                className="rounded-xl px-4 py-2 bg-transparent border border-zinc-700 text-zinc-200 font-semibold hover:bg-zinc-800 transition"
                onClick={stopAndClear}
              >
                Stop
              </button>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">Time remaining</div>
                <div className="text-sm text-zinc-400">{Math.round(progress * 100)}%</div>
              </div>

              <div className="mt-2 rounded-full h-3 bg-zinc-800 overflow-hidden">
                <div className="h-full bg-zinc-50" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>

              <div className="mt-6 text-center">
                <div className="text-6xl font-bold tabular-nums tracking-tight">{formatMMSS(secondsLeft)}</div>
                <div className="mt-2 text-zinc-300">
                  {secondsLeft > 0
                    ? "You're rebuilding your future mobility - stay steady."
                    : "Done. Be proud of showing up."}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-zinc-800 pt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Voice coach</div>
                <div className="text-sm text-zinc-400">{speechStatusText}</div>
                {ttsNote ? <div className="text-xs text-amber-300 mt-1">{ttsNote}</div> : null}
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={speechEnabled}
                  onChange={(e) => setSpeechEnabled(e.target.checked)}
                  disabled={!speechAvailable}
                />
                <span className="text-sm text-zinc-200">Enable spoken messages</span>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label>
                <div className="text-sm text-zinc-300 mb-1">Voice</div>
                <select
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
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

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <div className="text-sm text-zinc-300 mb-1">
                    Speed ({speedRange.min.toFixed(1)}-{speedRange.max.toFixed(1)})
                  </div>
                  <input
                    type="number"
                    min={speedRange.min}
                    max={speedRange.max}
                    step={speedRange.step}
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                    value={speechSpeed}
                    onChange={(e) =>
                      setSpeechSpeed(clampFloat(Number(e.target.value), speedRange.min, speedRange.max))
                    }
                    disabled={!speechAvailable}
                  />
                </label>
                <label>
                  <div className="text-sm text-zinc-300 mb-1">Vol</div>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                    value={speechVolume}
                    onChange={(e) => setSpeechVolume(Number(e.target.value))}
                    disabled={!speechAvailable}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition"
                onClick={() => {
                  speakWithSettings(buildMotivationLine("Preview: You're doing great. Keep going.", activity));
                }}
                disabled={!speechAvailable || !speechEnabled}
              >
                Test voice
              </button>
              <div className="text-sm text-zinc-400">Tip: If you don't hear anything, click once and try again.</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl">
            <button
              className="w-full flex items-center justify-between px-6 py-4 text-left"
              onClick={() => setShowCamera((v) => !v)}
            >
              <span className="text-sm font-semibold text-zinc-50">Camera</span>
              <svg
                className={`h-4 w-4 text-zinc-400 transition-transform ${showCamera ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showCamera && (
              <div className="px-6 pb-6 space-y-4">
                {cameraError && (
                  <div className="rounded-xl bg-red-950/60 border border-red-800 px-4 py-3 text-sm text-red-300">
                    {cameraError}
                  </div>
                )}

                <div className="relative aspect-video rounded-xl bg-zinc-950 overflow-hidden">
                  {cameraStream && !recordedBlob ? (
                    <video
                      ref={previewRef}
                      autoPlay
                      muted
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : recordedBlob && playbackUrlRef.current ? (
                    <video
                      src={playbackUrlRef.current}
                      controls
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
                      Enable camera to see preview
                    </div>
                  )}

                  {isRecording && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-semibold text-red-400">REC</span>
                    </div>
                  )}
                </div>

                {showSavePrompt && recordedBlob && (
                  <div className="rounded-xl bg-emerald-900/70 border border-emerald-700 p-4 text-center space-y-3">
                    <p className="text-sm font-semibold text-emerald-100">
                      Your exercise recording is ready!
                    </p>
                    <button
                      className="w-full rounded-xl px-4 py-3 bg-emerald-600 text-white font-semibold text-base hover:bg-emerald-500 transition focus:ring-2 focus:ring-emerald-400"
                      onClick={handleSaveRecording}
                    >
                      {isIOS() ? "Save to Photos" : "Download Recording"}
                    </button>
                    {isIOS() && (
                      <p className="text-xs text-emerald-300">
                        Tap &quot;Save Video&quot; on the share sheet to save to your camera roll.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3 flex-wrap">
                  {!cameraStream ? (
                    <button
                      className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition focus:ring-2 focus:ring-zinc-600"
                      onClick={handleEnableCamera}
                    >
                      Enable Camera
                    </button>
                  ) : (
                    <button
                      className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition focus:ring-2 focus:ring-zinc-600"
                      onClick={handleDisableCamera}
                    >
                      Disable Camera
                    </button>
                  )}

                  {!isRecording ? (
                    <button
                      className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition focus:ring-2 focus:ring-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={startRecording}
                      disabled={!cameraStream}
                    >
                      Start Recording
                    </button>
                  ) : (
                    <button
                      className="rounded-xl px-4 py-2 bg-red-900 text-zinc-50 font-semibold hover:bg-red-800 transition focus:ring-2 focus:ring-zinc-600"
                      onClick={stopRecording}
                    >
                      Stop Recording
                    </button>
                  )}

                  {recordedBlob && (
                    <>
                      <button
                        className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition focus:ring-2 focus:ring-zinc-600"
                        onClick={handleSaveRecording}
                      >
                        {isIOS() ? "Save" : "Download"}
                      </button>
                      <button
                        className="rounded-xl px-4 py-2 bg-transparent border border-zinc-700 text-zinc-200 font-semibold hover:bg-zinc-800 transition focus:ring-2 focus:ring-zinc-600"
                        onClick={handleDeleteRecording}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={autoRecord}
                    onChange={(e) => setAutoRecord(e.target.checked)}
                  />
                  <span className="text-sm text-zinc-200">Auto-record when timer starts</span>
                </label>
              </div>
            )}
          </div>

        <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
          <p>
            If your session is extremely painful or worsening, follow your clinician's guidance. This timer is for
            encouragement, not medical advice.
          </p>
        </div>
      </div>
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






