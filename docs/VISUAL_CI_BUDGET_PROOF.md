# Visual CI job budget recovery

2026-10-25 · draft PR #339 · branch `codex/battle-grounding-walk-lag`.

Hosted run `40260278853` on `927d806` completed walking, interiors, campaign and
escort successfully. Gameplay was cancelled at its 30-minute job budget, and
the protected aggregate check consequently failed. The gameplay job started
02:40:46 UTC and ended 03:11:16; its test step ran 02:42:01–03:10:59. The retained
job log reports 78 passed tests and no failed test before “operation canceled.”
All three merchant-stock cases passed immediately before the cutoff.

Saved job log: `client/tmp/bandit-prior-gameplay-ci-1793021300.log`, retrieved
from completed job `121370958248`. This is a budget failure, not evidence of an
assertion failure or proof that the unrun remainder would pass.

The existing 27 gameplay specs are divided into ten combat specs and seventeen
exploration/shop/field specs, each with an independent unchanged 30-minute
budget. Walking, interiors, campaign and escort stay separate. The new Bandit
reference is added to combat, for eleven combat specs. The protected check is
still named `walking`, needs the entire `visual-tests` matrix and succeeds only
when every suite succeeds. No retries, assertions, screenshots, checksum/data
checks or required suite were removed. General CI remains self-hosted.

Verification compared the old Git HEAD workflow to the new command inventory:
all **41 prior specs remain exactly once**, plus `bandit-guard.spec.js` for 42
in total. Proof: `client/tmp/bandit-ci-final-inventory-1793022000.json`.
The workflow parses with the installed Prettier YAML parser; formatted output
was saved outside tracked sources in
`client/tmp/bandit-workflow-parsed-1793022000.yml`. No YAML dependency was added
when a Python YAML module was unavailable. The split is not remote acceptance;
its new six-suite run and protected summary must still finish successfully.

The repository runner API still reports zero eligible runners. Organization
inventory returns HTTP 403 with the current token, so this does not establish
that no organization machines exist. No broader auth scope was requested and
no runner labels or general-CI execution environment were changed. The owner
has already chosen to keep self-hosted CI and restore an eligible runner.
