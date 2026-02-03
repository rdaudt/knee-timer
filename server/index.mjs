import "dotenv/config";
import express from "express";
import crypto from "node:crypto";

const app = express();
app.use(express.json({ limit: "200kb" }));

const PORT = Number(process.env.PORT || 8787);
const HF_API_KEY = process.env.HF_API_KEY || "";
const HF_TTS_URL =
  process.env.HF_TTS_URL || "https://router.huggingface.co/hf-inference/models/hexgrad/Kokoro-82M";
const MAX_TEXT_CHARS = Number(process.env.HF_MAX_TEXT_CHARS || 800);
const CACHE_TTL_MS = Number(process.env.TTS_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const CACHE_MAX_ENTRIES = Number(process.env.TTS_CACHE_MAX_ENTRIES || 500);

const SPEED_MIN = 0.8;
const SPEED_MAX = 1.2;
const SPEED_STEP = 0.05;
const SPEED_DEFAULT = 1.0;

const DEFAULT_VOICE_ID = "af_heart";
const CURATED_VOICES = [
  { id: "af_heart", label: "Heart", lang: "American English", gender: "F", grade: "A" },
  { id: "af_bella", label: "Bella", lang: "American English", gender: "F", grade: "A-" },
  { id: "af_nicole", label: "Nicole", lang: "American English", gender: "F", grade: "B-" },
  { id: "bf_emma", label: "Emma", lang: "British English", gender: "F", grade: "B-" },
  { id: "am_fenrir", label: "Fenrir", lang: "American English", gender: "M", grade: "C+" },
  { id: "am_michael", label: "Michael", lang: "American English", gender: "M", grade: "C+" },
];

function clamp(n, min, max) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, x));
}

const cache = new Map();

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function setCache(key, entry) {
  cache.set(key, entry);
  if (cache.size <= CACHE_MAX_ENTRIES) return;
  const firstKey = cache.keys().next().value;
  if (firstKey) cache.delete(firstKey);
}

function makeCacheKey(text, voice, speed) {
  const raw = `${voice}|${speed.toFixed(2)}|${text}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: "huggingface", hasKey: Boolean(HF_API_KEY) });
});

app.get("/api/voices", (_req, res) => {
  res.json({
    defaultVoiceId: DEFAULT_VOICE_ID,
    speed: { min: SPEED_MIN, max: SPEED_MAX, step: SPEED_STEP, recommended: SPEED_DEFAULT },
    voices: CURATED_VOICES,
  });
});

app.post("/api/tts", async (req, res) => {
  if (!HF_API_KEY) {
    return res.status(500).json({ error: "HF_API_KEY is not set" });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return res.status(400).json({ error: `text exceeds ${MAX_TEXT_CHARS} characters` });
  }

  const voice = typeof req.body?.voice === "string" ? req.body.voice : DEFAULT_VOICE_ID;
  const speed = clamp(Number(req.body?.speed), SPEED_MIN, SPEED_MAX);

  const cacheKey = makeCacheKey(text, voice, speed);
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("X-Cache", "HIT");
    return res.send(cached.buffer);
  }

  const payload = {
    text_inputs: text,
    parameters: { voice, speed },
  };

  const hfRes = await fetch(HF_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "audio/wav",
    },
    body: JSON.stringify(payload),
  });

  if (!hfRes.ok) {
    const detail = await hfRes.text();
    return res.status(hfRes.status).json({ error: "HF request failed", detail: detail.slice(0, 500) });
  }

  const contentType = hfRes.headers.get("content-type") || "audio/wav";
  const arrayBuffer = await hfRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  setCache(cacheKey, { buffer, contentType, expiresAt: Date.now() + CACHE_TTL_MS });
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Cache", "MISS");
  return res.send(buffer);
});

app.listen(PORT, () => {
  console.log(`TTS server listening on http://localhost:${PORT}`);
});


