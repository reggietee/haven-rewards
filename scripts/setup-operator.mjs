import { randomBytes, randomInt, scryptSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env.local")) {
  console.error(".env.local exists; keep the existing operator credentials.");
  process.exit(1);
}
const pin = Array.from({ length: 10 }, () => randomInt(10)).join("");
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(pin, salt, 64).toString("hex");
const secret = randomBytes(48).toString("hex");
writeFileSync(
  ".env.local",
  `ADMIN_PIN_HASH=${salt}:${hash}\nSESSION_SECRET=${secret}\nGOOGLE_SERVICE_ACCOUNT_EMAIL=\nGOOGLE_PRIVATE_KEY=\nGOOGLE_SHEET_ID=\nKIOSK_DEVICE_ID=\n`,
  { mode: 0o600 },
);
writeFileSync(
  "OPERATOR_ACCESS.local.txt",
  `Haven local operator PIN: ${pin}\n\nKeep this file private. Never commit or upload it. Five quick taps on the Haven logo opens the operator login. Local credentials in .env.local must be separately configured in Vercel environment variables for a deployment.\n`,
  { mode: 0o600 },
);
console.log(
  "Created private .env.local and OPERATOR_ACCESS.local.txt. No secret is included in the browser bundle.",
);
