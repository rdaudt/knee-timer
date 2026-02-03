export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    provider: "huggingface",
    hasKey: Boolean(process.env.HF_API_KEY),
  });
}
