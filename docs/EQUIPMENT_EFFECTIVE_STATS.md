# Effective equipment stats

The authoritative character snapshot combines saved growth with the resolved
complete loadout. It is temporary: never save it over the character's base
attributes. Equip, unequip, instance transfer, socketing, and reload therefore
change the next snapshot without accumulating bonuses.

## Current gameplay contract

| Stat | Current effect |
| --- | --- |
| `power` | Added to physical attack from every slot. Brawlers add it to their existing bare-hand curve. |
| `str` | Added to saved STR before normal attack, abilities, or Brawler bare-hand damage are calculated. |
| `agi` | Added to saved AGI for initiative, encounter-start rolls, and evasion. It does not add accuracy. |
| `hit_pct` | Added to saved HIT before existing spell buffs; improves accuracy and grants one additional attack per 32 HIT. |
| `lck` | Added to saved LCK before the existing one critical percentage point per four Luck calculation. |
| `crit_pct` | Added directly to critical chance, capped at 100%. |
| `int` | Added to saved INT. Every effective INT point adds one percent to rolled spell damage and healing. |
| `spell_damage_pct` | Staff-only percentage added to offensive spell scaling. It does not increase healing. |
| `absorb` | Sum from every equipped slot, before existing Aegis/Protect buffs. |
| `evade_penalty` | A nonnegative base-item cost: evasion is `max(0, 2 * effective AGI - total penalty)`. Smaller is better. |
| `vit`, `magic_defense` | Equipment bonuses are inactive. They do not change HP growth, status resistance, or protection. They receive no recommendation score. |

Offensive spell output rolls the authored spell range first, then applies
`floor(roll * (100 + effective INT + staff spell-damage bonus) / 100)`.
Healing applies `floor(roll * (100 + effective INT) / 100)`, so an offensive
staff property cannot masquerade as a healing bonus. Saved HIT progression,
current/max HP and MP, promotion, and level-up growth are unchanged. Base VIT
still serves existing character growth; equipment VIT never compounds into it.

Existing physical formation rules, main-hand range, spell buffs, focus,
inspire, counter, and backstab consume the effective physical snapshot. This
repair does not introduce a separate off-hand attack, incoming enemy spell
mechanics, or Magic Defense.

## Resolution and ownership

`inventory.ResolveEffectiveStats` resolves base, affix, and socket contributions
from every authored loadout position once. Canonical slot references override
legacy mirrors. Legacy weapon, body, shield, and helmet fields remain readable;
normalization synchronizes them with canonical references. An instance referenced
in two positions cannot contribute twice to one character.

Static owned equipment retains catalog identity and quantity under the existing
inventory map: `wpn_` for weapons, `arm_` for body armor, and `eqp_` for all other
categories. Moving it out of a slot returns a copy to that map. Rolled equipment
retains its instance identity; removing it from a slot does not delete it.

All base evade penalties now use positive costs, including older heavy armor
and shields whose authored numbers previously used a negative sign. Existing
instances resolve their base from the current catalog, so no item ID change,
reroll, save migration, or permanent stat adjustment is needed. The data loader
rejects negative base costs. Future additive effects may reduce the total cost
through an explicitly authored modifier.

## Presentation

Equipment state exposes separate `base`, raw `bonuses`, and `effective` maps.
Only the effective map describes current battle attributes. Item inspection
marks inactive bonuses explicitly. The Character screen shows effective attack,
attributes, absorb, HIT, attack count, critical chance, and evasion, with base
and gear contributions.

Equipment preview runs the actual equip validation on an inventory clone and
returns current/proposed effective values, deltas, and proposed party totals
(including an instance's donor). The browser does not infer derived stats from
item numbers. Recommendation previews use the same resolver. Their weighted
goal score is a heuristic, not a predicted damage total.
