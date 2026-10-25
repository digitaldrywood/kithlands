# Bandit Clearing requires combat and a report

## Defect and resulting behavior

Q04 advertised `goto → kill → goto → report`, but its legacy arrival handler
paid the entire quest reward on entering the destination. The earlier native
audit recorded this in `CAMPAIGN_PROGRESSION_PROOF.md`; ordinary travel fights
were unrelated to the promised quest encounter.

Q04 now uses the existing staged objective contract. Shared data defines a
Bandit encounter on the trail approach, with a Goblin companion for the full
four-member party. The entrance action says **Clear the blocked trail** before
the player commits. Combat runs through the normal server resolver and battle
UI. Its identity is distinct from random encounters. Only its victory records
the cleared trail; the quest reward still requires returning to the giver and
reporting. Ordinary shop access resumes after the approach is cleared.

Fleeing leaves the encounter unresolved. Defeat restores the party to safety
without paying the quest reward. Either outcome can be saved and retried;
visiting shops or other buildings while preparing does not force the fight.
Mid-combat saves are rejected, as with dungeon/finale encounters, rather than
serializing a partial battle. A pre-combat checkpoint is saved by the normal
World entrance flow. Pending victory reports persist through save/load. A server-authored recovery
marker prevents the battle renderer from treating a recovered defeat as victory.
The client regression fails before that handoff fix and passes afterward.
Completed legacy quests stay completed; unfinished legacy Q04 quests receive
the staged plan without changing their rewards or campaign order.

## Server checks

```sh
cd server
go test ./api ./internal/generator ./internal/gamedata \
  -run 'TestTrailQuest|TestTravelVictory|TestQuestObjectives|TestPrepareObjectives' -count=1
go test -race ./api ./internal/generator ./internal/gamedata \
  -run 'TestTrailQuest|TestTravelVictory|TestQuestObjectives|TestQuestVisit|TestPrepareObjectives' -count=1
go test ./api -run TestTrailQuestFreshPartyBalance -count=1 -v
go vet ./...
go build ./...
golangci-lint run ./...
cd ..
make test
make validate-data
make balance-sim
```

Tests cover remote arrival rejection, arrival without payout, client kill-claim
rejection, unrelated-victory isolation, actual victory resolution, pending-report
save/load, custody-required reporting, reward replay, flee/defeat recovery,
ordinary travel before retry, and completed-save migration.

The deterministic combat sample uses normal fresh parties and their actual
starting kit. Both two- and four-member parties win 50/50 trials using available
spells/healing and, for the two-member party without Cure, its starting potions.
The earlier basic-attack-heavy two-member policy won 39/50; that is evidence that
preparation matters, not a guarantee of victory for arbitrary play. No monster
stats, general combat rules, XP curve or quest reward were weakened to pass.

Logs are under `client/tmp/q04-*179297*.log`. Final client validation runs
`npm test`, `npm run build`, and full Prettier: 797 tests across 94 files.

## Native route verification

The campaign spec now selects ordinary campaign seed 6 at 1440×900 and 390×844
to ensure Q04 is exercised, plus seed 4 at 800×900 for a parcel handoff regression.
Selecting RNG changes no starting resources, levels or rules. The route uses
native walking, entrance controls, normal battle choices, keeper conversations,
and Save and exit/Continue. Random encounters remain enabled. There are no
debug grants, teleports, direct combat submissions or browser save state.

```sh
source scripts/worktree-env.sh
source .envrc.local
# Final proof used the separately managed API 8690 and Vite 3610.
export VITE_PORT=3610 API_PORT=8690
cd client
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" \
HOME="$PWD/tmp/home" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" \
XDG_CACHE_HOME="$PWD/tmp/xdg-cache" \
npx playwright test --config=e2e/playwright.config.js \
  e2e/campaign-first-level.spec.js --output=tmp/q04-native-final-1792973400
```

The first three native cases passed before the final checkpoint assertions were
added: `client/tmp/q04-native-1792972400.log`. Pre-recovery run: `client/tmp/q04-native-final-1792973400.log`, three passes in
3.7 minutes. Final run including real defeat and retry:
`client/tmp/q04-native-recovery-1792974300.log`, three passes in 9.3 minutes.
All 38 final captures in
`client/tmp/campaign-first-level-1792964010621/` were inspected in a contact
sheet. Fight/approach and pending-report reload captures were also inspected
at full size:

- `1440-03-trail-quest-fight.png`
- `1440-05-pending-report-reloaded.png`
- `390-02-trail-approach.png`
- `390-03-trail-quest-fight.png`
- `390-04-quest-defeat-recovered.png`
- `390-05-quest-retry.png`
- `390-12-reward-held.png`

Milestone JSON, API request logs, empty page-error logs, screenshots and retained
Playwright video accompany the proof. Assertions require a real fight at step
one, an incomplete quest and server-held report at step two, successful
pending-report save/load on desktop, normal return/report, awarded levels,
receipt hold/expiry/dismissal, and final save/load equality. The phone route deliberately uses Defend until
the actual enemies win, then verifies full recovery, no quest payout, a retry,
victory and report. No HP fixture is used. CI runs this longer route in its own
campaign matrix job so it has an independent budget and retains its evidence.

## Limits

Q05 Lost Person still has legacy arrival completion and requires proper escort
mechanics. This change does not claim to fix it. These phone routes use mixed
keyboard/pointer input, not touch-only travel. The phone recovery screenshot exposed an existing exploration notice overlapping
the interaction prompt. That layout has since been repaired; see
`EXPLORATION_NOTICE_PROOF.md`. Broader
integrated retreat/defeat acceptance stays tracked in `PLAYABILITY_TRACKER.md`. Automated route time is not human pacing evidence.
