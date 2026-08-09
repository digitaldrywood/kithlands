# ADR-004: Separate Equipment Mutation Kinds from Slot Categories

Date: 2026-08-08
Status: accepted

## Context

Expanded loadouts need specific categories such as boots, gloves, helmets,
amulets, and rings. Affix and gem rules should not have to repeat the same
effect for every individual slot category, and an item's slot category must
not be inferred from its combat stat.

The current loot instance uses `kind` for both concerns because the first
slice only supports weapons and body armor. That becomes ambiguous as soon as
boots are armor-like loot but belong in the feet slot, or rings share an
accessory mutation pool but can occupy either ring position.

## Decision

Give every rollable equipment base two authored classifications:

- `kind` selects the affix and gem mutation family (`weapon`, `armor`, or
  `accessory`).
- `category` selects compatible loadout positions (`weapon`, `armor`,
  `shield`, `helmet`, `boots`, `ring`, and so on).

Normalize the existing weapon, armor, shield, and helmet catalogs behind one
server-side `EquipmentBase` lookup. Additional categories live in the generic
`gear` catalog in `shared/items.json` and expose authored base stats, class
eligibility, tier, and required level.

Equip operations name the party member and authored loadout slot. The server
validates ownership, class, level, and category compatibility, moves an
already-equipped instance atomically, and leaves displaced or unequipped
instances owned in inventory. Legacy weapon/body equip calls remain valid.

Resolved item stats are stored as a named stat map while retaining the legacy
`power` and `absorb` projections. Socketing mutates the saved item instance;
the resulting stats are resolved from its base, affixes, and socketed gems.

Battle sprite composition and battle-screen equipment presentation do not
consume the expanded loadout in this phase. They remain a later visual design
decision.

## Consequences

- One armor gem rule works for body armor, helmets, shields, and future armor
  categories without weakening slot validation.
- Accessories can have their own affixes and gem effects while rings remain
  independently equipable.
- Class-specific equipment and required levels are enforced before mutation.
- Saves preserve the category and socket mutations of every rolled instance.
- The API can expose expanded inventory and loadout mechanics before a final
  equipment-screen or battle presentation is chosen.
