export type Milestone = { key: string; elapsed: number; text: string };
export type PrefetchLine = { key: string; text: string };

export const DEFAULT_MINUTES = 10;

export const SHORT_UTTERANCE_MIN_WORDS = 10;
export const SHORT_UTTERANCE_PAD = " Keep going.";

// 100-item motivation bank
export const MOTIVATION_BANK: string[] = [
  "Every rep you do now brings your knee closer to full freedom.",
  "This pain has purpose - it's clearing the path to walking with confidence again.",
  "Your future mobility is being built in this exact moment.",
  "Each stretch is unlocking a little more of the life you want back.",
  "Stay with it - this is how your knee regains trust in you.",
  "You're rebuilding strength that will carry you for decades.",
  "A few seconds of discomfort for a lifetime of movement - keep going.",
  "Your knee is relearning, and you're leading the way.",
  "This work restores stability, step by step.",
  "Your future walks, hikes, and stairs are being made possible right now.",
  "Healing requires effort - and you're giving it.",
  "Every stretch improves tomorrow's mobility.",
  "Keep going - the knee needs this to fully recover.",
  "This pain is temporary; the strength you gain is not.",
  "Imagine your future self moving freely - you're building that body now.",
  "Your knee is responding, even if you can't feel it yet.",
  "Slow progress is still progress - and it's adding up.",
  "You're reclaiming your independence with every second.",
  "These reps are laying the foundation for pain-free movement.",
  "Flexibility returns with consistency - and you're showing up.",
  "Keep steady - you're teaching your knee how to bend confidently again.",
  "This is how you get back to doing everything you love.",
  "Your persistence is rewiring strength into your joint.",
  "Every motion helps reduce stiffness for the rest of the day.",
  "You're helping your knee trust movement again.",
  "Future walks, future steps, future adventures - all fueled by this work.",
  "Stay consistent - your knee heals through repetition.",
  "Think long-term: this is how you protect your mobility for life.",
  "Your knee is unlocking more range with every session.",
  "Painful doesn't mean harmful - this is constructive effort.",
  "This minute strengthens your ability to stand tall and move strong.",
  "You're rebuilding the foundation for an active future.",
  "Your knee appreciates every bit of movement you give it.",
  "These controlled motions restore confidence in your joint.",
  "Keep going - you're creating a knee that supports your goals.",
  "Every stretch gently reclaims mobility.",
  "Your future self will look back and be grateful you stayed with this.",
  "This rehab is your bridge to full strength.",
  "Consistency is your superpower - you're using it well.",
  "This work is reawakening muscles that protect your knee.",
  "You're doing what's necessary, not what's easy.",
  "Each rep strengthens the muscles that stabilize your knee.",
  "You're proving your resilience with every second.",
  "Rehab bends now mean easier bending later - stay with it.",
  "You're creating lasting strength, one slow rep at a time.",
  "This effort adds years of active living to your future.",
  "Every controlled motion fights stiffness.",
  "Your commitment today gives you freedom tomorrow.",
  "This session matters - it's a building block of recovery.",
  "You're enhancing the balance and stability around your knee.",
  "Your knee is healing through your persistence.",
  "These movements tell your body it's safe to move again.",
  "The road to full recovery is paved with moments like this.",
  "Slow and steady makes the knee stronger than rushing ever could.",
  "You're restoring normal movement patterns - keep guiding your knee.",
  "This is how you break through mobility plateaus.",
  "Every second strengthens the connection between your mind and your knee.",
  "You're reclaiming your full stride.",
  "Your knee is learning its full range again - you're helping it remember.",
  "These reps make the difficult days easier.",
  "Your consistency is what transforms recovery.",
  "You're laying the groundwork for pain-free steps.",
  "The effort you put in now will echo through the rest of your life.",
  "Keep breathing - motion plus oxygen equals healing.",
  "Your knee will reward this moment of effort.",
  "This is the work that ensures you walk stronger next month.",
  "Push just enough - progress is built gently.",
  "Every controlled movement helps loosen the scar tissue.",
  "You're rebuilding coordination, bit by bit.",
  "This stretch unlocks a little more freedom.",
  "You're adding strength that supports every future step.",
  "Keep at it - this is how you regain full function.",
  "These seconds right now are part of your comeback story.",
  "Your knee is capable - you're helping it get there.",
  "You're doing the hard part that most people avoid.",
  "This is strength training for a lifetime of movement.",
  "Every rep is an investment in your future mobility.",
  "Your body is healing - stay with it.",
  "This moment of effort reduces future moments of pain.",
  "Your knee is adapting more than you realize.",
  "You're getting stronger precisely where you need it.",
  "Stay the course - healing takes patience and power.",
  "You're showing real courage by doing this.",
  "Every motion increases the fluidity of your joint.",
  "The more consistent you are, the smoother recovery becomes.",
  "You're teaching your knee to trust movement again.",
  "This effort brings you closer to walking without hesitation.",
  "Your knee is grateful for this moment.",
  "Recovery isn't linear - but your commitment is.",
  "This work is restoring your natural strength.",
  "You're rebuilding the ability to live actively and fully.",
  "Every second pushes stiffness further away.",
  "You're doing the essential work that leads to a full recovery.",
  "You're giving yourself the gift of future mobility.",
  "This session matters more than you know.",
  "Strong knees are built with moments like this.",
  "Your future freedom of movement starts right here.",
  "Keep going - future you is cheering for you.",
  // extra 10 to ensure >= 100 even if you remove some later
  "Each controlled breath helps you stay steady through the tough parts.",
  "This is how you earn back comfort on stairs and slopes.",
  "You're restoring range of motion that makes daily life easier.",
  "Today's effort supports tomorrow's stability.",
  "Your knee is getting smoother with repetition - keep guiding it.",
  "You're building the strength that protects your joint long-term.",
  "This session is an investment in a more active future.",
  "The hard part is showing up - and you're doing it.",
  "You're training for the life you want to live again.",
  "You're closer than you think - keep going.",
];

export function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, x));
}

export function clampFloat(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, x));
}

export function formatMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function approximateWordCount(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function padShortUtterance(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  let result = trimmed;
  while (approximateWordCount(result) < SHORT_UTTERANCE_MIN_WORDS) {
    result = `${result}${SHORT_UTTERANCE_PAD}`;
  }
  return result;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickMotivation(i: number) {
  return MOTIVATION_BANK[i % MOTIVATION_BANK.length];
}

export const START_BANK: string[] = [
  "Ok, let's get started. Let's make this effort count.",
  "Ok, it is knee healing time, let's get started.",
  "Alright, time to strengthen that knee. Here we go.",
  "Let's do this. Every second counts toward recovery.",
  "Ready? Let's go. Your knee will thank you for this.",
  "Ok, it's go time. Let's make every rep matter.",
  "Here we go. Stay focused and give it your best.",
  "Time to get to work. You've got what it takes.",
  "Let's begin. This is where the healing happens.",
  "Alright, let's get moving. Your knee is counting on you.",
];

export const CONGRATS_BANK: string[] = [
  "Time's up. You did great. See you next session.",
  "And that's it. Amazing effort, well done.",
  "Done. You should be proud of that effort.",
  "That's a wrap. Great work today.",
  "Finished. Another session in the books, well done.",
  "Time. You gave it your all, and it shows.",
  "And we're done. Excellent work, until next time.",
  "That's it. Really solid effort today.",
  "Session complete. You're getting stronger every time.",
  "Done. Great job, rest up and see you next session.",
];

export function buildStartLine() {
  return START_BANK[Math.floor(Math.random() * START_BANK.length)];
}

export function buildCongratsLine() {
  return CONGRATS_BANK[Math.floor(Math.random() * CONGRATS_BANK.length)];
}

export function buildMotivationLine(base: string, activity: string) {
  const act = (activity || "").trim();
  const actBit = act ? ` Keep going with ${act}.` : "";
  // Name intentionally excluded (spoken once at start).
  return `${base}${actBit}`;
}

export function computeMilestones(totalSeconds: number): Milestone[] {
  const t = Math.max(1, Math.trunc(totalSeconds));
  return [
    {
      key: "m25",
      elapsed: Math.round(t * 0.25),
      text: "25 percent done. Your knee is warming up and responding - great pace.",
    },
    {
      key: "m50",
      elapsed: Math.round(t * 0.5),
      text: "Halfway there. This is where real recovery happens - stay steady.",
    },
    {
      key: "m75",
      elapsed: Math.round(t * 0.75),
      text: "Three quarters done. You're pushing through the toughest part - incredible work.",
    },
    {
      key: "m90",
      elapsed: Math.round(t * 0.9),
      text: "Ninety percent done. This final stretch is where your knee gains the most - finish strong.",
    },
  ];
}

export function buildPrefetchLines(totalSeconds: number, activity: string, motivationBank?: string[]): PrefetchLine[] {
  const bank = motivationBank || MOTIVATION_BANK;
  const lines: PrefetchLine[] = [];
  const milestones = computeMilestones(totalSeconds);
  const milestoneSet = new Set(milestones.map((m) => m.elapsed));

  lines.push({ key: "start", text: buildStartLine() });
  lines.push({ key: "end", text: buildCongratsLine() });
  for (const m of milestones) {
    lines.push({ key: m.key, text: m.text });
  }

  for (let elapsed = 0; elapsed < totalSeconds; elapsed += 30) {
    if (elapsed === 0 && totalSeconds % 30 !== 0) continue;
    if (milestoneSet.has(elapsed)) continue;
    const idx = Math.floor(elapsed / 30);
    const base = bank[idx % bank.length];
    lines.push({ key: `t${elapsed}`, text: buildMotivationLine(base, activity) });
  }

  return lines;
}
