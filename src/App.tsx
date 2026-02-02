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

import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_MINUTES = 10;

type SpeakOpts = {
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceURI?: string;
};

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, x));
}

function formatMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// 100-item motivation bank
const MOTIVATION_BANK: string[] = [
  "Every rep you do now brings your knee closer to full freedom.",
  "This pain has purpose — it’s clearing the path to walking with confidence again.",
  "Your future mobility is being built in this exact moment.",
  "Each stretch is unlocking a little more of the life you want back.",
  "Stay with it — this is how your knee regains trust in you.",
  "You’re rebuilding strength that will carry you for decades.",
  "A few seconds of discomfort for a lifetime of movement — keep going.",
  "Your knee is relearning, and you’re leading the way.",
  "This work restores stability, step by step.",
  "Your future walks, hikes, and stairs are being made possible right now.",
  "Healing requires effort — and you’re giving it.",
  "Every stretch improves tomorrow’s mobility.",
  "Keep going — the knee needs this to fully recover.",
  "This pain is temporary; the strength you gain is not.",
  "Imagine your future self moving freely — you’re building that body now.",
  "Your knee is responding, even if you can’t feel it yet.",
  "Slow progress is still progress — and it’s adding up.",
  "You’re reclaiming your independence with every second.",
  "These reps are laying the foundation for pain‑free movement.",
  "Flexibility returns with consistency — and you’re showing up.",
  "Keep steady — you're teaching your knee how to bend confidently again.",
  "This is how you get back to doing everything you love.",
  "Your persistence is rewiring strength into your joint.",
  "Every motion helps reduce stiffness for the rest of the day.",
  "You're helping your knee trust movement again.",
  "Future walks, future steps, future adventures — all fueled by this work.",
  "Stay consistent — your knee heals through repetition.",
  "Think long-term: this is how you protect your mobility for life.",
  "Your knee is unlocking more range with every session.",
  "Painful doesn’t mean harmful — this is constructive effort.",
  "This minute strengthens your ability to stand tall and move strong.",
  "You’re rebuilding the foundation for an active future.",
  "Your knee appreciates every bit of movement you give it.",
  "These controlled motions restore confidence in your joint.",
  "Keep going — you’re creating a knee that supports your goals.",
  "Every stretch gently reclaims mobility.",
  "Your future self will look back and be grateful you stayed with this.",
  "This rehab is your bridge to full strength.",
  "Consistency is your superpower — you're using it well.",
  "This work is reawakening muscles that protect your knee.",
  "You’re doing what’s necessary, not what’s easy.",
  "Each rep strengthens the muscles that stabilize your knee.",
  "You're proving your resilience with every second.",
  "Rehab bends now mean easier bending later — stay with it.",
  "You’re creating lasting strength, one slow rep at a time.",
  "This effort adds years of active living to your future.",
  "Every controlled motion fights stiffness.",
  "Your commitment today gives you freedom tomorrow.",
  "This session matters — it’s a building block of recovery.",
  "You’re enhancing the balance and stability around your knee.",
  "Your knee is healing through your persistence.",
  "These movements tell your body it's safe to move again.",
  "The road to full recovery is paved with moments like this.",
  "Slow and steady makes the knee stronger than rushing ever could.",
  "You're restoring normal movement patterns — keep guiding your knee.",
  "This is how you break through mobility plateaus.",
  "Every second strengthens the connection between your mind and your knee.",
  "You’re reclaiming your full stride.",
  "Your knee is learning its full range again — you’re helping it remember.",
  "These reps make the difficult days easier.",
  "Your consistency is what transforms recovery.",
  "You're laying the groundwork for pain-free steps.",
  "The effort you put in now will echo through the rest of your life.",
  "Keep breathing — motion plus oxygen equals healing.",
  "Your knee will reward this moment of effort.",
  "This is the work that ensures you walk stronger next month.",
  "Push just enough — progress is built gently.",
  "Every controlled movement helps loosen the scar tissue.",
  "You're rebuilding coordination, bit by bit.",
  "This stretch unlocks a little more freedom.",
  "You're adding strength that supports every future step.",
  "Keep at it — this is how you regain full function.",
  "These seconds right now are part of your comeback story.",
  "Your knee is capable — you’re helping it get there.",
  "You’re doing the hard part that most people avoid.",
  "This is strength training for a lifetime of movement.",
  "Every rep is an investment in your future mobility.",
  "Your body is healing — stay with it.",
  "This moment of effort reduces future moments of pain.",
  "Your knee is adapting more than you realize.",
  "You’re getting stronger precisely where you need it.",
  "Stay the course — healing takes patience and power.",
  "You’re showing real courage by doing this.",
  "Every motion increases the fluidity of your joint.",
  "The more consistent you are, the smoother recovery becomes.",
  "You’re teaching your knee to trust movement again.",
  "This effort brings you closer to walking without hesitation.",
  "Your knee is grateful for this moment.",
  "Recovery isn’t linear — but your commitment is.",
  "This work is restoring your natural strength.",
  "You’re rebuilding the ability to live actively and fully.",
  "Every second pushes stiffness further away.",
  "You’re doing the essential work that leads to a full recovery.",
  "You’re giving yourself the gift of future mobility.",
  "This session matters more than you know.",
  "Strong knees are built with moments like this.",
  "Your future freedom of movement starts right here.",
  "Keep going — future you is cheering for you.",
  // extra 10 to ensure >= 100 even if you remove some later
  "Each controlled breath helps you stay steady through the tough parts.",
  "This is how you earn back comfort on stairs and slopes.",
  "You’re restoring range of motion that makes daily life easier.",
  "Today’s effort supports tomorrow’s stability.",
  "Your knee is getting smoother with repetition — keep guiding it.",
  "You’re building the strength that protects your joint long-term.",
  "This session is an investment in a more active future.",
  "The hard part is showing up — and you’re doing it.",
  "You’re training for the life you want to live again.",
  "You’re closer than you think — keep going.",
];

function pickMotivation(i: number) {
  return MOTIVATION_BANK[i % MOTIVATION_BANK.length];
}

function speak(text: string, opts: SpeakOpts = {}) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") return;

  // Avoid queues
  synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 1;
  u.pitch = opts.pitch ?? 1;
  u.volume = opts.volume ?? 1;

  if (opts.voiceURI) {
    const voices = synth.getVoices?.() || [];
    const v = voices.find((x) => x.voiceURI === opts.voiceURI);
    if (v) u.voice = v;
  }

  synth.speak(u);
}

function buildStartLine(name: string, activity: string) {
  const n = (name || "").trim();
  const act = (activity || "").trim();
  const actPart = act ? ` for ${act}` : "";
  return n ? `Alright ${n}${actPart}. Let’s start. You’ve got this.` : `Alright${actPart}. Let’s start. You’ve got this.`;
}

function buildCongratsLine(name: string, activity: string) {
  const n = (name || "").trim();
  const act = (activity || "").trim();
  const actPart = act ? ` with ${act}` : "";
  return n ? `Time. Amazing work, ${n}. You finished${actPart}.` : `Time. Amazing work. You finished${actPart}.`;
}

function buildMotivationLine(base: string, activity: string) {
  const act = (activity || "").trim();
  const actBit = act ? ` Keep going with ${act}.` : "";
  // Name intentionally excluded (spoken once at start).
  return `${base}${actBit}`;
}

type Milestone = { key: string; elapsed: number; text: string };

function computeMilestones(totalSeconds: number): Milestone[] {
  const t = Math.max(1, Math.trunc(totalSeconds));
  return [
    {
      key: "m25",
      elapsed: Math.round(t * 0.25),
      text: "25 percent done. Your knee is warming up and responding — great pace.",
    },
    {
      key: "m50",
      elapsed: Math.round(t * 0.5),
      text: "Halfway there. This is where real recovery happens — stay steady.",
    },
    {
      key: "m75",
      elapsed: Math.round(t * 0.75),
      text: "Three quarters done. You’re pushing through the toughest part — incredible work.",
    },
    {
      key: "m90",
      elapsed: Math.round(t * 0.9),
      text: "Ninety percent done. This final stretch is where your knee gains the most — finish strong.",
    },
  ];
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
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [speechPitch, setSpeechPitch] = useState<number>(1);
  const [speechVolume, setSpeechVolume] = useState<number>(1);
  const [voiceURI, setVoiceURI] = useState<string>("");

  const intervalRef = useRef<number | null>(null);
  const lastSpokenRef = useRef<number | string | null>(null);

  const totalSeconds = useMemo(() => durationMinutes * 60, [durationMinutes]);
  const progress = useMemo(() => {
    const done = totalSeconds - secondsLeft;
    return totalSeconds === 0 ? 0 : Math.min(1, Math.max(0, done / totalSeconds));
  }, [secondsLeft, totalSeconds]);

  const milestones = useMemo(() => computeMilestones(totalSeconds), [totalSeconds]);

  const canSpeak = typeof window !== "undefined" && !!window.speechSynthesis;

  useEffect(() => {
    if (!canSpeak) return;
    const onVoicesChanged = () => {
      // no-op state set to refresh voice list
      setVoiceURI((v) => v);
    };
    window.speechSynthesis.addEventListener?.("voiceschanged", onVoicesChanged);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", onVoicesChanged);
  }, [canSpeak]);

  useEffect(() => {
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, []);

  function speakWithSettings(text: string) {
    speak(text, { rate: speechRate, pitch: speechPitch, volume: speechVolume, voiceURI });
  }

  function clearIntervalIfAny() {
    if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  function announce(currentSecondsLeft: number) {
    if (!speechEnabled) return;

    // Never speak at 0:00 (reserved for congratulations)
    if (currentSecondsLeft === 0) return;

    const elapsedSeconds = totalSeconds - currentSecondsLeft;

    // Milestones take precedence
    for (const m of milestones) {
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

    setDurationMinutes(mins);
    setSecondsLeft(startSeconds);
    setIsFinished(false);
    setIsRunning(true);

    lastSpokenRef.current = null;

    if (speechEnabled) {
      speakWithSettings(buildStartLine(userName, activity));
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
          clearIntervalIfAny();
          setIsRunning(false);
          setIsFinished(true);
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
  }

  function resume() {
    if (secondsLeft <= 0) return;
    setIsRunning(true);

    announce(secondsLeft);

    clearIntervalIfAny();
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;

        if (next <= 0) {
          if (speechEnabled) {
            speakWithSettings(buildCongratsLine(userName, activity));
          }
          clearIntervalIfAny();
          setIsRunning(false);
          setIsFinished(true);
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
  }

  function stopAndClear() {
    pause();
    setIsFinished(false);
    setSecondsLeft(durationMinutes * 60);
    lastSpokenRef.current = null;
  }

  const statusText = isFinished
    ? "Session complete — nice work."
    : isRunning
      ? "Running"
      : secondsLeft === totalSeconds
        ? "Ready"
        : "Paused";

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
                <div className="text-sm text-zinc-300 mb-1">What you’re doing</div>
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
                <div className="text-sm text-zinc-300 mb-1">Minutes (1–180)</div>
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
                    ? "You’re rebuilding your future mobility — stay steady."
                    : "Done. Be proud of showing up."}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-zinc-800 pt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold">Voice coach</div>
                <div className="text-sm text-zinc-400">
                  {canSpeak ? "Speech is available in this browser." : "Speech not available here."}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={speechEnabled}
                  onChange={(e) => setSpeechEnabled(e.target.checked)}
                  disabled={!canSpeak}
                />
                <span className="text-sm text-zinc-200">Enable spoken messages</span>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label>
                <div className="text-sm text-zinc-300 mb-1">Voice</div>
                <select
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                  value={voiceURI}
                  onChange={(e) => setVoiceURI(e.target.value)}
                  disabled={!canSpeak}
                >
                  <option value="">Default</option>
                  {(window?.speechSynthesis?.getVoices?.() || []).map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label>
                  <div className="text-sm text-zinc-300 mb-1">Rate</div>
                  <input
                    type="number"
                    min={0.5}
                    max={1.5}
                    step={0.1}
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(Number(e.target.value))}
                    disabled={!canSpeak}
                  />
                </label>
                <label>
                  <div className="text-sm text-zinc-300 mb-1">Pitch</div>
                  <input
                    type="number"
                    min={0.8}
                    max={1.2}
                    step={0.1}
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-600"
                    value={speechPitch}
                    onChange={(e) => setSpeechPitch(Number(e.target.value))}
                    disabled={!canSpeak}
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
                    disabled={!canSpeak}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                className="rounded-xl px-4 py-2 bg-zinc-800 text-zinc-50 font-semibold hover:bg-zinc-700 transition"
                onClick={() => {
                  speakWithSettings(buildMotivationLine("Preview: You’re doing great. Keep going.", activity));
                }}
                disabled={!canSpeak}
              >
                Test voice
              </button>
              <div className="text-sm text-zinc-400">Tip: If you don’t hear anything, click once and try again.</div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-zinc-500 leading-relaxed">
          <p>
            If your session is extremely painful or worsening, follow your clinician’s guidance. This timer is for
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
