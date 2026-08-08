# ADR-003: Use Data-Driven Equipment Slots and Map-Based Loadouts

Date: 2026-08-08
Status: accepted

## Context

The first instance-loot slice stores only a weapon and body armor. Kithlands'
design already includes shields, helmets, and accessories, while the intended
loot progression also needs hands, legs, feet, amulets, repeated rings, and
class-specific gear. Adding one field per new slot would repeatedly change the
save schema, API, and client.

Diablo-style loadouts demonstrate two useful properties for Kithlands: gear
positions form a stable catalog, and some positions accept the same item
category, such as two distinct ring slots. Class eligibility is an item or
affix rule, not a property of the visual slot.

## Decision

Define the canonical loadout positions in `shared/items.json`. Each slot has a
stable ID, display name, group, order, and accepted item categories. The first
catalog contains main hand, off hand, head, shoulders, body, hands, waist,
legs, feet, amulet, Ring I, and Ring II.

Persist equipped references in a map keyed by slot ID. A reference contains
the shared base item ID and, when randomized, its save-local instance ID.
Distinct IDs represent repeated positions (`ring_1` and `ring_2`) even though
both accept the `ring` category.

Keep the existing weapon and armor fields during an additive migration. Save
normalization backfills them into `main_hand` and `body`, and current equip
operations update both representations. Combat continues consuming its
existing resolved weapon and armor values until additional categories gain
mechanics.

Item definitions remain the authority for allowed classes. The API exposes
those class IDs with item views and returns every authored loadout position,
including empty ones, so clients do not hardcode slot or eligibility rules.
Future class-specific affixes may be marked inactive for incompatible classes
without making the entire base item unusable.

## Consequences

- Boots, gloves, pants, amulets, and other categories can be added without a
  new save-field migration.
- Two rings or other repeated positions remain independently addressable.
- Existing saves, sprite composition, combat, and weapon/armor clients remain
  valid during the transition.
- Shared-data validation now rejects missing, duplicate, or structurally
  invalid slots.
- The API and save payloads grow modestly.
- This decision creates the loadout contract; it does not add twelve full loot
  pools or their balance effects to the demo cut at once.
