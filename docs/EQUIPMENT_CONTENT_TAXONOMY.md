# Equipment Content Taxonomy

Status: proposed content architecture; the current loadout mechanics support
this direction, while names, balance values, and final icon art remain staged
follow-up work.

This document defines a rich equipment vocabulary for Kithlands without
turning every historical weapon name into a separate mechanic. It draws on
common action-RPG and party-RPG patterns, but no names, art, values, layouts,
or proprietary content are copied from another game.

## 1. Design rules

1. **A base family must create a gameplay choice.** A cosmetic synonym is a
   flavor skin, not a new mechanical family.
2. **Instances create the hunt.** The reusable base supplies silhouette,
   category, tier curve, and allowed classes. Rarity, affixes, values, and
   sockets make two drops of the same base meaningfully different.
3. **Every number is inspectable.** The equipment screen shows base, affix,
   gem, and resolved totals plus the exact character-level delta.
4. **Restrictions reinforce class identity.** Level and class gates are
   explicit data with visible reasons, never inferred from an item name.
5. **Flavor is a skin over mechanics.** A medieval spear and a science-fiction
   shock lance can share a family and balance role while using different
   authored names and art.
6. **The taxonomy is exhaustive; production is staged.** We agree on the
   complete data shape and family vocabulary before generating the full icon
   set, then ship it in reviewed slices.

## 2. Equipment positions

The first complete loadout has twelve stable positions authored in
`shared/items.json`:

| Group | Position | Accepted mechanical category |
|---|---|---|
| Arms | Main Hand | weapon |
| Arms | Off Hand | shield, weapon, focus |
| Armor | Head | helmet |
| Armor | Shoulders | shoulders |
| Armor | Body | armor |
| Armor | Hands | gloves |
| Armor | Waist | belt |
| Armor | Legs | pants |
| Armor | Feet | boots |
| Jewelry | Amulet | amulet |
| Jewelry | Ring I | ring |
| Jewelry | Ring II | ring |

This is the launch topology, not an assumed permanent maximum. Future slots
such as a relic, medal, cloak, or earring require an explicit mechanics and UI
decision; they should not be squeezed into another position or encoded as an
affix. Two-handed items may reserve both hand positions once linked-slot rules
are authored server-side.

## 3. Weapon and implement families

### One-handed martial

| Family | Core identity | Typical trade-off |
|---|---|---|
| Sword | dependable generalist | balanced power, hit, and speed |
| Dagger | precise fast weapon | lower power; hit, crit, or initiative |
| Axe | aggressive cleaver | high power; lower hit or defense |
| Mace | armored-target breaker | stable power; armor or guard interaction |
| Hammer | heavy impact | burst and stagger; speed or hit cost |
| Club | accessible blunt weapon | modest stats; broad early availability |
| Flail | variable sweeping weapon | guard pressure; less precision |
| Sickle | mobile slashing tool | crit/status identity; lower raw power |

### Two-handed martial

| Family | Core identity | Typical trade-off |
|---|---|---|
| Greatsword | broad heavy offense | high power; occupies both hands |
| Greataxe | maximum physical burst | exceptional power; accuracy cost |
| Maul | slow crushing force | armor break/stagger; low speed |
| Spear | reach and disciplined thrusts | hit/initiative; limited defense |
| Halberd | reach plus heavy cleave | broad offense; both hands |
| Scythe | risky sweeping attacks | crit/status payoff; uneven reliability |

`Polearm` is the mechanical super-family for spear, halberd, glaive, and
setting-specific skins when those variants do not warrant distinct rules.

### Ranged and thrown

| Family | Core identity | Typical trade-off |
|---|---|---|
| Shortbow | mobile ranged weapon | speed and hit; moderate power |
| Longbow | committed ranged damage | power and reach; both hands |
| Crossbow | deliberate heavy shot | high per-hit power; slower cadence |
| Sling | simple ranged control | early access; status/crit utility |
| Javelin | hybrid thrown weapon | flexible range; limited specialization |
| Throwing blade | rapid precision ranged | crit/hit; lower raw power |

Ammo is not a routine inventory tax. A special ammunition mechanic should be
reserved for meaningful consumable effects, not required for ordinary attacks.

### Arcane and support implements

| Family | Core identity | Typical trade-off |
|---|---|---|
| Wand | one-handed spell precision | magic hit/crit; modest spell power |
| Rod or scepter | one-handed channeling | support/status bonuses; allows off hand |
| Staff | two-handed spell power | strongest casting values; no off hand |
| Tome | learned magic and support | spell breadth/defense; lower physical use |
| Orb or focus | off-hand amplification | magic defense, element, or resource bonus |
| Relic implement | class-signature catalyst | specialized effect with narrow access |

### Unarmed and brawler gear

| Family | Core identity | Typical trade-off |
|---|---|---|
| Handwrap | preserves unarmed identity | technique, hit, or evade bonuses |
| Cestus | offensive fist gear | power/crit; smaller evade benefit |
| Knuckle guard | defensive fist gear | guard/absorb; lower burst |

The Brawler must never lose its defining unarmed curve merely because the loot
screen otherwise has nothing to offer. Brawler implements require an explicit
rule such as “counts as unarmed,” authored on the base and validated by the
server.

### Off-hand defenses

| Family | Core identity | Typical trade-off |
|---|---|---|
| Buckler | light reactive defense | evade/parry; modest absorb |
| Shield | general defense | balanced absorb and resistance |
| Tower shield | maximum physical defense | high absorb; evade/speed penalty |
| Focus | magical amplification | spell stats; little physical protection |
| Tome | support and magic defense | utility/resistance; modest offense |
| Torch or charm | exploration/status utility | narrow special effect |

Dual wielding is a future linked-hand rule, not simply permission to place any
weapon in `off_hand`. It needs server-authored pair validity, comparison of the
whole hand set, and a clear damage model before broad content is produced.

## 4. Armor families

Every armor weight can provide head, shoulders, body, hands, waist, legs, and
feet pieces. Position is separate from weight so an item cannot silently fit
the wrong slot.

| Weight | Core identity | Likely users |
|---|---|---|
| Cloth | magic, resource, and resistance | Mender, Cinder |
| Light | evade, initiative, precision | Rogue, casters, Wayfarer |
| Medium | flexible protection | Rogue, Wayfarer, martial hybrids |
| Heavy | absorb, guard, physical resilience | Warrior and promotions |

Armor bases use the existing transparent stats—absorb, evade penalty, magic
defense, resistance, and explicit specials. Set bonuses are deliberately later:
they can create interesting collection goals, but only after individual pieces
remain understandable and mixed loadouts are viable.

## 5. Accessories

Launch accessories are amulets and two independently equipped rings. They are
the broadest source of cross-class build tuning:

- primary-stat specialization;
- elemental or status resistance;
- resource and recovery modifiers;
- narrow skill-family or exploration bonuses;
- unusual socket counts at higher tiers.

Relics, medals, earrings, cloaks, and charms form the future accessory pool.
Add one only when it has a distinct decision space; otherwise author it as a
flavor skin for an amulet or ring. Routine inventory charms that consume bag
space are out of scope until inventory pressure itself is a deliberate system.

## 6. Class access matrix

The current class data remains authoritative. This target matrix shows how the
expanded families can preserve each class's identity; promotions extend their
base class rather than invalidating old loot.

| Class | Primary families | Armor identity | Signature loot direction |
|---|---|---|---|
| Warrior → Knight | sword, axe, mace, hammer, heavy two-handers, shields | medium/heavy | guard, absorb, weapon mastery |
| Brawler → Champion | handwrap, cestus, knuckle guard | accessories or brawler-specific light gear | unarmed chain, crit, evade |
| Rogue → Shadow | dagger, short sword, shortbow, crossbow, thrown | light/medium | precision, initiative, status |
| Mender → Sage | staff, wand, rod, tome, support shield/focus | cloth/light | healing, magic defense, resource |
| Cinder → Pyromancer | staff, wand, dagger, orb/focus | cloth/light | spell power, crit, elemental risk |
| Wayfarer → Wanderer | broad one-hand, bow, spear, staff | light/medium | adaptability, travel, hybrid stats |

Class-specific bases should be uncommon, recognizable build anchors rather
than the majority of drops. General families keep loot useful across a party;
signature bases and affixes give each class aspirational finds.

## 7. Instance composition

An equipment instance resolves these independent layers:

1. **Base family:** slot/category, handedness, usable classes, stat profile,
   icon key, and flavor skin key.
2. **Tier:** the intended world and level band plus the base value budget.
3. **Rarity:** affix allowance and presentation, not a hidden multiplier.
4. **Affixes:** rolled, named modifiers from compatible affix families.
5. **Sockets:** zero or more authored sockets and their installed gems.
6. **Named identity:** an optional handcrafted or generated-safe name tied to
   deterministic mechanics.
7. **Special identity:** a rare transparent rule, including class-signature or
   ultimate equipment.

Recommended rarity ladder: common, uncommon, rare, epic, and legendary. The
labels may be flavor-skinned, but their affix budgets stay stable. A named item
can occur at more than one rarity; “unique” should mean a special authored rule,
not merely orange text.

Affixes belong to compatible families so rolls remain legible:

- offense: power, hit, crit, initiative;
- defense: absorb, evade, magic defense, guard;
- attributes: strength, agility, intellect, vitality;
- resources: HP, MP, recovery;
- elements: damage, resistance, status application/protection;
- utility: travel, treasure, crafting, or skill-family effects;
- class signature: narrow modifiers gated to one class or promotion.

Affix pools need minimum item tier, compatible categories, mutually exclusive
groups, value bands, and a player-facing description. The roll seed and full
resolved values persist in the save so reloading never rerolls an instance.

## 8. Sockets and transmutation

Socket count is a base/tier/rarity budget, not an arbitrary bonus. A gem can
produce category-aware effects—offense in a weapon, defense in armor, or
utility in jewelry—while the preview always resolves the exact result for the
selected item.

The workshop verb is **Transmute** rather than “Refine.” Transmutation combines
known ingredients into a new gem or catalyst and does not socket it
automatically. Socketing is a separate preview-and-confirm mutation. Recipe
discovery, ingredient sufficiency, required level, and before/after values are
all visible before confirmation.

Future recipe families may include:

- gem grade upgrades;
- gem-family conversion;
- socket catalysts;
- tightly controlled affix rerolls;
- named endgame recipes.

Removing or replacing a gem is intentionally not implied. If added, it needs a
clear cost and preview so the permanence rule never changes silently.

## 9. Content-production sequence

### Slice A — mechanics and visual gold slice

- twelve positions, placeholders, comparison, equip/unequip;
- recommendation preview and explicit application;
- one weapon, armor, accessory, and gem icon family;
- normal, selected, locked, empty, and socketed visual states.

### Slice B — family coverage

- at least one base for each chosen launch family;
- all seven armor positions across the launch armor weights;
- meaningful loot for every base class from the first town;
- one class-signature base per class;
- two distinct builds per class rather than a single obvious best list.

### Slice C — progression depth

- tier progression and flavor skins for approved bases;
- affix-family expansion with deterministic balance simulation;
- named, ultimate, and optional endgame equipment;
- production icon batches only after the manifest and gold slice pass review.

This sequence avoids generating hundreds of icons for families that are later
merged, renamed, or removed.

## 10. Research basis

Primary or first-party references reviewed on 2026-08-08:

- Blizzard's Diablo II item guides: broad weapon/armor families, normal /
  exceptional / elite base progression, class-specific bases, rarity layers,
  socket category effects, and rune-word-style recipes.
  <https://classic.battle.net/diablo2exp/items/weaponsandarmor.shtml>
- Final Fantasy XIV UI Guide: recommended-gear action, side-by-side item
  comparison, and saved gear sets.
  <https://na.finalfantasyxiv.com/uiguide/equipment/equipment-saikyo/equipment_best.html>
- Guild Wars 2 official wiki: main-hand, off-hand, and two-handed distinctions,
  profession-specific weapon access, upgrade slots, and six armor positions.
  <https://wiki.guildwars2.com/wiki/Equipment>
- Grim Dawn official guide: paper-doll slot breadth, components, crafting, and
  layered loot hunting.
  <https://www.grimdawn.com/guide/character/character-basics/>

The resulting Kithlands taxonomy is intentionally original: these references
inform general interaction and content patterns only.
