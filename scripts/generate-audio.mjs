#!/usr/bin/env node
/**
 * Pre-generate static MP3 files for all known TTS utterances.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-audio.mjs
 *
 * Outputs ~116 MP3 files into public/audio/{voice}-{speed}/
 * plus a manifest.json mapping text → hash.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Re-implement the text-building logic from src/ttsUtils.ts so we don't need
// a TS compilation step. The source of truth is ttsUtils.ts — keep in sync.
// ---------------------------------------------------------------------------

const MOTIVATION_BANK = [
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

const SHORT_UTTERANCE_MIN_WORDS = 10;
const SHORT_UTTERANCE_PAD = " Keep going.";

function padShortUtterance(text) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  let result = trimmed;
  while (result.split(/\s+/).length < SHORT_UTTERANCE_MIN_WORDS) {
    result = `${result}${SHORT_UTTERANCE_PAD}`;
  }
  return result;
}

const START_BANK = [
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

const CONGRATS_BANK = [
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

function buildMotivationLine(base, activity) {
  const act = (activity || "").trim();
  const actBit = act ? ` Keep going with ${act}.` : "";
  return `${base}${actBit}`;
}

function computeMilestones(totalSeconds) {
  const t = Math.max(1, Math.trunc(totalSeconds));
  return [
    { key: "m25", elapsed: Math.round(t * 0.25), text: "25 percent done. Your knee is warming up and responding - great pace." },
    { key: "m50", elapsed: Math.round(t * 0.5), text: "Halfway there. This is where real recovery happens - stay steady." },
    { key: "m75", elapsed: Math.round(t * 0.75), text: "Three quarters done. You're pushing through the toughest part - incredible work." },
    { key: "m90", elapsed: Math.round(t * 0.9), text: "Ninety percent done. This final stretch is where your knee gains the most - finish strong." },
  ];
}

// ---------------------------------------------------------------------------
// Collect all unique texts
// ---------------------------------------------------------------------------

function collectAllTexts() {
  const activity = "physio";
  const textSet = new Map(); // text → description (for manifest)

  // Start lines (all variations)
  for (let i = 0; i < START_BANK.length; i++) {
    textSet.set(padShortUtterance(START_BANK[i]), `start-${i}`);
  }

  // End/congrats lines (all variations)
  for (let i = 0; i < CONGRATS_BANK.length; i++) {
    textSet.set(padShortUtterance(CONGRATS_BANK[i]), `congrats-${i}`);
  }

  // Milestone texts (same for all durations)
  const milestoneTexts = [
    "25 percent done. Your knee is warming up and responding - great pace.",
    "Halfway there. This is where real recovery happens - stay steady.",
    "Three quarters done. You're pushing through the toughest part - incredible work.",
    "Ninety percent done. This final stretch is where your knee gains the most - finish strong.",
  ];
  for (const mt of milestoneTexts) {
    textSet.set(padShortUtterance(mt), "milestone");
  }

  // All motivation lines
  for (let i = 0; i < MOTIVATION_BANK.length; i++) {
    const line = buildMotivationLine(MOTIVATION_BANK[i], activity);
    textSet.set(padShortUtterance(line), `motivation-${i}`);
  }

  return textSet;
}

// ---------------------------------------------------------------------------
// Cache key = SHA-256 of "voice|speed|text" (same as api/tts.js)
// ---------------------------------------------------------------------------

function makeCacheKey(text, voice, speed) {
  const raw = `${voice}|${speed.toFixed(2)}|${text}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// Generate audio via OpenAI TTS API
// ---------------------------------------------------------------------------

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

async function generateAudio(text, voice, speed, apiKey) {
  const res = await fetch(OPENAI_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice,
      speed,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI TTS failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENAI_API_KEY environment variable is required.");
    console.error("Usage: OPENAI_API_KEY=sk-... node scripts/generate-audio.mjs");
    process.exit(1);
  }

  const voice = "echo";
  const speed = 1.0;
  const dirName = `${voice}-${speed.toFixed(2)}`;
  const outDir = path.join(ROOT, "public", "audio", dirName);

  fs.mkdirSync(outDir, { recursive: true });

  const texts = collectAllTexts();
  const manifest = {};
  let generated = 0;
  let skipped = 0;
  let totalChars = 0;

  console.log(`Generating ${texts.size} audio files for voice="${voice}" speed=${speed}...`);
  console.log(`Output: ${outDir}\n`);

  for (const [text, desc] of texts) {
    const hash = makeCacheKey(text, voice, speed);
    const filePath = path.join(outDir, `${hash}.mp3`);

    manifest[hash] = { text: text.slice(0, 80) + (text.length > 80 ? "..." : ""), desc };

    // Skip if already generated
    if (fs.existsSync(filePath)) {
      skipped++;
      continue;
    }

    totalChars += text.length;

    try {
      const mp3 = await generateAudio(text, voice, speed, apiKey);
      fs.writeFileSync(filePath, mp3);
      generated++;
      console.log(`  [${generated + skipped}/${texts.size}] ${desc}: ${hash.slice(0, 12)}... (${mp3.length} bytes)`);
    } catch (err) {
      console.error(`  FAILED: ${desc} — ${err.message}`);
      process.exit(1);
    }

    // Brief pause to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  // Write manifest
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nDone!`);
  console.log(`  Generated: ${generated} files`);
  console.log(`  Skipped (already existed): ${skipped} files`);
  console.log(`  Total unique texts: ${texts.size}`);
  console.log(`  Total chars sent to API: ${totalChars}`);
  console.log(`  Estimated cost: $${((totalChars / 1_000_000) * 15).toFixed(4)}`);
  console.log(`  Manifest: ${manifestPath}`);
}

main();
