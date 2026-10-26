# A fifteen-minute Kithlands playtest

Start with **Quick start** from the title screen. The default Cadott party is
Warrior, Cinder, Rogue and Mender. This route samples the current normal game;
it does not use the disposable developer showcase or grant extra levels/items.
New Cinders start with Spark and Menders with Cure. The first shop sells Frost,
Sleep, Light and Bless for 100 gold each; those are now actual learning choices.
Existing saves keep every spell they already learned. Spending the starting
100 gold on a spell means earning more before buying other gear. Gathering and
crafting can supply early potions and a sword without spending that gold.

In the store, choose a category and item, inspect its preview, then confirm
Buy, Buy for a party member, or Learn. On phones, Back to stock returns to the
list; Escape backs out of the preview, then closes the shop. Each purchase
shows a receipt and keeps the selected item in view.

Times are a suggested budget, not a guarantee of first-visit completion.

To experience a **level-up**, follow the campaign errand in Menu → Quest
journal before the mill detour. Fetch quests require collecting the keepsake
from its keeper and returning it; deliveries require picking up the parcel
and handing it to the destination's keeper. Approach the NPC and use the
shown interaction prompt at each step. Native normal-game checks completed
these interactions and observed the party reach level three from level one
with the current 180-XP quest reward. The reward receipt shows XP, gold and
new levels in a corner, stays readable through scene changes, then fades.
This is an alternative first-session emphasis; completing an errand plus the
entire mill sample within fifteen minutes has not been timed with a new human
player. Bandit Clearing now requires a trail fight and return/report; use the
**Clear the blocked trail** prompt at its destination. In its mixed encounter,
Bandits alternate guard and attack: physical damage is reduced while guarding,
while Spark still deals full spell damage. Target the exposed Goblin or use
magic through the guard, then use Defend if you need protection on the attack
turn. The enemy plan appears in the command area and target detail.

Lost Traveler requires asking the keeper for the search location, finding the
traveler, choosing **Escort the traveler home**, and returning for a separate
reunion. They take cover during combat. If the party falls, rejoin them at the
search site before returning. Arrival alone pays no quest reward; see
`ESCORT_JOURNEY_PROOF.md`.

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
| 0–2 min | Open Menu → Quest journal, read the campaign objective and track The Old Mill under Local stories. Gather nearby herbs and ore when the prompt appears. | One journal contains campaign progress and the mill. Herbs brew potions; ore can become shards or a blade. |
| 2–4 min | Enter town through Town Hall, walk to the General Store and talk across its counter. Choose a spell or save your money for gear. | A new Cinder knows Spark; a new Mender knows Cure. Frost, Sleep, Light and Bless each cost 100 gold. Frost provides an ice option for the mill bats. You cannot buy every choice with the starting budget. |
| 4–9 min | Return to the town's south junction and take Old Mill trail → optional Heron Pool. Inspect the herd's level and tactics, then fight or decline. If you win, recover the millwright supplies. | Bramblehogs prepare before two stronger attacks. Attack their fire weakness or defend the rush. The supply box connects the fight to eight ore, two hardwood and the one-time precision-blade pommel. |
| 9–12 min | Open Party → Crafting. Brew a potion; choose Iron Sword or Balanced Trail Sword; refine three ore into shards. Equip the blade and use Gem workshop to transmute/socket an Ember Gem. Rest at the cleared bank. | Iron trades accuracy for one more Power; Balanced uses the unique pommel for +10% Hit Chance. Both have one socket. Three Ember Shards make a gem adding three Power. The cleared bank is a persistent safe rest stop. |
| 12–14 min | Return to the split oak and fight the mill bats with your crafted equipment; use Frost if you bought it, or try your existing actions and potion. Continue the early mill route if time permits. | The same party, inventory and XP persist. Inspect progress toward your next level; a level-up is not guaranteed by this time budget. Further shopping depends on what you spent and earned. |
| 14–15 min | Check the journal again and save at a safe point. | Retained mill progress, resource deadlines, equipment and learned spells belong to this adventure. The next visit resumes it. |

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
broad armor recipe catalog. Higher-level spell shopping requires more levels and gold. The gathering → crafting → equipped battle route was checked
in the actual browser game; the fifteen-minute budget has not been timed as an
unassisted first-time playtest.

## Opening audit and current limits

A real-keyboard audit with encounters enabled collected herbs and ore, entered
town through its door, bought armor, and reached the optional Heron battle.
It exposed a disappearing settlement trail control and replayed battle command
input, as well as the formerly redundant spell catalog. Those defects have
specific regression coverage; see `OPENING_ROUTE_RECOVERY_PROOF.md`.

A subsequent uninterrupted native-input route connected the journal, herbs,
ore, a purchased Frost spell, the optional Heron battle, earned smithing
supplies, a potion, Balanced Trail Sword, an Ember Gem, equipment/socketing,
the bank rest and the mill-bat fight. It starts with a normal level-one party
and 100 gold, keeps encounters enabled, and uses no debug grants or direct
combat submissions. The observed finish was 28 gold and 24 XP per character;
all four were still level one (level two requires 70 XP). This demonstrates
real progression, not a level-up. See `FIRST_SESSION_ROUTE_PROOF.md`.

The scripted route knows every destination and selects commands immediately;
its elapsed time is a regression measurement, not an unassisted first-time
player timing estimate. The table remains a suggested human playtest budget.
Natural level-up availability is now verified separately through native campaign
errands. Human timing, intended reward pacing and complete campaign integration
still require acceptance; see `CAMPAIGN_PROGRESSION_PROOF.md`.

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
