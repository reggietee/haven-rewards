# Home wheel and full-width Prize Vault

The opening landscape hero uses approximately 56% of its usable width for the form and 44% for the real wheel. The complete thirteen-type gallery begins immediately below the hero. All scrolling belongs to the document; sponsors, legal copy and the rules QR form the natural footer.

## Changed files

- `src/App.tsx`: persistent wheel scene, home/active presentation transition, gallery below the hero, scroll affordance, document reset on entrant completion/inactivity, natural focused-field handling when the visual viewport changes.
- `src/components/Wheel.tsx`: silent 90-second attract rotation, viewport/visibility/operator-overlay suspension, static reduced-motion mode, preservation of the idle angle into active animation, WebGL fallback handling.
- `src/lib/wheelMath.ts`: constant idle advance and recorded-result landing from any initial angle.
- `src/components/PrizeVault.tsx`: full-width editorial tier chapters, two large Platinum features plus supporting prizes, three Gold partner features, four Silver experiences and two Bronze features. All quantities, values, sponsor associations and depleted states remain data driven.
- `src/styles.css`: navy hero, dark metallic gallery surfaces, tier emblems, restrained Gold light movement, responsive grids and natural footer; removes the nested vault/keyboard panel styling.
- `tests/wheel.test.ts`: exact 90-second period and every recorded sector from arbitrary idle angles.
- `tests/e2e/vault.spec.ts`: hero/gallery layout, catalogue integrity, native scrolling, idle timing/silence, offscreen/hidden pause, reduced motion, keyboard-sized viewport, inactivity, live/depleted counts, one-canvas award/reset and portrait flow.
- `tests/e2e/kiosk.spec.ts`: updated home/fallback expectations; preserves the offline, consent, duplicate, sync, CSV, celebration and reset scenarios.
- `README.md`, `.impeccable.md`, `docs/VERIFICATION.md`, this report and the screenshots below: documentation and visual evidence.

Prize configuration, rules, consent wording, award engine, IndexedDB schema and synchronization implementation are unchanged by this revision. Existing `displayTier` fields remain separate from celebration intensity. Both Grand prizes retain their largest celebration.

## Verification scope

At 1112 × 834, the entry action is above the fold, no prize cards sit alongside it, and the wheel is non-interactive. The gallery starts at the bottom of the hero. Every card, sponsor and the rules QR is reachable with native document scrolling; no nested vertical scroll regions or horizontal overflow remain. Depleted types stay in their original order with `0 remaining`. Before the event, finite counts describe today's pool; release times never appear.

Portrait at 834 × 1112 stacks form, wheel and gallery. A constrained 1112 × 500 viewport keeps fields, consent and the primary action reachable by scrolling. Written tier names and distinct emblems stay legible in grayscale. Haven's dark mark has a light backing; the white Zannes and Story Mode artwork sits on dark surfaces. The idle scene pauses offscreen and when hidden, and reduced motion stops both idle rotation and decorative shimmer. The saved result determines the final angle, including after a nonzero idle position.

Production build and strict TypeScript pass. All 29 Vitest tests pass, including the 250-spin simulation (34 finite awards, 216 fallback passes, no over-awards). The final focused browser runs pass all 10 home/gallery cases and all 12 existing kiosk cases across Chromium and WebKit. Full results are recorded in [VERIFICATION.md](VERIFICATION.md). Browser keyboard checks simulate viewport contraction; physical iPad keyboard, GPU, Guided Access and outdoor/audio checks remain on the event-day hardware checklist.

## Visual evidence

- [Landscape hero](qa/home-wheel-landscape.png)
- [Platinum](qa/gallery-platinum.png), [Gold](qa/gallery-gold.png), [Silver](qa/gallery-silver.png), [Bronze and footer](qa/gallery-bronze.png)
- [Grayscale](qa/gallery-grayscale.png), [depleted card styling fixture](qa/gallery-depleted.png) (visual fixture; real award persistence is verified separately in the browser tests)
- [Portrait entry and wheel](qa/home-wheel-portrait.png), [portrait gallery](qa/gallery-portrait.png)
- [Constrained keyboard-height viewport](qa/home-wheel-keyboard.png)

Earlier `vault-*.png` screenshots in the QA directory document the superseded nested-panel design.
