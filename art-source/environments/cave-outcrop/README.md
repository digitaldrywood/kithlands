# Cave outcrop source

Generated with the built-in image generation tool; model identifier unavailable. References were the previous dungeon-cave marker and the approved detailed ruined arch. Prompt:

> Create one original pixel-art overworld cave entrance landmark for a fantasy top-down RPG, to be used as a tiny 64x64 game map sprite. Reference image 1 is the current cave: retain the clear dark arched entrance and overall centered compact silhouette. Reference image 2 is an existing detailed ruined stone landmark: match its fine pixel detail, muted mossy stone palette, perspective and warm daylight. Build a natural rocky outcrop with a high-contrast black entrance, moss and a few small grasses, readable at tiny scale. One single isolated object centered with generous transparent margin; no ground plane, no text, no characters, no icons, no baked shadow. Pixel-art, crisp edges, transparent background.

Run `sh normalize.sh` in this directory. The binary alpha threshold removes a generated translucent halo; the 64×64 export is installed at `client/public/sprites/world/landmarks/dungeon-cave-detailed.png`.
