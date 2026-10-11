# A fifteen-minute Kithlands playtest

Start with **Quick start** from the title screen. The default Cadott party is
Warrior, Cinder, Rogue and Mender. This route samples the current normal game;
it does not use the disposable developer showcase or grant extra levels/items.
Times are a suggested budget, not a guarantee of first-visit completion.

| Time | What to do | What to notice |
| --- | --- | --- |
| 0–2 min | Open Objective, then Quest journal. Read the campaign objective and track The Old Mill under Local stories. | One journal contains both campaign progress and the mill. Tracking a story changes the field objective; entering it shows its current step. |
| 2–4 min | Open Menu → Gems, or Character → main-hand weapon → Socket. Select Transmute, then Transmute Ember Gem. Combine the three starter Ember Shards; switch to Socket and fit the result to the Warrior's compatible weapon socket. | The preview shows the cost and resulting stats. Starter gear has a socket, and the normal starter kit has three shards. This is gem crafting and equipment customization. |
| 4–9 min | Close menus, take Old Mill trail, inspect the split oak, and fight the trail bats. Use Warrior Attack, Cinder Spark, Rogue Attack/Steal and Mender healing when needed. Continue into the receiving room and read the ledger. | Melee contact, spell release/arrival, HP/MP use, loot and XP. Inspect Party after wins to see progress toward the next level. Continue another encounter if you want more combat. |
| 9–12 min | Save, return to the world, then enter a settlement and visit its shop. Buy an affordable weapon/armor upgrade or supplies. Compare stats and equip the purchase. | The same party and inventory carry between the mill, world and town. Keep some gold for consumables; new games start with 100 gold. |
| 12–14 min | At a spell merchant, open Spells and pick a spell your caster can learn. Choose the eligible party member. If that town's shop does not offer a useful spell, spend this time on another battle instead. | Spell purchases teach that character directly. Class, level and already-known checks affect eligibility; stock depends on the generated shop. The tested Heal purchase cost 200 gold, so a fresh 100-gold character needs to earn more first. |
| 14–15 min | Open the same journal again, inspect your retained mill notes, check the campaign objective, and save. | Returning from a local story preserves discoveries and rewards. The next visit resumes the same story. |

Level-up timing depends on the encounters and party; the route gives real XP,
not an artificial guaranteed level at a particular minute. The mill is a longer
story with twelve locations. A fifteen-minute first visit need not finish its
puzzles or boss. Completing it awards 80 gold and its authored keepsake reward.

There is currently **gem transmutation and socketing**, not a full blacksmithing
system that manufactures new weapons and armor from ore. Buy or loot equipment,
then customize it. Spell shopping may require a different settlement or more
levels/gold. These systems were checked separately in the actual browser game;
the itinerary itself has not been timed as an unassisted first-time playtest.

## Gathering and professions recommendation

Add a small gathering loop once this unified quest flow feels good in play:
find a resource while exploring, collect it, make something useful, and use it
in the next battle. Start with herbs for consumables and mineral/gem finds for
existing transmutation. Make nodes readable, quick to collect and finite per
expedition; place them along quest routes rather than requiring farming laps.

Then prove one smithing recipe that makes a meaningful weapon or armor choice.
Its ingredients, recipe and outputs belong in `shared/`; collection eligibility,
consumption, crafting and saves remain authoritative in Go. Add the relevant
objectives to this same journal and use the existing inventory/preview patterns.

Defer a large profession tree, harvesting timers, daily chores and separate
crafting progression until one gather → craft → battle loop is enjoyable. The
current starter gem kit already lets us test crafting feedback without adding
a whole economy. This is a recommendation, not newly implemented gameplay.
