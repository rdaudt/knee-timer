import { sql } from "@vercel/postgres";

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
  const city    = req.headers["x-vercel-ip-city"]        ?? null;
  const country = req.headers["x-vercel-ip-country"]     ?? null;
  const region  = req.headers["x-vercel-ip-region-code"] ?? null;
  const ua      = req.headers["user-agent"] || "";
  const platform = parsePlatform(ua);
  const browser  = parseBrowser(ua);

  // Skip gracefully in dev environments without a database configured
  if (!process.env.POSTGRES_URL) {
    console.log(JSON.stringify({ event: "analytics_skip", reason: "no POSTGRES_URL", type, ts: Date.now() }));
    return res.status(204).end();
  }

  try {
    await sql`
      INSERT INTO events
        (type, device_id, duration_min, prep_time_sec, speech_on, camera_on, completion_pct,
         city, region, country, platform, browser)
      VALUES
        (${type}, ${device_id},
         ${durationMin != null ? Number(durationMin) : null},
         ${prepTimeSec != null ? Number(prepTimeSec) : null},
         ${speechOn != null ? Boolean(speechOn) : null},
         ${cameraOn != null ? Boolean(cameraOn) : null},
         ${completionPct != null ? Number(completionPct) : null},
         ${city}, ${region}, ${country}, ${platform}, ${browser})
    `;
    console.log(JSON.stringify({ event: "analytics", type, country, platform, ts: Date.now() }));
  } catch (err) {
    console.error(JSON.stringify({ event: "analytics_error", type, err: String(err), ts: Date.now() }));
    // Don't return an error to the client — analytics failures are silent
  }

  return res.status(204).end();
}
