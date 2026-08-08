# Warrior Walk Sheet Prompt (Superseded)

Do not use a full-sheet prompt for production walk assets. The old 8x4,
128px-cell workflow caused incorrect directions, clipping, split characters,
scale changes, and backwards walking.

Use `scripts/generate_character64_row_openai.py` to generate one referenced
six-frame direction row at a time, and follow the authoritative contract in
`docs/CHARACTER_ANIMATION_PRODUCTION.md`.
