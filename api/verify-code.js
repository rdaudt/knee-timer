export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ACCESS_CODE = process.env.ACCESS_CODE || "";
  if (!ACCESS_CODE) {
    // No access code configured — allow anyone
    return res.status(200).json({ ok: true });
  }

  const provided = req.headers["x-access-code"] || "";
  if (provided !== ACCESS_CODE) {
    return res.status(401).json({ error: "Invalid access code" });
  }

  return res.status(200).json({ ok: true });
}
