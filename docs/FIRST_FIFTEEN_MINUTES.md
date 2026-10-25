# A fifteen-minute Kithlands playtest

Start with **Quick start** from the title screen. The default Cadott party is
Warrior, Cinder, Rogue and Mender. This route samples the current normal game;
it does not use the disposable developer showcase or grant extra levels/items.
Times are a suggested budget, not a guarantee of first-visit completion.

For the most connected early detour, take **Old Mill trail → Explore the
optional Heron Pool**. The marked reed-bank herd offers an encounter preview
with level and tactics; Back leaves without fighting. Win, recover the
millwright supplies, then open Party → Crafting. The box contains 8 ore,
2 hardwood and a unique balanced bronze pommel. Choose the normal Iron Sword
(12 Power, 5% Hit Chance) or Balanced Trail Sword (11 Power, 15% Hit Chance).
Either leaves 3 ore for gem shards. The precision blade consumes the one-time
pommel. Equip your choice, rest at the now-safe bank, return to the split oak,
and test it against the mill bats. You can still explore/gather independently.
The cleared bank and claimed supplies persist through saving/loading; the
encounter and supply box do not reset on repeat visits.

| Time | What to do | What to notice |
| --- | --- | --- |
| 0–2 min | Open Menu, then Quest journal. Read the campaign objective and track The Old Mill under Local stories. | One journal contains both campaign progress and the mill. Tracking a story selects its route on the map; entering it shows its current step. |
| 2–4 min | Walk along the story routes and gather herbs, two ember iron outcrops, and fallen hardwood near a woodland route end when the Gather prompt appears. Open Menu → Crafting; brew a potion, refine Ember Shards and forge an Iron Sword. If travel takes longer, keep exploring rather than racing this budget. | One potion needs 2 herbs; three shards need 3 ore; the sword needs 5 ore and 1 hardwood. Two outcrops supply the combined 8 ore. Check the owned/required preview before crafting. |
| 4–9 min | Open Character, select the Warrior's weapon slot and equip the crafted Iron Sword. Use Gems → Transmute to make an Ember Gem from three shards, then Socket it into the sword. Take Old Mill trail and fight the bats; use your brewed potion when someone is hurt. | The sword has 12 base Power and one gem socket; the Ember Gem adds 3 Power. Try Warrior Attack, Cinder Spark, Rogue Attack/Steal and Mender healing. Inspect Party after wins to see XP toward the next level. |
| 9–12 min | Save, return to the world, then enter a settlement and visit its shop. Buy an affordable weapon/armor upgrade or supplies. Compare stats and equip the purchase. | The same party and inventory carry between the mill, world and town. Keep some gold for consumables; new games start with 100 gold. |
| 12–14 min | At a spell merchant, open Spells and pick a spell your caster can learn. Choose the eligible party member. If that town's shop does not offer a useful spell, spend this time on another battle instead. | Spell purchases teach that character directly. Class, level and already-known checks affect eligibility; stock depends on the generated shop. The tested Heal purchase cost 200 gold, so a fresh 100-gold character needs to earn more first. |
| 14–15 min | Open the same journal again, inspect your retained mill notes, check the campaign objective, and save. | Returning from a local story preserves discoveries and rewards. The next visit resumes the same story. |

Level-up timing depends on the encounters and party; the route gives real XP,
not an artificial guaranteed level at a particular minute. The mill is a longer
story with twelve locations. A fifteen-minute first visit need not finish its
puzzles or boss. Completing it awards 80 gold and its authored keepsake reward.

Crafting includes **potions, gem shards, Iron Sword, Balanced Trail Sword,
Steel Sword and Runic Mythril Sword**, plus gem transmutation and socketing. Iron is the starting
recipe; Steel requires party level 4 and purchased charcoal, flux and a leather
wrap. Runic Mythril requires party level 8, rare mythril ore, shop supplies and
the mill's runic core. Those advanced recipes are longer-term goals, not
promised first-session activities. There is no profession leveling tree or
broad armor recipe catalog. Spell shopping may require another settlement or
more levels/gold. The gathering → crafting → equipped battle route was checked
in the actual browser game; the fifteen-minute budget has not been timed as an
unassisted first-time playtest.

## Gathering and professions recommendation

The first gathering loop is implemented: find a resource along a quest route,
collect it, craft something useful, and use it in the next battle. Herbs make
potions; ember iron ore makes gem shards or a sword with a hardwood grip.
Resources have saved respawn deadlines: herbs 3 minutes, fallen hardwood
5 minutes, iron 10 minutes and rare mythril 30 minutes. Saving/loading or
closing the game preserves these deadlines; elapsed time still counts while
the game is closed. Mythril also requires party level 8. Gather on the way to
an objective rather than waiting beside a depleted node.

Before expanding, playtest whether the sword competes usefully with shop and
loot choices and whether resource spacing feels natural. Ingredients, recipes
and outputs live in `shared/`; collection eligibility, costs, crafting and saves
remain authoritative in Go.

Defer a large profession tree, daily chores and separate crafting progression
until one gather → craft → battle loop is enjoyable. The
current starter gem kit and trail resources let us test crafting feedback
without adding a whole economy. Broader professions remain future scope.
