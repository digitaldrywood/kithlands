# Responsive locality and party setup

PR #339, branch `codex/battle-grounding-walk-lag`. This slice replaces scaled
canvas controls on the normal location-search and party-creation paths, plus
the manual people/place/building forms, with the existing viewport dialog.
Go still owns locality creation, validation and game state. No backend, shared
content, saves, services or player account were changed for this work.

## Behavior

- Native labelled 16px inputs, 46px controls, real checkbox/range and class
  selectors; canonical class portraits follow selection.
- Desktop and phone layouts share readable text. Party details scroll while
  heading, status, Cancel and Create stay available. Creation progress and
  retry errors are in the fixed header, not below a potentially long list.
- Tab/Shift+Tab stays inside the current dialog; native Enter activates buttons;
  Enter submits location/manual forms; class arrows/Home/End work without
  opening a browser select popup. Existing visible Alt shortcuts and Esc badges
  come from the shared menu keyboard implementation.
- Party cancellation preserves edited names/classes. The first blank name still
  defaults to Hero; other blank names still omit optional companions.
- Every party field, class selector and action locks while creation is pending.
  Retry restores fields without losing edits. A scene/session token rejects late
  create responses after shutdown, matching the existing location-search guard.
- Scene-owned disposal restores input and removes the old dialog before World.
  Removed obsolete canvas spinner, error, input and party-row code. The debug
  bridge reads the actual rendered controls/status rather than fabricated labels.

## Local validation

Existing isolated Vite 3610 / Go 8689 / PostgreSQL services were reused. The
owner's Vite 3609 and saved game remained available (HTTP 200 before validation).
The normal wrapper stops services, so its equivalent Playwright invocation used
already-running isolated services, local browser installation and profiles:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
VITE_PORT=3610 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
  HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
  XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
  npx playwright test --config=e2e/playwright.config.js \
  e2e/wizard-responsive.spec.js e2e/wizard-back.spec.js \
  e2e/wizard-start.spec.js \
  --output tmp/wizard-status-final-1793081200 \
  > tmp/wizard-status-final-1793081200.log 2>&1
```

Coverage: 1440x900, 800x600, 390x844 and 375x667; readable native dimensions and
horizontal containment; every manual form; native mouse/touch creation; Tab and
class arrow selection; edited party retention; disabled pending controls;
creation error/retry; real Go World handoff with exact submitted party; pending
geocode/preview Back and reopening; search errors; OSM straight-to-party flow;
late successful creation after forced scene shutdown. The last is an explicitly
labelled lifecycle fault injection, not a player cancellation while creating.

OSM discovery is deterministic routed data, as in the established setup-flow
tests. Creation still uses the real Go endpoint with its manual-locality path;
this is not live Overpass reliability proof. Four new real manual creations use
fresh test accounts, not the owner's account. No reward grants or game saves
were reset.

Client gates:

```sh
cd client
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

838 client tests passed in `client/tmp/wizard-final-unit-1793081000.log`.
Build/format passed in corresponding `wizard-final-{build,format}-1793081000.log`.
Final status placement also passed build/format in
`client/tmp/wizard-status-{build,format}-1793081300.log`.
No Go/shared mechanics changed; no new balance simulation was required.

## Evidence and limits

Final native gate: **15 passed (31.0s)** in
`client/tmp/wizard-status-final-1793081200.log`.
Inspected all **54 final captures**, indexed in
`client/tmp/wizard-review-1793081500.json` (nine reviewed contact sheets).
Primary capture directories:

- `client/tmp/wizard-responsive-1793000342859/`: four viewport setups,
  fixed-header progress/errors, party scroll positions, World and stale-result
  lifecycle proof.
- `client/tmp/wizard-back-1793000330322/`: first-step Back, search-in-flight,
  party cancellation and Title return.
- `client/tmp/wizard-status-final-1793081200/`: existing OSM setup-flow captures.

Also inspected the full-resolution `short-phone-retry.png`; the complete error,
leader/companion controls and both footer actions fit the 375x667 viewport.


The first 15-case run passed, but visual review exposed offscreen progress/error
status in shorter party layouts. Those captures remain retained under
`client/tmp/wizard-responsive-1793000259344/`; they are superseded, not accepted
as final proof. Status moved to the fixed header and the test now requires
progress/error text to be inside the viewport.

The new responsive spec and capture directory are added to the existing hosted
menu visual gate without reducing any prior cases. General CI remains
self-hosted, per the owner's decision. Fresh head CI is still required.

Rare empty-map POI selection and legacy map-preview/confirmation screens still
use their previous canvas implementation; they are outside this accepted slice.
Ordinary defeat, secondary equipment metadata, remaining icons/environment work,
battle choreography and human first-visit engagement remain open in the tracker.
