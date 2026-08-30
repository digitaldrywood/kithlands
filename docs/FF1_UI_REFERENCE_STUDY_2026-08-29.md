# FF1 Remastered UI Reference Study

This study uses the supplied Final Fantasy I Remastered screenshots as
interaction and information-design references only. Kithlands must keep its
own panel shapes, palette, type, icons, sprites, effects, and world identity.

## What the screenshots teach well

### One decision owns the focus

FF1 consistently gives the current row a filled highlight, bright outline, and
cursor. Inactive choices become quiet. Kithlands should likewise make one
choice dominant through fill, border, and motion while keeping the rest of the
screen readable.

### Context stays next to the choice

Items, spells, equipment, and battle commands show a short explanation while
the player is choosing. Kithlands should use its battle message window and menu
detail areas for concise action, cost, target, and consequence text.

### Selection is a short state sequence

The screenshots separate command selection, ability selection, target
selection, resolution, and results. Kithlands should preserve that rhythm and
label each state clearly instead of showing several competing controls at once.

### Results emphasize change before totals

The FF1 reward flow leads with gained XP and currency, marks level-ups, then
shows the changed stats. Kithlands should lead with earned rewards and party
progress, reserve totals for secondary labels, and avoid presenting the entire
inventory as newly found loot.

### The battlefield remains the visual subject

During combat, menus occupy a stable lower band while characters and effects
remain readable. Kithlands should keep commands, history, and party status in
separate regions and avoid letting borders become louder than the action.

## Kithlands adaptation rules

- Use the existing midnight, steel-blue, cyan, amber, and green language.
- Use original geometric focus rails and glows, not FF's glove cursor.
- Prefer proportional body text; reserve monospace for debug and aligned data.
- Keep content and game rules authoritative on the server.
- Show only server-provided costs, targets, rewards, and progression changes.
- Make desktop, narrow/mobile, keyboard, and pointer states equally clear.

## First implementation slice

1. Strengthen shared button hover/focus treatment and provide focus callbacks.
2. Add contextual descriptions to battle commands through the existing message
   window.
3. Rebuild victory presentation around reward cards, party progress rows,
   level-up badges, and actual drops from the combat log.
4. Reuse the same focus/context/result language in items, equipment, status,
   party order, and field magic after the battle slice is visually accepted.

## Follow-up priorities

The item and equipment lessons are now represented in a second implementation
slice:

- Field and battle items keep the selected name, carried count, description,
  availability, and target contract visible while browsing.
- Target selection is a labeled step with party vitals, disabled invalid
  targets, keyboard navigation, and an explicit return to the item list.
- Equipment previews show server-provided loadout values in Current, Preview,
  and Change columns, with unchanged rows visually quiet.
- Field magic keeps the selected spell's server-authored description, MP cost,
  target contract, caster MP, and target validity visible across each step.

Remaining priorities:

1. Party and status: reduce equally weighted borders and improve scan order.
2. Battle resolution: clearer action title cards and damage/status feedback.
3. Level-up detail: a second, server-backed changed-stat panel when the API
   exposes before/after values explicitly.
