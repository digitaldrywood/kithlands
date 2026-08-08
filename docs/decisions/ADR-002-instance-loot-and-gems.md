# ADR-002: Add Instance-Based Loot and Socketed Gems

Date: 2026-08-08
Status: accepted

## Context

Kithlands currently identifies equipment only by its shared catalog ID. Two
copies of the same sword therefore have identical stats, and equipment stored
in inventory has no identity for affixes or sockets.

The requested loot loop combines three ideas:

- Diablo II-style level-qualified affixes whose values roll within authored
  ranges.
- Socketed gems with stronger grades and deterministic upgrade recipes.
- Early access to the system without allowing normal low-level drops to pull
  from endgame pools.

This deliberately expands the current v1 scope in Section 18.2, which lists
general crafting as deferred. The first slice is limited to deterministic gem
recipes rather than a general crafting language.

Reference behavior:

- https://classic.battle.net/diablo2exp/items/magic.shtml
- https://classic.battle.net/diablo2exp/items/socketeditems.shtml
- https://classic.battle.net/diablo2exp/items/gems.shtml
- https://classic.battle.net/diablo2exp/items/cube.shtml
- https://manuals.plus/m/357542e56222a95c482aab01f67af3a3f5b303e5f9c9a775a9e3c8ba19db8da4.pdf
- https://www.nngroup.com/articles/recognition-and-recall/
- https://www.nngroup.com/articles/slips/

## Decision

Keep `shared/items.json` as the base equipment catalog and add loot rules,
affixes, gems, recipes, and progression gates in `shared/loot.json`.

Persist rolled equipment instances inside the existing inventory JSONB. Each
instance records its base item ID, item level, rarity, rolled affix values, and
ordered sockets. Equipment slots retain the base catalog ID for legacy clients
and sprite composition and add an optional instance ID.

The Go server owns rolling, item identity, ownership checks, socket mutation,
recipe transactions, and resolved stats. The client receives resolved values
and sends only instance IDs and requested actions.

The client exposes socketing from both the party-level workshop and a
character's equipped gear. Selecting a gem or recipe is non-mutating: the UI
shows current and proposed equipment/character values, ingredient ownership,
and the resulting socket bonuses before a separate confirmation action.
Recommendations rank only compatible, level-eligible effects already supplied
by the authoritative server; they do not create additional game rules.

Normal monster drop tables control which base item and gem tiers can appear.
Affix eligibility is additionally constrained by item level. Authored sequence
break rewards may bypass normal acquisition gates; there is no universal base
item equip lock.

Shard-to-gem transmutation and the resulting tier-2 gems are usable at level 1 so
the starter recipe is a real choice rather than a trap. Crystal recipes and
crystal socketing remain level-gated endgame progression.

Existing static equipment and legacy saves remain valid. Additive JSON fields
avoid a database migration. A persisted loot sequence prevents item identity
from rewinding when a save reconstructs its random generator.

## Consequences

- Repeated drops of one base item can have different, stable stats.
- Starter gear, gems, and recipes can expose the system at level 1.
- Combat remains unaware of affixes and gems; it consumes resolved integers.
- Save and API payloads grow because equipment now has identity.
- The first slice supports additive stat modifiers and known recipes only.
- Linked sockets, gem growth, rerolls, sets, proc effects, and combination
  words remain additive follow-up work.
