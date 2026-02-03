import {
  CURATED_VOICES,
  DEFAULT_VOICE_ID,
  SPEED_DEFAULT,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
} from "./_config.js";

export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    defaultVoiceId: DEFAULT_VOICE_ID,
    speed: { min: SPEED_MIN, max: SPEED_MAX, step: SPEED_STEP, recommended: SPEED_DEFAULT },
    voices: CURATED_VOICES,
  });
}
