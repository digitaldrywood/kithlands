# Promotion and Options phone validation — 2026-09-04

Branch: `codex/mobile-promotion-options`; base: `9e1f392`.
Issue: none (assigned UI slice). Worktree: `/Users/corylanou/.codex/worktrees/375c/kithlands`.
API `8358`, Vite `3278`, database `kithlands_278`.

The screens use native viewport typography and controls above Phaser. Go retains
all progression and promotion decisions; preferences retain their existing values,
storage, and interpretation. WorldScene changes only delegate the promotion prompt.

## Validation

- `cd client && npm ci` — passed.
- `cd client && npm test -- --run src/scenes/options.test.js src/scenes/promotion.test.js src/systems/prefs.test.js` — 12 passed.
- `cd client && npm test` — 514 passed across 64 files.
- `cd client && npm run build` — passed; existing large-chunk warning remains.
- `cd client && npx prettier --check src/scenes/options.js src/scenes/options_settings.js src/scenes/options.test.js src/scenes/promotion.js src/scenes/promotion.test.js src/ui/viewport_dialog.js src/styles/viewport-dialog.css e2e/promotion-options.spec.js e2e/readiness-campaign.spec.js src/scenes/world.js` — passed.
- `./scripts/run_playwright_local.sh e2e/promotion-options.spec.js` — seven passed (run `1788543087775`).
- `./scripts/run_playwright_local.sh e2e/promotion-options.spec.js --grep '1440x900'` — one passed with the final canvas-bounds assertion (run `1788543280917`).
- `git diff --check` — passed.

Before every wrapper invocation, `lsof -nP -iTCP:8358 -iTCP:3278 -sTCP:LISTEN`
confirmed both derived ports were free. Browser state stayed under `client/tmp/`.
No balance or gameplay rules changed, so no simulator run was needed.

The browser suite reaches the real Go promotion quest with the existing debug
quest-warp and guardian-victory helpers, then uses the actual promotion API.
It covers four-member parties on 390×844 and 375×667, two members at 800×600,
and three at 1440×900. It verifies body/control containment, touch and keyboard,
preference persistence, repeated open/close, return to Party/game, orientation,
focus wrapping, scene shutdown, duplicate-submit protection, server/network errors,
a lost successful reply, a 12-second timeout, and unavailable class metadata.

The readiness campaign adapter changes only its promotion controls to native Claim
Promotion followed by Continue Journey. The full campaign was not replayed here;
its objective adapter belongs to the coordinating quest task.

## Visual inspection

All screenshots from both passing runs were opened and inspected. Selected proof
is retained below; `manifest.json` records the original unique paths and hashes.
The phone offer and result show all four members, benefits, and usable actions.
Small landscape uses a scrolling settings body with Back always visible.
A transient desktop return capture prompted an additional canvas-bounds wait;
the retained desktop return proof is from the passing follow-up run.

| Flow | Inspected proof |
| --- | --- |
| options-375x667 | [1788543087775-options-375x667.png](1788543087775-options-375x667.png) |
| options-390x844 | [1788543087775-options-390x844.png](1788543087775-options-390x844.png) |
| options-800x600 | [1788543087775-options-800x600.png](1788543087775-options-800x600.png) |
| promotion-375x667 | [1788543087775-promotion-375x667.png](1788543087775-promotion-375x667.png) |
| promotion-390x844 | [1788543087775-promotion-390x844.png](1788543087775-promotion-390x844.png) |
| promotion-800x600 | [1788543087775-promotion-800x600.png](1788543087775-promotion-800x600.png) |
| promotion-result-375x667 | [1788543087775-promotion-result-375x667.png](1788543087775-promotion-result-375x667.png) |
| promotion-result-800x600 | [1788543087775-promotion-result-800x600.png](1788543087775-promotion-result-800x600.png) |
| party-return-375x667 | [1788543087775-party-return-375x667.png](1788543087775-party-return-375x667.png) |
| world-return-375x667 | [1788543087775-world-return-375x667.png](1788543087775-world-return-375x667.png) |
| promotion-server-error-390x844 | [1788543087775-promotion-server-error-390x844.png](1788543087775-promotion-server-error-390x844.png) |
| promotion-recovered-390x844 | [1788543087775-promotion-recovered-390x844.png](1788543087775-promotion-recovered-390x844.png) |
| promotion-timeout-375x667 | [1788543087775-promotion-timeout-375x667.png](1788543087775-promotion-timeout-375x667.png) |
| options-landscape-667x375 | [1788543087775-options-landscape-667x375.png](1788543087775-options-landscape-667x375.png) |
| options-1440x900 | [1788543280917-options-1440x900.png](1788543280917-options-1440x900.png) |
| promotion-1440x900 | [1788543280917-promotion-1440x900.png](1788543280917-promotion-1440x900.png) |
| world-return-1440x900 | [1788543280917-world-return-1440x900.png](1788543280917-world-return-1440x900.png) |
