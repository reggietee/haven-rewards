# Spin Your Way to Haven

Offline booth rewards PWA for Haven Workspace at NFIH Demo Day, September 22, 2026, 3–7 p.m. Eastern, 4551 Zimmerman Avenue, Niagara Falls.

**Run the real contest on only the initialized event iPad. IndexedDB on that device is the authoritative inventory. Clearing Safari/PWA site data deletes that store. Google Sheets is a backup and review destination, not a shared prize allocator. Do not move to a second kiosk or change the deployment origin after initialization.**

## Run locally

Use Node 22.12+ (22.x) and npm. This workspace includes a local Node 22 binary because the host Node 22.11 is too old for current Vite/Vitest. npm scripts automatically use the local binary when dependencies are installed.

```sh
npm ci
npm run setup:operator  # once, if .env.local is absent
npm run dev
```

`setup:operator` creates a random 10-digit PIN, a salted scrypt hash and a session signing secret. The PIN is in the **gitignored private file `OPERATOR_ACCESS.local.txt`**; server variables are in gitignored `.env.local`. Neither is bundled into the browser. Existing credentials are never overwritten. The local development and production-preview servers expose the same handlers as Vercel.

Tap the Haven logo **five times quickly** on the welcome screen. **Enter the operator PIN every time.** First authentication must be online and is validated by the server against its scrypt hash. A successful login also seals the signed, device-bound authorization with a key derived from the entered PIN (PBKDF2-SHA-256, 600,000 iterations, random salt; AES-256-GCM). For up to seven days, the same PIN can unlock controls offline by decrypting that runtime seal. Neither the PIN nor its server hash is stored on the device or bundled into the app. The signed bearer grant remains available for automatic background sync; the offline seal protects opening the operator UI. Close controls to lock the panel. Keep the physical device secured in Guided Access; local protections do not defend against an attacker with developer tools or OS access. Expired authorization requires online PIN authentication.

Test studio offers every prize/tier and a complete test entry flow. Test data uses a **separate IndexedDB database** and a simulated event time, with a persistent TEST MODE banner. Preview spins consume no units and create no entrant or prize records. The real schedule is created only by the confirmed “Initialize real event” action. The public app never initializes itself.

```sh
npm test
npm run build
npm run preview
npm run test:e2e
```

Install Playwright browsers first: `npx playwright install chromium webkit`. E2E tests use the private local operator PIN; run `npm run setup:operator` if needed. Tests use fictional identities and isolated browser contexts. They exercise the production build and service worker. Transport to Google is mocked during reconnect; the server handler separately tests a lost response after a committed write.

### Preview on another computer

Run `npm run preview -- --port 4287 --strictPort` after building, then open the printed Network URL on a device connected to the same local network. Keep this Mac awake and the preview server running. The LAN HTTP address supports visual review and server-verified operator login, including Test studio. Operator login requires a live connection on HTTP; no offline authorization seal is created. Use this unencrypted preview only on a trusted local network with fictional entry data. PWA installation, service-worker caching and offline operator unlocking require HTTPS (or localhost on this Mac). Each browser/origin has separate local storage; use the final HTTPS deployment on the event iPad for the contest.

## Revised prize configuration

The current default pool is 53 featured units worth $7,980 before HST, with hourly allocation 13/13/13/14. The one-month Niagara Passport Membership has three units and uses the grand celebration. Rules acceptance records use version `2026-09-22.1`; marketing consent text/version is unchanged.

On upgrade, an untouched, uninitialized previous default pool is updated and audited. Custom operator settings are preserved. This revision uses a new isolated test database; older test records are retained in the previous test database. **An initialized schedule is never changed or regenerated.** Devices with a pool that differs from the published rules cannot accept new entries or create new awards. Existing outcomes remain accessible and exportable. Changes to values/quantities require updating the editable configuration and public rules together before initialization. An existing 33- or 34-unit schedule needs an explicit operational resolution; do not clear site data to bypass this protection.

The home screen pairs the entry form with the real 3D wheel. One Canvas is retained from the idle hero through ready, spin, result and reset. Idle rotation takes 90 seconds per revolution, with no ticks or award calls. The active animation starts from the current idle angle and lands on the outcome already saved in IndexedDB.

**Today’s Prize Vault** uses explicit `displayTier`, `displayName`, and `displayOrder` fields in `src/config.ts`. Its Platinum/Gold/Silver/Bronze presentation is independent of the five celebration intensities (`tier`). Older stored prizes receive presentation metadata by ID while rendering; saved schedules and outcomes are never rewritten. The legacy default-upgrade comparison ignores presentation-only fields.

The home screen uses normal document scrolling: a 56% form / 44% wheel hero, then a full-width dark metallic prize gallery, followed by sponsors, legal text and the rules QR. There are no nested prize or form scroll containers. Platinum has two large headline prizes and two supporting prizes; Gold has three partner features, Silver four experiences, and Bronze two substantial features. Before the event, counts describe today’s pool; during the event they include all remaining units, including unreleased ones. Depleted types stay in place. Release times are never displayed.

Portrait stacks the form, wheel and gallery in that order. Keyboard contraction keeps every control reachable through document scrolling. Completed entrant reset returns the page to the top; browsing inactivity does not move the page. Back to spin returns focus to the first-name field. The wheel pauses outside the viewport, under controls, and when the page is hidden. Reduced motion disables idle rotation, camera drift and decorative gallery shimmer; an explicit spin still receives the shorter result animation.

## Contest operation

1. Install from the final temporary Vercel origin on the iPad using Safari → Share → Add to Home Screen. Open that installed app; Safari and installed PWA storage may differ, so do all real initialization and entry in the installed app.
2. Authenticate the operator before going offline. Verify app shell cached, IndexedDB ready, audio, available storage and accurate automatic device time.
3. Preview all tiers in test mode, then exit test mode. Verify the official rules and prize configuration match. Obtain Haven’s final legal review; the editable source is `src/rules.md` and review notes are `docs/RULES_REVIEW.md`.
4. Initialize the real event **once** on this device. It is safe to initialize before 3 p.m.; real entries/spins remain gated to `2026-09-22T15:00:00-04:00` through (excluding) `2026-09-22T19:00:00-04:00`.
5. Close controls, enable landscape orientation lock, then iPad Settings → Accessibility → Guided Access. Configure a separate Guided Access passcode and triple-click the Home button to start. Disable unwanted hardware buttons/motion, retain touch and keyboard access, and avoid a short session time limit. The app does not depend on the Fullscreen API, which varies on iPad Safari.
6. Export Entries, Consents, Spins, Inventory and Audit during the event and again at close. A failed sync never blocks a spin. Do not clear site data, uninstall the app, redeploy a different origin or update the service worker mid-event.

The “Retire and purge” control is destructive and has two typed confirmations. It requires no pending sync records. Export all five tabs first. It removes local personal entry/consent data, retires the event and retains inventory/schedule/code/audit evidence. It never provides a way to regenerate the production schedule. It does not delete any Google records or downloaded exports. Coordinate retention and deletion separately with Haven.

## Deploy to Vercel

```sh
npx vercel login
npx vercel --prod
```

Use a new `haven-demo-day-rewards` project, Vite framework, Node 22.x, build `npm run build`, output `dist`. Use only the temporary `*.vercel.app` URL; do not attach Haven’s permanent domain. `vercel.json` supplies the `/rules` rewrite and security headers. For a public rules QR, disable deployment protection on the production temporary URL (keep PIN controls protected). No third-party requests or analytics are added.

Set `ADMIN_PIN_HASH` and `SESSION_SECRET` in Vercel using the private values generated locally or independently generate production credentials. **Never use a `VITE_` prefix.** Set the Sheets service-account variables following [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md). First load the deployed PWA on the event iPad and copy its device UUID from controls into `KIOSK_DEVICE_ID`, then redeploy before initialization. This pairing is required for sync and prevents another device from sharing the fixed Sheet row namespace. PIN login remains available without Sheets credentials; entries and CSV continue locally.

The in-process PIN throttle allows five failed attempts per IP per five minutes. Add a Vercel Firewall rate-limit rule for `/api/admin` before public operation, because function instances do not share in-memory counters. Use the generated 10-digit PIN (minimum supported length is 8). `/api/sync` requires the device grant and the paired UUID. General server errors never log or return personal or exclusion data.

**Current handoff:** Vercel CLI reports that its saved authentication has expired. The build is ready; `vercel login` is required before upload. No Google credentials are configured. No deployment URL is claimed until a deployment actually succeeds.

## Architecture and data flow

React + strict TypeScript + Vite 8; React Three Fiber/Three.js; Motion; Dexie; Workbox through vite-plugin-pwa; Vercel Node functions; Google Sheets API via server-only service-account JWT. React 19.2 is intentionally used because current R3F 9.7 declares React `<19.3` compatibility. Lockfile pins the tested dependencies. Platform-specific optional native packages address npm’s missing-optional-binding issue on this Intel Mac and are skipped on other platforms.

```text
Entrant form → IndexedDB entry + consent + durable queue (one transaction)
Spin tap → IndexedDB available units → crypto selection → award + spin + code + queue (one transaction)
Committed result → predetermined wheel angle → tier reveal → 15-second UI reset
Queue → authenticated /api/sync → fixed rows in private Google Sheet
                                  ↳ private Excluded matching → restricted review cells only
```

- `src/config.ts`: editable prize, consent and event data. `src/rules.md`: editable public legal source. Original supplied references remain unchanged at repository root. The PDF logo originals are copied into `public/brand`; optimized PNG derivatives are rendered in the UI. Zannes’s white artwork was extracted from its PDF’s dark rectangle into a transparent PNG; proportions are preserved.
- `src/lib/engine.ts`: unbiased cryptographic integer sampling, shuffled 53-unit schedule, four hourly groups (13/13/13/14), immutable original schedule snapshot, mutable award/withdraw status, unique email/spin/code indexes. No `Math.random` is used for awards or schedules. Device time is the official clock; backward jumps beyond one minute block new spins for staff review. Released units carry forward until 7 p.m.
- `src/lib/db.ts`: production database `haven-demo-day-v1`; test database `haven-demo-day-test-v3`. Queue records have persistent monotonic row sequences and UUIDs. Auto-increment row sequences are never reset. No server PII or excluded list is shipped to the client.
- `src/lib/sync.ts`: startup/foreground/online/result/entry triggers, ten-second queue checks, 2-second exponential backoff capped at five minutes. A timeout or lost response preserves pending records. Batches are bounded to twelve records; endpoint limit is 200 KB. Exports escape CSV, neutralize spreadsheet formula prefixes, and preserve consent proof.
- `api/sync.ts`: exact row writes (`seq + 1`, leaving headers), UUID/device ownership checks, RAW cell values, no append race. Already-present UUIDs are acknowledged without rewriting their records. Concurrent first attempts use the same fixed row and values. Pairing and the one-device constraint are essential. Inventory and audit updates are immutable event rows, not overwrites of an original schedule.
- `src/components/Wheel.tsx`: 12 persistent prize segments (both gold grand prizes opposite each other), textured physical disk/rims, fixed pointer, seven turns with acceleration and deceleration, deterministic landing angle, synchronized Web Audio ticks. Celebration pools are bounded at 45/85/130/175/230 particles. Generated audio requires a user gesture; a visible mute preference persists. No downloaded audio licenses are needed.
- WebGL2 loss/unavailability falls back to a rendered image/CSS wheel with the same landing math. Canvas DPR caps at 1.5; frame rendering pauses when hidden. Reduced motion shortens the spin to 1.1 seconds. No post-processing stack. The grand cheer is a synthesized crowd-like swell, not a recording.
- The service worker precaches the app, lazy controls and rules, local fonts, images and icon assets. Audio and wheel art are generated locally. Updates wait; no automatic mid-event reload. Install on a current supported iPadOS and conduct the physical-device check in the event checklist. Desktop WebKit is useful coverage, not proof of actual iPad GPU/audio behavior.

No booking portal, camera, payments, prize email delivery, marketing delivery, or analytics is included. Haven manually contacts potential winners, administers the skill-testing question and completes approval within the 30-day claim window.

## Reference context

The supplied prompt resolves conflicting draft values and scope. Brand/context reference: [Haven Workspace](https://www.havenworkspace.ca/). Stack compatibility: [R3F installation](https://r3f.docs.pmnd.rs/getting-started/introduction), [Vite requirements](https://vite.dev/guide/), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js).

Browser-test tooling is pinned to Playwright 1.56.1 because the newest Playwright client failed before page creation on this macOS 14 host (`PushAPIEnabled` protocol mismatch with its frozen WebKit build). The compatible Chromium/WebKit pair is used for repeatable local coverage. The app’s production libraries remain on the supported stable versions described above.

The E2E suite uses page-initiated reloads, avoiding the separate documented [Playwright WebKit automation reload/service-worker issue](https://github.com/microsoft/playwright/issues/42273). On this host, WebKit’s `context.setOffline(true)` also rejected a minimal worker’s synthetic response while its controller and cache remained valid. WebKit offline tests therefore close the origin’s actual TCP listener, then reopen it for reconnection; Chromium uses the browser offline switch. No cached responses are mocked. The production app has no test hooks or clock overrides; only the browser test injects an event-time offset.

Font license notices are included in `public/licenses`. Consents CSV exports include the linked entrant email as well as opted-in/opted-out proof. The protected Excluded table is never part of a kiosk export. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for test results, browser-testing limits and QA screenshots.
