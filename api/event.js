import { createClient } from "@supabase/supabase-js";

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

function parsePlatform(ua) {
  if (/mobile/i.test(ua)) return "mobile";
  if (/tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function parseBrowser(ua) {
  // Order matters: Edge UA contains both "Edg" and "Chrome"/"Safari" tokens
  if (/edg/i.test(ua)) return "edge";
  if (/chrome|chromium|crios/i.test(ua)) return "chrome";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/safari/i.test(ua)) return "safari";
  return "other";
}

// Cached across warm serverless invocations
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const ACCESS_CODE = process.env.ACCESS_CODE || "";
  if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) {
    return res.status(401).end();
  }

  const body = parseJsonBody(req) || {};
  const { type, device_id, durationMin, prepTimeSec, speechOn, cameraOn, completionPct } = body;

  if (!type || typeof type !== "string" || !device_id || typeof device_id !== "string") {
    return res.status(400).end();
  }

  // Geo extracted server-side from Vercel edge headers (never trusted from client)
  // x-vercel-ip-city may be URL-encoded (e.g. "S%C3%A3o%20Paulo")
  const rawCity = req.headers["x-vercel-ip-city"] ?? null;
  const city    = rawCity ? decodeURIComponent(rawCity) : null;
  const country = req.headers["x-vercel-ip-country"]     ?? null;
  const region  = req.headers["x-vercel-ip-region-code"] ?? null;
  const ua      = req.headers["user-agent"] || "";
  const platform = parsePlatform(ua);
  const browser  = parseBrowser(ua);

  // Skip gracefully in dev environments without a database configured
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(JSON.stringify({ event: "analytics_skip", reason: "no SUPABASE_URL", type, ts: Date.now() }));
    return res.status(204).end();
  }

  try {
    const { error } = await getSupabase().from("events").insert({
      type,
      device_id,
      duration_min:   durationMin   != null ? Number(durationMin)   : null,
      prep_time_sec:  prepTimeSec   != null ? Number(prepTimeSec)   : null,
      speech_on:      speechOn      != null ? Boolean(speechOn)     : null,
      camera_on:      cameraOn      != null ? Boolean(cameraOn)     : null,
      completion_pct: completionPct != null ? Number(completionPct) : null,
      city, region, country, platform, browser,
    });
    if (error) throw error;
    console.log(JSON.stringify({ event: "analytics", type, country, platform, ts: Date.now() }));
  } catch (err) {
    console.error(JSON.stringify({ event: "analytics_error", type, err: String(err), ts: Date.now() }));
    // Analytics failures are silent — never return an error to the client
  }

  return res.status(204).end();
}
