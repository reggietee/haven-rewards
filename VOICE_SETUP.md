# Winner announcements

The award is already committed before voice preparation starts. The wheel and result never await voice generation. Results stay open until staff presses **Done**; there is no countdown or automatic result close.

## Server configuration

Set these **Production** Vercel environment variables, then redeploy:

- `ELEVENLABS_API_KEY`: a key restricted to text-to-speech, with a conservative account credit limit.
- `ELEVENLABS_VOICE_ID`: one licensed voice from your ElevenLabs account. Choose a warm, clear, restrained delivery and audition Haven, Niagara-on-the-Lake, Zannes and Story Mode.
- `ELEVENLABS_MODEL_ID=eleven_flash_v2_5` (also the server default).
- Optional `ELEVENLABS_ZERO_RETENTION=true` **only for an account eligible for Enterprise zero retention**. This sets `enable_logging=false`. It is never silently retried with logging enabled if rejected.

Existing `ADMIN_PIN_HASH` and `SESSION_SECRET` protect the route. Unlock booth controls online on the event iPad before testing, so it has its signed kiosk grant. `KIOSK_DEVICE_ID`, when configured, also binds voice access to that one device. No `VITE_` variables or client API keys are used. The app remains fully usable without voice credentials.

Production settings: https://vercel.com/reggies-projects-f399e2ca/haven-rewards/settings/environment-variables

The implementation uses the [official complete-speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), Flash v2.5, MP3 44.1 kHz / 128 kbps, stability 0.5, similarity 0.75, style 0, speaker boost and speed 1.05. ElevenLabs lists Flash v2.5 in its [current model documentation](https://elevenlabs.io/docs/overview/models). A complete short clip is easier to decode reliably in Safari than a streamed MP3 assembled during playback. Do not enable unsupported account features or change voice settings without an actual listening check.

## Timing and fallback

1. Existing entry and award transactions finish normally.
2. At spin start the voice controller reads the saved spin and its entrant from IndexedDB. The form and displayed prize label are never request inputs.
3. Only `{entryId, firstName, prizeId}` goes by POST to `/api/winner-voice`, with the existing signed kiosk grant. No surname, email or consent information is included. The provider receives only approved spoken text and fixed synthesis settings; it never receives the entry UUID.
4. A durable `voiceAttempts` marker is reserved before the request. There is at most one paid-generation attempt per entry from this kiosk, even after reload. Failures do not retry. This separate Dexie v2 table does not change any prize, schedule, entry, award or sync record and is not exported/synced.
5. The server request has a 5.5-second deadline; the client has a 6-second deadline. The normal wheel sequence is 6.8 seconds. The result appears on schedule regardless. Reduced motion retains voice, but its 1.1-second spin gives the provider less time.
6. At result reveal, the controller freezes its audio choice and aborts pending generation. Playback starts 500 ms after the result mounts. Late audio is discarded.
7. If no personalized audio is ready, use an explicitly local English system voice if available; if it cannot start within 350 ms, cancel it. Otherwise the caption and original effects remain. No redistributable generic voice assets are supplied, so the optional prerecorded fallback is skipped. Never select a remote browser voice or wait for voices to load during reveal.
8. Web Audio effects duck smoothly to 18% during speech and return afterward. One shared AudioContext and master mute are used for generated audio. Safari system speech cannot be routed into Web Audio; its volume mirrors the app's mute setting and muting immediately cancels it.
9. **Hear it again** uses the current decoded buffer or the local system voice, without a server request. Repeated taps cannot overlap speech. Muted playback has no replay button.
10. Done, backgrounding or unmount cancels timers, fetch and speech, releases the AudioBuffer, and clears the caption. No object URLs are created. Personalized audio is never written to IndexedDB, Sheets, CSV, service-worker caches or public files. Reload shows the saved prize without regenerating personalized audio.

## Endpoint and privacy boundaries

The endpoint accepts a strict three-field schema, 1 KB body limit, known current prize IDs, a conservative name grammar, same-origin POSTs and a signed PIN-issued kiosk grant. The server constructs speech from approved templates in `src/lib/announcements.ts`; client-supplied text, value, tier, email and prize-name fields are rejected. Names normalize to NFC, lose controls, contain only letters/marks and common name separators, and have at most 40 characters/three name components. Unsafe or sentence-like names still enter the contest; they simply receive generic speech/captions.

The authoritative entry database is on the offline kiosk, not Vercel. The server validates kiosk authorization and the approved prize ID; it cannot independently look up an offline entry. The trusted kiosk reads the actual persisted spin/entrant. Voice generation cannot call or mutate the prize engine.

Warm function instances allow six reservations per device/minute and 300 per device/day, with entry deduplication and bounded maps containing no spoken names/audio. These counters are **not shared across cold or parallel Vercel instances**. Durable kiosk attempt markers prevent normal client repeats. For protection if an authorized device token is compromised, also configure a Vercel Firewall rate limit for `POST /api/winner-voice` and an ElevenLabs key credit cap; do not treat an in-process map as distributed billing enforcement.

Responses are private/no-store, including Vercel CDN headers. Server errors are generic and never log provider bodies, names or credentials. Failures log only a fixed reason code (deadline, transport, provider status or audio format) and an optional HTTP status for operator troubleshooting. Booth controls show configuration readiness and a fixed-code, in-memory last voice status, without identity data. The separate voice privacy disclosure is on the form and in the public rules. The separately requested consent update requires the unchecked Haven.fm checkbox for new entries and versions its exact “Yes, add me…” wording. Historical consent records are preserved. Voice generation does not change consent records.

## Live-provider verification

On September 22, a fictional entrant in the deployed app’s isolated test flow received a real ElevenLabs grand-prize announcement. It arrived in approximately **1.4 seconds**, before the wheel stopped; the decoded clip was **7.85 seconds** long. The exact caption matched, replay made no extra request, mute stopped playback, and Done cleared the name and audio. One spin and one generation marker were recorded; real event inventory was untouched. No personalized recording was saved.

An initial HTTP 402 was resolved through the account’s billing configuration. If it recurs, check credits, billing and the selected voice’s API eligibility using the [provider error reference](https://elevenlabs.io/docs/eleven-api/resources/errors). The readiness badge confirms settings are present, not that a provider account is funded. After resolving a provider issue, use a **new fictional test entry**, because the app intentionally does not regenerate speech for an entry already attempted.

## Event-day checks

- Unlock controls online; confirm Winner announcements says configured.
- Use **Open test entry flow**, a fictional first name and test email. This uses separate test inventory and may incur one TTS request per new test entry.
- With sound on, confirm the name/prize are correct, pronunciation is clear, impact precedes speech and background effects remain quieter during speech.
- Replay twice, mute during replay, press Done mid-speech, and confirm no speech carries into the next guest.
- Test a second fictional entry offline and a muted entry; both should award normally. Browser local voices vary by installed iPad voice downloads. Silence plus a clear caption is an intentional fallback.
- Verify Safari and the installed PWA on the physical third-generation iPad Air, speaker volume outdoors, and Guided Access. Desktop WebKit emulation cannot establish physical iPad audio quality or autoplay reliability.
- Keep any real-credential test recordings transient. Never commit personalized recordings or logs containing names/tokens.
