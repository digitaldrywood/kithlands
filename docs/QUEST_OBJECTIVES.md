# Staged campaign objectives

Q01 Fetch, Q02 Delivery, and Q03 Investigation use the compact plans in
`shared/quest_objectives.json`. Each definition supplies its action sequence,
location slots, object/clue name, objective prompt, action result, and fallback
story text. `shared/quest_templates.json` identifies the matching definitions.
LLM availability has no effect on these objectives.

- Fetch: travel to the keeper, collect the keepsake, return to the giver,
  and hand over the keepsake.
- Delivery: visit the giver, collect the sealed parcel, travel to its
  destination, and deliver it to the keeper.
- Investigation: travel to the keeper, inspect the trail notes, return to the
  giver, and report the safe route.

Go fills the action locations using existing enterable nodes in the reachable
locality graph. It prefers distinct giver/destination nodes and distributes
normal quest destinations among the least-used alternatives. No NPC nodes,
world edges, combat rules, rewards, or promotion steps are added.

The server stores the objective cursor and item/clue custody inside each
quest. Custody is private to that quest, cannot be sold or dropped, and is
consumed by the final handoff. Travel consumes only a `goto` action. The
explicit `quest_action` request names the quest, expected objective index,
and node. Repeated arrival, stale requests, wrong nodes, missing custody,
and out-of-order interactions cannot grant rewards.

Ordinary locality movement still runs in the existing client renderer. The
server checks graph membership and remembers the most recent valid arrival;
it does not prove tile-level proximity. The client exposes the action only
beside the ground-floor proprietor. Entering an authored settlement or dungeon
prevents a remote ordinary-world quest interaction. Loading a save clears the
transient arrival context; the player approaches the next location again.

Saved plans and completed quests are preserved. Old unfinished Q01–Q03 quests
without objective state receive a complete plan on load. Other templates,
surprise quests, promotion, and Q12 retain their separate dispatch behavior.

The campaign simulator submits ordinary arrival and action requests. Its
`encounter-rolls-per-quest` budget remains per quest: the default eight T1
rolls are scaled by the current transport tier's shared encounter multiplier,
then split across outbound and return legs for staged objectives. An odd extra
roll belongs to the first leg. This models both journeys while preserving the
CLI's encounter-budget contract; it is not a measurement of actual walking
distance or browser encounter frequency.

The readiness campaign harness follows the same interior interactions.
`READINESS_OBJECTIVES_ONLY=1` stops after completing all three types and
checks a normal mid-quest save/load for each. It records actual movement,
encounters, objective states, and desktop/phone/default-viewport screenshots
in a unique `client/tmp/readiness/campaign-*` directory.
