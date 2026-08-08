# ADR-005: Use a DOM Overlay for Equipment Management

Date: 2026-08-08
Status: accepted

## Context

Kithlands renders its world and most menus in Phaser. A two-step character
summary followed by a separate equipment manager adds navigation without
helping the player understand the relationship between character stats and
gear. Expanded loadouts also need twelve or more interactive positions,
inventory filtering, persistent comparison, socket and recipe previews,
disabled reasons, party navigation, touch behavior, and keyboard focus.

The app can host a small native UI layer next to the Phaser canvas. A full
client framework or renderer rewrite is not required.

## Decision

Keep the world and battle in Phaser. The normal **Character** action opens one
combined character-sheet and equipment surface as semantic HTML mounted in a
fixed app UI layer above the Phaser canvas. The overlay keeps status and the
spatial loadout visible together, and reveals inventory and comparison controls
only after a slot is chosen. Phaser owns the overlay lifecycle, but the overlay
uses the real browser viewport rather than Phaser's scaled DOM coordinates.

The equipment overlay renders the server-authored slot catalog and resolved
item views. It sends stable IDs to authoritative server operations and does not
implement equip, class, level, socket, recipe, or recommendation rules in the
browser.

Slot and item controls use native interactive elements with focus, accessible
names, touch targets, and stable test selectors. Essential inspection data is a
persistent details region; hover is only one way to select or preview it.
Opening the overlay pauses world input, and closing it restores the prior scene
and focus.

The screen and future icon system follow
[`docs/EQUIPMENT_SCREEN_CONTRACT.md`](../EQUIPMENT_SCREEN_CONTRACT.md).

## Consequences

- The spatial loadout can scale beyond weapon and armor without hardcoded
  canvas coordinates becoming the mechanics model.
- Browser tests can address slots and actions by role and ID rather than pixel
  position.
- Keyboard, touch, readable text wrapping, and responsive layouts are tractable.
- Phaser remains the game renderer; this is a targeted hybrid boundary, not a
  migration of the game to DOM UI.
- The client needs a small overlay lifecycle and styling system synchronized
  with Phaser scene and menu pause behavior.
- Shared equipment and gem content needs stable icon keys before final asset
  production.
