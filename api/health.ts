import type { VercelRequest, VercelResponse } from "../server/http.js";
import { sheetsConfigured } from "../server/auth.js";
import { voiceConfigured } from "../server/winnerVoice.js";
import { emailConfigured } from "../server/winnerEmail.js";
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    configured: sheetsConfigured(),
    voiceConfigured: voiceConfigured(),
    emailConfigured: emailConfigured(),
    adminConfigured: !!(
      process.env.ADMIN_PIN_HASH && process.env.SESSION_SECRET
    ),
  });
}
