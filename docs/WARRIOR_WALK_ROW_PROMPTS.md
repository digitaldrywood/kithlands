# Warrior Walk Row Prompts (Superseded)

The handwritten eight-pose prompts in this file were replaced by the supported
reference-grounded six-frame generator:

```sh
python3 scripts/generate_character64_row_openai.py \
  --class-id warrior \
  --direction east \
  --reference path/to/approved-reference.png
```

Generate and approve south, north, east, and west independently. Follow
`docs/CHARACTER_ANIMATION_PRODUCTION.md`; do not restore the legacy prompts,
128px cells, eight-column rows, or full-sheet conversion path.
