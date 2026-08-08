# Equipment and Loadout Screen Contract

Status: approved direction; implementation and final art are separate follow-up
work.

This document defines the equipment-management surface before item icons and
final presentation art are produced. It extends the instance-loot, gem, and
loadout decisions in ADR-002 through ADR-004. Battle sprites and battle-screen
equipment presentation are intentionally out of scope.

## 1. Product intent

The character detail screen remains a quick summary: identity, health, core
stats, and a compact indication of important equipped items. A dedicated
**Equipment** action opens the full loadout manager.

The loadout manager must let a player answer these questions without guessing:

- Which slots does this character have, and what is equipped in each one?
- Why is an item better or worse than the current item?
- Which part of a stat comes from the character, the base item, affixes, and
  socketed gems?
- Why can or cannot this character equip an item?
- What will be displaced or moved before an equip action is confirmed?
- What will a socket or transmutation change before it mutates the save?

The first complete screen supports the twelve authored positions already in
`shared/items.json`: main hand, off hand, head, shoulders, body, hands, waist,
legs, feet, amulet, Ring I, and Ring II. The UI renders the slot catalog sent by
the server; it does not assume that twelve is a permanent maximum.

## 2. Screen structure

The desktop composition uses a familiar paper-doll pattern without copying
another game's art or exact layout:

```text
+--------------------------------------------------------------------+
| < Hero 1/4 >        EQUIPMENT              Class - Level            |
+-----------------------+----------------------+----------------------+
| Head        Amulet    |                      | Inventory            |
| Shoulders   Ring I    |   character art      | filtered for the     |
| Body        Ring II   |   / silhouette       | selected slot        |
| Hands                 |                      |                      |
| Waist       Main Hand |                      | [item] [item] [item] |
| Legs        Off Hand  |                      | [item] [item] [item] |
| Feet                  |                      |                      |
+-----------------------+----------------------+----------------------+
| CURRENT ITEM              CANDIDATE ITEM              CHANGE        |
| base + affix + gems        base + affix + gems          exact deltas |
| [Socket / Transmute]                                  [Equip]        |
+--------------------------------------------------------------------+
```

This is a relationship contract, not a pixel-perfect wireframe. At narrow
widths, the slot area becomes an ordered two-column list, the character image
becomes decorative or collapses, and comparison opens as a pinned drawer.
Nothing required to equip an item may depend on hover.

### Slot button states

Every position is a real button with a stable slot ID and one of these states:

- **Empty:** slot label plus a category silhouette.
- **Equipped:** item icon, short name, rarity treatment, and socket pips.
- **Selected:** strong outline and the corresponding inventory filter.
- **Unavailable:** visible reason such as class, level, or future story gate;
  never color alone.
- **Reserved/linked:** future two-handed or paired equipment may reserve a
  second position; the server names the link and the UI explains it.

Repeated positions remain distinct. Ring I and Ring II are separate buttons
even though both accept the `ring` category.

## 3. Interaction flow

### Equip or replace

1. Opening the screen selects the first occupied slot, otherwise the first
   authored slot by order.
2. Selecting a slot filters owned equipment to compatible categories.
3. Hover, keyboard focus, or first tap previews an item without mutation.
4. The comparison pane shows current, candidate, and exact character deltas.
5. **Equip** names the destination slot. If the item is worn by another party
   member, or if it displaces linked equipment, the preview names every move.
6. The server validates ownership, class, level, category, and final loadout,
   performs the move atomically, and returns the authoritative state.

The client never predicts success by reimplementing equip rules. A disabled
candidate displays the server-provided reason.

### Compare

Comparison is persistent, not a transient tooltip. It must show:

- item name, rarity, item level, required level, category, and allowed class;
- base values, rolled affixes, socketed gem values, and resolved totals;
- current character stat, proposed character stat, and signed delta;
- socket count, filled sockets, and socket effects;
- moves or displaced equipment caused by the proposed action.

Positive, neutral, and negative changes use symbols and text in addition to
color. A value never silently disappears because it is zero.

### Socket or transmute

The selected equipped item exposes **Socket** when it has an open socket and
**Transmute** when a known recipe applies. These actions may open the Gem
Workshop, but they keep the selected character, equipment slot, and instance
ID as return context.

Gem selection and recipe selection are non-mutating previews. The final action
states both the verb and the target, for example **Socket Ember Gem into Keen
Short Sword**. After confirmation, the server response replaces local screen
state. The slot must immediately show the filled socket and may not reuse a
stale pre-mutation instance view.

### Best gear

**Recommend Gear** asks the server for a proposed loadout plan. The response is
a preview containing every changed position, displaced item, and resulting
character delta. **Apply Recommended Gear** is a separate confirmation.

The planner evaluates the whole loadout, including both ring positions and
future linked hand slots, rather than greedily choosing one slot at a time. The
initial scoring goal must be visible to the player, such as Balanced, Offense,
Defense, or Magic. No item is socketed or transmuted by a recommendation.

## 4. Authoritative data contract

The Go server remains authoritative for inventory identity and all mutations.
The equipment surface consumes resolved views and submits only stable IDs and
requested actions.

### Existing foundations

- `shared/items.json` authors slot IDs, labels, groups, order, and accepted
  categories.
- Equipment instances own base item ID, rolled values, rarity, item level, and
  sockets.
- A party member's loadout maps slot ID to an equipped reference.
- Equip, unequip, move, socket, and recipe transactions are server operations.

### Required presentation fields before icon production

Add stable semantic keys to shared content rather than filename guesses in the
client:

- each slot definition: `empty_icon_key`;
- each equipment base: `icon_key`;
- each gem definition: `icon_key`.

API item views will expose the resolved icon key with the item instance. The client
may map a key to an atlas frame or URL, but it does not infer a sword icon from
an item name. Missing art uses a deliberate category placeholder and never
prevents mechanics from working.

Comparison and recommendation responses should include display-ready reason
codes and resolved numeric deltas. Human-readable wording belongs in shared
content or a client localization map keyed by stable codes; it is not generated
by the LLM.

## 5. DOM and Phaser boundary

The full loadout manager is a semantic HTML overlay mounted inside the DOM
container already enabled by Phaser. Phaser continues to render the world,
character art, and battle. Opening the overlay locks world input through the
existing menu pause mechanism; closing it restores the previous Phaser screen
and focus.

Use native controls for interaction:

- the surface is a labelled modal dialog;
- party navigation, slots, filters, items, and actions are native buttons;
- slot and item names are available to accessible names even when an icon is
  visible;
- keyboard focus and first tap pin the same details shown by hover;
- Enter or Space activates a button, Escape closes the top surface, and focus
  returns to the control that opened it;
- if the visual slot arrangement uses ARIA grid behavior, it must implement the
  full arrow-key contract; otherwise use a normal ordered collection of buttons.

Essential comparison content belongs in the persistent details region, not in
a tooltip. A small tooltip may supplement an icon when it also appears on
keyboard focus and is referenced by `aria-describedby`.

The canvas remains the gameplay surface. This decision does not require
converting every Phaser menu to HTML.

## 6. Icon production contract

Art is produced only after a mechanics wireframe using placeholders passes on
desktop and mobile.

- Author one square base icon per equipment base, not per randomized instance.
- Author one simple silhouette per empty-slot category.
- Author one square icon per gem family and grade when the shape changes.
- Rarity frames, selection, disabled treatment, comparison arrows, socket pips,
  class/level locks, and affix markers are UI layers, not baked into item art.
- Random affixes alter labels and overlays; they do not multiply the asset
  count.
- Icons remain recognizable at the smallest supported display size and use a
  transparent background.
- Every icon has an asset manifest entry keyed by the shared `icon_key`.

The initial visual gold slice should cover one empty slot, one weapon, one
armor item, one accessory, and one gem across normal, selected, disabled, and
socketed states. Approve that system before producing the full catalog.

## 7. Acceptance gates

The first implementation is complete only when all of the following are true:

- all server-authored positions render for every party member, including empty
  positions and both rings;
- mouse, touch, and keyboard can select a slot, inspect a candidate, equip it,
  and return from the Gem Workshop;
- class-, level-, ownership-, and category-invalid actions show a reason;
- base, affix, gem, total, and character deltas are distinguishable;
- moving an equipped item and filling a socket refresh the same instance
  everywhere without reopening the menu;
- the recommendation preview makes no mutation before confirmation;
- the full flow works at 1440x900, 800x600, and 390x844 without clipped actions;
- tests address controls by semantic role and stable IDs rather than screen
  coordinates;
- battle rendering is unchanged.

## 8. Design references

These references support interaction patterns, not visual copying:

- Blizzard's itemization overview documents a twelve-position character
  loadout and exposes base stats beside item icons:
  <https://news.blizzard.com/en-us/article/23574266/itemization-in-diablo-immortal>
- Final Fantasy XIV documents side-by-side gear comparison, explicit
  recommended-gear review, and saved gear sets:
  <https://na.finalfantasyxiv.com/uiguide/equipment/equipment-compare/equipment_compare.html>
  <https://na.finalfantasyxiv.com/uiguide/equipment/equipment-saikyo/equipment_best.html>
  <https://na.finalfantasyxiv.com/uiguide/equipment/equipment-gearset/equipment_set.html>
- WAI-ARIA Authoring Practices define button, grid, and tooltip keyboard/focus
  behavior:
  <https://www.w3.org/WAI/ARIA/apg/patterns/button/>
  <https://www.w3.org/WAI/ARIA/apg/patterns/grid/>
  <https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/>
