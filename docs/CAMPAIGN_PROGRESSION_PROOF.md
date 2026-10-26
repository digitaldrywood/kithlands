# Natural campaign progression and reward feedback

## Behavior

A normal fresh party can earn its first levels through campaign quests. Native
fetch and delivery runs completed the actual collect/return and pickup/handoff
steps. Current authored rewards are 180 XP per living member and 30 gold; these
runs advanced the party from level one to level three. This change does not
alter rewards, leveling rules, quest conditions, or saves.

Previously the World-only completion message disappeared when entering the
destination interior. A temporary corner receipt now survives that transition
and reports the completed quest, its reward, and actual authoritative level
increases. It holds for eight seconds, fades over 400 ms, and supports keyboard
dismissal without confirming the NPC beneath it. It does not steal focus or
block movement. Reduced motion removes the fade transition. Returning to Title
clears the receipt; loading a completed quest does not announce it again.

## Validation

From the worktree root, using the existing local API and isolated browser state:

```sh
source scripts/worktree-env.sh
source .envrc.local
cd client
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js \
  e2e/campaign-first-level.spec.js --output=tmp/campaign-receipt-final-1792970000
npm test
npm run build
npx prettier --check --ignore-path .gitignore .
```

- Before: `client/tmp/campaign-receipt-before-1792969300.log` fails because
  `Quest reward` is absent after legitimate fetch completion.
- After: `client/tmp/campaign-receipt-after-1792969700.log`: two passes, desktop
  and phone, both completing fetch objectives with the new receipt.
- Final: `client/tmp/campaign-receipt-final-1792970000.log`: two passes in 2.1
  minutes. Desktop tests automatic expiry and save/exit/load equality for levels,
  XP, gold and completed quest; phone completes a delivery, holds the receipt,
  and dismisses with Enter without another server action.
- Pure comparison tests cover actual changes, replay/load/error rejection,
  cross-adventure/member identity guards, and rewards without a level increase.
- Final client gate: 795 tests across 94 files, production build and Prettier.

Final proof directory: `client/tmp/campaign-first-level-1792962510551/`.
All 20 screenshots were inspected in a contact sheet, with desktop and phone
receipts also inspected at full size. Key captures:

- `1440-05-reward-held.png`
- `1440-06-reward-expired.png`
- `1440-07-leveled-party-reloaded.png`
- `390-10-reward-held.png`
- `390-11-keyboard-dismissed.png`

Per-viewport milestone states, request logs and empty page-error logs accompany
the screenshots. Playwright also retains video in its output directory. The
route uses native walking, conversations and ordinary battle commands. It does
not grant items/XP, teleport, suppress random encounters, or directly submit
combat rounds. Phone coverage here uses keyboard/pointer input, not touch-only
travel. CI includes the spec and retains its screenshots/state artifacts.

## Remaining gameplay defects and limits

The initial native Q04 Bandit Clearing run revealed that the legacy handler
completes it on arrival without a quest fight. Ordinary travel encounters do
not satisfy the promised encounter. Q05 Lost Person likewise uses legacy
arrival completion; the final desktop test exercised that existing behavior.
The receipt change did not repair either condition. Q04 has since been repaired
with a separate authored fight and return/report; see `TRAIL_QUEST_COMBAT_PROOF.md`.
Q05 remains open for server-owned escort, recovery, replay and persistence acceptance.

Automated routes know destinations. Their elapsed seconds are not evidence of
unassisted human pacing or a fifteen-minute integrated route. The jump from
level one to three also needs a reward-curve review in that larger playtest.
Natural leveling is available; its timing and integration remain unfinished.

## Delayed-frame input follow-up

[NORMAL_ROUTE_INPUT_PROOF.md](NORMAL_ROUTE_INPUT_PROOF.md) records the subsequent
hosted phone movement wait, its deterministic native-input reproduction and
helper fix. All three standard campaign cases pass again, including natural
level-up, real phone defeat/retry, reward handling and save continuity. Original
campaign evidence and human-pacing limitations above remain unchanged.
