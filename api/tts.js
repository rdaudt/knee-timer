import crypto from "node:crypto";
import {
  CURATED_VOICES,
  DEFAULT_VOICE_ID,
  SPEED_MAX,
  SPEED_MIN,
} from "./_config.js";

const VALID_VOICE_IDS = new Set(CURATED_VOICES.map((v) => v.id));

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
const MAX_TEXT_CHARS = Number(process.env.MAX_TEXT_CHARS || 4096);
const CACHE_TTL_MS = Number(process.env.TTS_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const CACHE_MAX_ENTRIES = Number(process.env.TTS_CACHE_MAX_ENTRIES || 500);

const cache = new Map();

function clamp(n, min, max) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, x));
}

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

function parseJsonBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Access code gate — protect against unauthorized OpenAI spend
  const ACCESS_CODE = process.env.ACCESS_CODE || "";
  if (ACCESS_CODE) {
    const provided = req.headers["x-access-code"] || "";
    if (provided !== ACCESS_CODE) {
      return res.status(401).json({ error: "Invalid or missing access code" });
    }
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  const body = parseJsonBody(req) || {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return res.status(400).json({ error: `text exceeds ${MAX_TEXT_CHARS} characters` });
  }

  const requestedVoice = typeof body.voice === "string" ? body.voice : DEFAULT_VOICE_ID;
  const voice = VALID_VOICE_IDS.has(requestedVoice) ? requestedVoice : DEFAULT_VOICE_ID;
  const speed = clamp(Number(body.speed), SPEED_MIN, SPEED_MAX);

  const cacheKey = makeCacheKey(text, voice, speed);
  const cached = getCache(cacheKey);
  if (cached) {
    console.log(JSON.stringify({ event: "tts", cache: "HIT", chars: text.length, voice, ts: Date.now() }));
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("X-Cache", "HIT");
    return res.status(200).send(cached.buffer);
  }

  const payload = {
    model: "tts-1",
    input: text,
    voice: voice,
    speed: speed,
    response_format: "mp3",
  };

  const openaiRes = await fetch(OPENAI_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    console.log(JSON.stringify({ event: "tts", cache: "ERROR", chars: text.length, voice, status: openaiRes.status, ts: Date.now() }));
    return res.status(openaiRes.status).json({ error: "OpenAI request failed", detail: detail.slice(0, 800) });
  }

  const contentType = openaiRes.headers.get("content-type") || "audio/mpeg";
  const arrayBuffer = await openaiRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  setCache(cacheKey, { buffer, contentType, expiresAt: Date.now() + CACHE_TTL_MS });
  console.log(JSON.stringify({ event: "tts", cache: "MISS", chars: text.length, voice, ts: Date.now() }));
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Cache", "MISS");
  return res.status(200).send(buffer);
}
