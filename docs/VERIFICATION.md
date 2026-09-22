# Verification record — September 22, 2026

## Winner voice, manual result close and required consent revision

- Strict TypeScript and production/PWA build pass; **55 Vitest tests pass** across nine files, including the 250-spin simulation.
- Approved speech templates cover all 12 current prizes. Tests cover persisted first-name/prize lookup; accented, hyphenated and apostrophe names; rejected arbitrary text/extra fields; no email/metadata in provider requests; auth, origin, size and rate limits; timeout/malformed/missing-provider responses; at-most-once generation markers; replay, mute, ducking and cancellation.
- The result remains open beyond the former 15-second timeout and clears caption, decoded audio, form values and prize code only on manual Done.
- New Haven.fm consent is required, separate and unchecked by default. The removed heading is absent; exact “Yes, add me…” proof is versioned. Engine and browser tests reject an unchecked new entry without storing it. Historical false choices and prior wording remain intact.
- Visually inspected the form and spoken result in Chromium/WebKit at 1112 × 834, with portrait and constrained-height coverage. The longest grand-prize caption, replay and Done fit the landscape viewport; Done ends at about 805 px even with the test banner. See [updated home](qa/voice-consent-home.png) and [WebKit spoken result](qa/voice-webkit-result.png).
- Personalized audio is memory-only and excluded from service-worker caching, IndexedDB, Sheets and exports. A production-bundle scan finds no local server credentials or provider-key header.

Live provider/deployment evidence follows once verified. Physical iPad speaker quality and installed-PWA audio behavior still require the event-day device check.

## Existing inventory and kiosk coverage

- Production build and strict TypeScript: pass.
- Vitest: **55 tests pass** across engine, server synchronization, CSV, wheel math and offline operator authorization.
- Default prize pool: **53 unique finite units**, **13/13/13/14** hourly windows, **$7,980 CAD before HST**.
- Simulation: **250 spins**, **53 featured awards + 197 fallback passes**, no repeated unit, code or outcome; every configured finite quantity respected.
- Playwright: **22 test cases covered** across Chromium and WebKit at **1112 × 834** landscape; **834 × 1112** portrait fallback also exercised.
- Both engines: initialized and cached online, verified unchecked marketing consent blocks entry, then entered/spun offline with explicit consent, reloaded the recorded result without re-awarding, cleared personal UI state, unlocked controls offline using the PIN, entered a second guest with explicit consent, verified the result stays open beyond 15 seconds and clears personal UI state only after manual Done, blocked normalized duplicate email, reloaded persisted inventory, reconnected and drained an idempotent mocked sync queue, and downloaded all five CSV types. Consents export preserves choice, identity linkage, email and exact proof; historical opt-outs remain untouched.
- All five celebration tiers previewed without real entries or inventory consumption. Full-motion grand sequence, the official Haven logo reveal and mute control checked in both engines. Sponsor-specific results checked visually.
- LAN HTTP PIN access is verified online against the server; an offline seal is created only where Web Crypto is available. Wrong PIN and disconnected HTTP retries cannot unlock controls. The rules page loaded offline, includes every required prize and condition, and contains no visible drafting markers. QR destination is the current origin plus `/rules`.
- Dependency audit: **zero reported vulnerabilities**. Production secret scan: **pass** (neither private local PIN nor server secret values occur in built JS/CSS/HTML/JSON).

The revised home hero fits 1112 × 834 with a 56% form / 44% wheel composition and the primary action above the fold. One wheel Canvas persists through ready, spin, result and reset. A silent, constant idle rotation takes 90 seconds; the pointer stays fixed and idle never selects or records a result. Unit tests check every recorded sector from arbitrary initial angles. Browser tests measure the idle rate, verify zero audio starts and zero recorded spins, and check viewport/visibility suspension and stationary reduced motion. The real award is committed before active animation starts.

The full-width gallery begins below the hero and includes 12 prize types, explicit Platinum/Gold/Silver/Bronze chapters, correct names/values/counts/sponsors and two Grand badges. No nested scrolling remains. Every card and the natural footer/QR is reachable; no horizontal overflow was detected. Counts include concealed future units. An actual award in an isolated fixture changes the total to 52 remaining and leaves the depleted card in place with `0 remaining`; the same Canvas survives entry, award and reset. Entrant reset returns the document to the top; browsing inactivity leaves the scroll position unchanged.

Portrait (834 × 1112) stacks form, wheel and gallery with entry above the fold. At 1112 × 500, document scrolling keeps fields, both consent controls and the primary action reachable. The focused-field resize handling does not introduce a panel or sticky overlay. Platinum, Gold, Silver, Bronze, grayscale, sponsor backings and both orientations were visually inspected. Portrait wheel centering and the reduced-motion specificity of the Gold shimmer rule were corrected during QA. Rules version is 2026-09-22.3. New consent uses version 2026-09-22.1 with the required “Yes, add me…” wording. Historical proof and initialized schedules are unchanged. Canvas DPR remains capped at 1.5; no post-processing stack was added.

Screenshots in [qa](qa/) show the welcome screen, ordinary result, grand reveal, Story Mode/NFIH results, controls and portrait fallback. These contain fictional test entrants only. Traces and HTML test reports remain gitignored because authentication/network traces can contain the private local test PIN or runtime authorization.

## Scope of evidence

Google transport is mocked in browser tests. Server tests independently simulate a successful Google write with a lost response, repeat UUID acknowledgements and row ownership conflicts, and verify restricted matching is never returned to the client. A live Google integration check requires the service account, paired kiosk UUID and private Sheet setup.

Chromium uses Playwright's offline switch. On this macOS 14 host, WebKit's switch rejected even a minimal service worker's hard-coded synthetic response. WebKit tests instead close and reopen the actual test-origin TCP listener; cached resources are not mocked. This verifies offline navigation and storage without that automation defect. PIN authentication and the application code are real in both engines. Only the event clock and Google transport are controlled by the tests.

The revised suite contains 12 existing kiosk cases plus 10 home/gallery cases across Chromium and WebKit. The final home/gallery run passed all 10 cases. The final kiosk regression run passed all 12 cases. Together, all 22 browser cases pass against the final build. See [Home wheel and Prize Vault QA](PRIZE_VAULT_QA.md) for changed files and current screenshots.

Desktop browser QA does not measure the actual iPad GPU, tent brightness, physical keyboard behavior or speaker sound. The final hardware/Guided Access check is in [EVENT_DAY_CHECKLIST.md](../EVENT_DAY_CHECKLIST.md).

Production is deployed at https://haven-rewards.vercel.app. Server PIN authentication is configured. Google Sheets remains local-only until the service-account settings and private Sheet are supplied. No permanent Haven domain was touched. Public rules source is a draft requiring Haven’s final legal review.

Header/value follow-up: the header Haven mark renders white with no backing; the current 3-month membership value is $500 and the finite pool total is $7,980. Rules version is 2026-09-22.1. Untouched uninitialized $507 defaults upgrade with an audit record; initialized snapshots and operator-customized configurations are preserved. Build and 32 unit tests pass.

Catalogue revision: 12 prize types / 53 finite units / $7,980 total. Boardroom removed; quantities and NOTL names updated. Both Grand wheel sectors are gold and exactly opposite. Recorded Passport landing is checked at the new sector in both browsers. The home scroll position stays unchanged after 60 seconds of inactivity; entrant completion still resets to the top. Untouched uninitialized defaults migrate once with an audit record. Initialized schedules and custom pools remain unchanged and are blocked from new awards if they conflict with the current rules.

Final catalogue browser run: 21 cases passed; the last WebKit portrait case was interrupted by host ENOSPC while writing its screenshot. After removing disposable Haven test/conversion artifacts, that case passed on its own (6.4 seconds), completing all 22 cases. This was a host-storage failure, not an app assertion failure.
