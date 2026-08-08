# Battle HUD Research And Character Coverage

Date: 2026-08-08
Issues: #270 and #265
Baseline: `origin/main` at `9cfaee4`

## Verified Baseline

- The 800x600 game canvas uses Phaser Scale FIT. At 390x844 the complete
  landscape canvas remains visible, but every control and label is scaled to
  roughly 49% of its authored size.
- The command panel occupies the lower-left and the message window occupies
  the lower-center/right. There is no dedicated party-status region.
- Party names, class/level, HP, MP, bars, and status icons are attached to the
  battlefield sprites. The inspected showcase has text and meters crossing
  bodies and effects.
- The server-authorized Systems Showcase is debug-only and disposable, but its
  configured party covers only Warrior, Cinder, Mender, and Rogue.
- The Warrior sword attack is the only authored, layered battle-character
  body. Every other class uses a static/composed fallback. Generic tint,
  lunge, projectile, and result effects are presentation fallbacks, not
  class-authored animation coverage.

## Current Reference Conclusions

The official Persona 3 Reload site describes its modernized battle UI as a
signature part of the game, while current Dragon Quest VII Reimagined material
shows that auto-battle, per-character tactics, speed, and command shortcuts are
first-class battle controls. These are reference points for hierarchy and
pacing only; Kithlands will not copy their art, characters, or exact UI.

For implementation:

1. Keep persistent party vitals separate from transient commands and narration.
2. Give the active actor one stable portrait/name region. Do not move party
   vitals into that region as actors change.
3. Show HP and MP as both numbers and bars. Preserve the current/max pair even
   when a bar is nearly empty.
4. Use an opaque or reliably high-contrast panel behind all critical text.
   Target at least 4.5:1 for standard text and 3:1 for large text and essential
   non-text indicators.
5. Do not encode actor, target, HP danger, MP, or status by color alone. Combine
   color with labels, cursor shape, icons, outlines, or meter labels.
6. Make active focus visually persistent using multiple channels: outline,
   fill change, weight/scale, and a text label where space permits.
7. Keep focus on visible, interactive elements and move it deliberately when a
   command opens a spell, item, or target picker.
8. Use relative layout constraints and a portrait-specific arrangement instead
   of shrinking the desktop HUD as one fixed bitmap.
9. Author mobile controls at a 44x44 CSS-pixel target when the browser surface
   permits it; 24x24 CSS pixels is only the WCAG 2.2 AA floor.
10. Prefer readable mixed-case labels and proportional body text. Reserve the
    display face for short headings and action beats.

Primary and official sources:

- W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C, Use of Color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- Microsoft XAG 101, Text Display: https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101
- Microsoft XAG 102, Contrast: https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102
- Microsoft XAG 103, Additional Channels: https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103
- Microsoft XAG 113, UI Focus: https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/113
- Apple, Designing for Games: https://developer.apple.com/design/human-interface-guidelines/designing-for-games
- Apple, Menus and In-Game Menus: https://developer.apple.com/design/human-interface-guidelines/menus
- Persona 3 Reload official site: https://persona.atlus.com/p3r/
- Xbox Wire, Dragon Quest VII Reimagined tips: https://news.xbox.com/en-us/2026/02/05/set-sail-with-these-tips-to-dragon-quest-vii-reimagined/

## Twelve-Class Authored Battle Coverage

`A` = approved authored class animation, `R` = installed review candidate,
`F` = generic runtime fallback, `-` = absent.

| Class | Idle/guard | Physical | Cast/ability | Defend | Hit | Item | Victory | KO | Equipment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Warrior | A | A sword | - | F | F | F | - | F | A sword |
| Brawler | F | F | F | F | F | F | - | F | - unarmed |
| Rogue | F | F | F | F | F | F | - | F | - dagger/bow |
| Mender | R | F | R staff cast | F | F | F | - | F | R staff |
| Cinder | F | F | F | F | F | F | - | F | - dagger/staff |
| Wayfarer | F | F | F | F | F | F | - | F | - mixed |
| Knight | F | F | F | F | F | F | - | F | - weapon/shield |
| Champion | F | F | F | F | F | F | - | F | - unarmed |
| Shadow | F | F | F | F | F | F | - | F | - dagger/bow |
| Sage | F | F | F | F | F | F | - | F | - staff |
| Pyromancer | F | F | F | F | F | F | - | F | - dagger/staff |
| Wanderer | F | F | F | F | F | F | - | F | - mixed |

The next gold slice is Mender cast/guard with a separate staff attachment.
No other class asset should be generated until that slice is visually approved
in the real Systems Showcase battle.
