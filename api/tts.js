import crypto from "node:crypto";
import {
  DEFAULT_VOICE_ID,
  SPEED_MAX,
  SPEED_MIN,
} from "./_config.js";

const HF_TTS_URL =
  process.env.HF_TTS_URL || "https://router.huggingface.co/hf-inference/models/hexgrad/Kokoro-82M";
const MAX_TEXT_CHARS = Number(process.env.HF_MAX_TEXT_CHARS || 800);
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

  const HF_API_KEY = process.env.HF_API_KEY || "";
  if (!HF_API_KEY) {
    return res.status(500).json({ error: "HF_API_KEY is not set" });
  }

  const body = parseJsonBody(req) || {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return res.status(400).json({ error: `text exceeds ${MAX_TEXT_CHARS} characters` });
  }

  const voice = typeof body.voice === "string" ? body.voice : DEFAULT_VOICE_ID;
  const speed = clamp(Number(body.speed), SPEED_MIN, SPEED_MAX);

  const cacheKey = makeCacheKey(text, voice, speed);
  const cached = getCache(cacheKey);
  if (cached) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("X-Cache", "HIT");
    return res.status(200).send(cached.buffer);
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
    return res.status(hfRes.status).json({ error: "HF request failed", detail: detail.slice(0, 800) });
  }

  const contentType = hfRes.headers.get("content-type") || "audio/wav";
  const arrayBuffer = await hfRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  setCache(cacheKey, { buffer, contentType, expiresAt: Date.now() + CACHE_TTL_MS });
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Cache", "MISS");
  return res.status(200).send(buffer);
}
