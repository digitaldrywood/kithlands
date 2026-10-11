# A fifteen-minute Kithlands playtest

Start with **Quick start** from the title screen. The default Cadott party is
Warrior, Cinder, Rogue and Mender. This route samples the current normal game;
it does not use the disposable developer showcase or grant extra levels/items.
Times are a suggested budget, not a guarantee of first-visit completion.

| Time | What to do | What to notice |
| --- | --- | --- |
| 0–2 min | Open Objective, then Quest journal. Read the campaign objective and track The Old Mill under Local stories. | One journal contains both campaign progress and the mill. Tracking a story changes the field objective; entering it shows its current step. |
| 2–4 min | Walk along the story routes and gather two herb patches and two ember iron outcrops when the Gather prompt appears. Open Menu → Crafting; brew a potion, refine Ember Shards and forge an Iron Sword. | Each herb patch gives three herbs; each outcrop gives four ore. Costs and outputs are shown before crafting. Resources remain depleted after saving/loading. |
| 4–9 min | Open Character, select the Warrior's weapon slot and equip the crafted Iron Sword. Use Gems → Transmute to make an Ember Gem from three shards, then Socket it into the sword. Take Old Mill trail and fight the bats; use your brewed potion when someone is hurt. | The sword has 12 base Power and one gem socket; the Ember Gem adds 3 Power. Try Warrior Attack, Cinder Spark, Rogue Attack/Steal and Mender healing. Inspect Party after wins to see XP toward the next level. |
| 9–12 min | Save, return to the world, then enter a settlement and visit its shop. Buy an affordable weapon/armor upgrade or supplies. Compare stats and equip the purchase. | The same party and inventory carry between the mill, world and town. Keep some gold for consumables; new games start with 100 gold. |
| 12–14 min | At a spell merchant, open Spells and pick a spell your caster can learn. Choose the eligible party member. If that town's shop does not offer a useful spell, spend this time on another battle instead. | Spell purchases teach that character directly. Class, level and already-known checks affect eligibility; stock depends on the generated shop. The tested Heal purchase cost 200 gold, so a fresh 100-gold character needs to earn more first. |
| 14–15 min | Open the same journal again, inspect your retained mill notes, check the campaign objective, and save. | Returning from a local story preserves discoveries and rewards. The next visit resumes the same story. |

Level-up timing depends on the encounters and party; the route gives real XP,
not an artificial guaranteed level at a particular minute. The mill is a longer
story with twelve locations. A fifteen-minute first visit need not finish its
puzzles or boss. Completing it awards 80 gold and its authored keepsake reward.

Crafting now includes **potions, gem shards and one Iron Sword recipe**, plus
existing gem transmutation and socketing. This is a small field-crafting loop;
there is no profession leveling tree or broad weapon/armor recipe catalog.
Buy or loot other equipment, then customize it. Spell shopping may require a
different settlement or more levels/gold. The gathering → crafting → equipped
battle route was checked in the actual browser game; the fifteen-minute budget
has not been timed as an unassisted first-time playtest.

## Gathering and professions recommendation

The first gathering loop is implemented: find a resource along a quest route,
collect it, craft something useful, and use it in the next battle. Herbs make
potions; ember iron ore makes gem shards or the sword. Nodes are quick to
collect and finite per game world; there is no respawn timer or farming lap.

Before expanding, playtest whether the sword competes usefully with shop and
loot choices and whether resource spacing feels natural. Ingredients, recipes
and outputs live in `shared/`; collection eligibility, costs, crafting and saves
remain authoritative in Go.

Defer a large profession tree, harvesting timers, daily chores and separate
crafting progression until one gather → craft → battle loop is enjoyable. The
current starter gem kit and trail resources let us test crafting feedback
without adding a whole economy. Broader professions remain future scope.
