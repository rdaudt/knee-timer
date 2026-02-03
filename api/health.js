export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    provider: "openai",
    hasKey: Boolean(process.env.OPENAI_API_KEY),
  });
}
