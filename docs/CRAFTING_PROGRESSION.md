# Crafting progression: gathered, purchased, earned

The first gathering implementation used a herb as a sword ingredient. That did
not explain how the item was made or give the player a meaningful acquisition
plan. The revised sword progression uses materials with understandable roles
and connects gathering, the existing shop, and Old Mill's normal quest rewards.

## Research and design choices

- [Minecraft's official sword guide](https://www.minecraft.net/en-us/article/taking-inventory--sword)
  uses a handle component and a blade material. Kithlands follows that readable
  relationship with hardwood and metal; herbs belong to potion recipes.
- [Blizzard's professions overview](https://news.blizzard.com/en-us/article/23876529/dragonflight-making-it-with-professions)
  connects gathering to crafting and reserves special reagents for stronger
  creations. Kithlands uses a scarce mythril seam and an earned dungeon core
  instead of making every upgrade a larger pile of the same early ore.
- [The official Guild Wars Nightfall manual](https://legal.guildwars.com/en/docs/gwn-manual-en.pdf),
  pages 62–64, describes equipment acquisition through money and materials,
  including common/rare materials, salvage, and traders. Kithlands takes the
  acquisition-source distinction: the shop supplies fuel, flux, and grip wrap.

These are adapted design patterns, not an attempt to recreate those games'
full profession systems. Existing server equipment stats remain authoritative.

## Implemented recipes

| Result | Gate | Gathered | Purchased | Earned |
|---|---|---|---|---|
| Potion | Starting party | 2 meadow herbs | — | — |
| 3 Ember Shards | Starting party | 3 ember iron ore | — | — |
| Iron Sword, 1 socket | Starting party | 5 ember iron ore, 1 hardwood | — | — |
| Steel Sword, 1 socket | Party level 4 | 8 ember iron ore, 1 hardwood | 2 charcoal, 1 flux, 1 leather wrap (32g total) | — |
| Rare Mythril Sword, 2 sockets | Party level 8 | 2 mythril ore, 1 hardwood | 2 flux, 1 leather wrap (32g total) | 1 Millwright runic core |

Wood appears near the ends of quest routes. A map has at most one mythril seam;
it requires party level 8 and can be harvested once. Existing herb and iron
nodes retain their positions and save identities. The material pouch and
harvested nodes persist on the server.

Town shops expose a Supplies tab. Charcoal costs 6g, flux 12g, and grip wrap 8g
per unit. Supplies append to older saved shop inventories, preserving existing
offer IDs and rolled equipment. Replaying a purchase receipt is rejected.

Restoring Old Mill and returning home grants the core exactly once alongside
the existing reward. It is a separate crafting material: crafting never consumes
a key needed to complete a quest. The return message names the reward. Old saves
that already completed Old Mill receive the new core once on load. A separate
material claim persists after spending it, preventing duplicate rewards.

The workbench shows owned/required amounts, each material's acquisition source,
level gates, item stats, and socket counts. Recipes and quantities live in
`shared/gathering.json`; gathering, purchase, reward, and crafting transactions
remain in Go. Crafted equipment inherits the recipe's equip-level requirement.

## Next worthwhile steps

1. Add distinct forge and alchemy stations in authored settlements; expose
   the relevant recipe category and make travel purposeful. The demo currently
   uses the existing field workbench to verify the complete acquisition loop.
2. Extend the proven ingredient patterns to one armor and one caster recipe
   before building a large recipe catalogue.
3. Add a salvage preview with server-owned returns so unwanted equipment can
   become useful material without creating an infinite gold/material loop.
4. Add several optional quest/rare ingredients and distinct visual rewards.
   Prefer alternate equipment choices over endless numerical escalation.
5. Add profession progression only after acquisition pacing and item usefulness
   are proven. Avoid requiring repetitive harvesting to progress the main story.

## Verification

See the current run and inspected screenshots in `CRAFTING_PROGRESSION_PROOF.md`.
Advanced browser tests earn the core through the real authored Old Mill combat
route, buy supplies through the normal shop UI, and gather through normal world
movement. Only party level is advanced with the authoritative debug fixture to
exercise level-4/8 crafting without unrelated quest grinding. This proves the
transactions and interfaces, not natural levelling time or a balanced economy.
