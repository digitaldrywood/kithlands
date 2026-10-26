# Rolled shop comparison signs

2026-10-26 · `codex/battle-grounding-walk-lag` · draft PR #339.

Hosted visual run `40281199697` on `beec7c5` passes walking, combat, interiors,
campaign, escort, menus and crafting. Gameplay passes 46 cases and fails the
shop comparison at `shop-compare.spec.js:238`, expecting `Abs +0`. The renderer
correctly shows `Abs 0`: `formatDeltaLabel` has separate positive, negative and
neutral branches. A rolled robe can equal the currently equipped absorb value;
the browser assertion incorrectly assumed all deltas were strictly positive.
The retained job log is `client/tmp/ci-gameplay-beec7c5-1793071500.log`.

The native expectation now uses a plus sign only for positive differences, for
both Absorb and Magic Defense. It still requires the exact current/next values,
exact difference, eligible party members, purchase, resulting inventory and
working equipment picker. The product renderer and server roll generation are
unchanged. Existing unit coverage explicitly checks neutral zero/grey output.
No timeout, seed coverage or gameplay assertions were removed.

`shop-compare-ci-recovery-1793073500.log`: the real shop flow passes in 4.4s.
Screenshot inspection and the new hosted gate are recorded separately when
complete. This repairs a browser expectation, not an equipment balance issue.
