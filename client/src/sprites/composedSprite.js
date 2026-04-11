// Client helper that turns a server-provided composition descriptor
// into a visible Phaser GameObject with equipment-driven accents.
//
// The descriptor shape (from server/internal/sprites):
//   {
//     base_sprite:   "warrior",
//     weapon_tier:   3,
//     armor_tier:    2,
//     weapon_accent: "#c0c0c0",
//     armor_accent:  "#8d6e63",
//   }
//
// The helper creates a Phaser.Image at (x,y) using base_sprite as the
// texture key, scales it to fit targetSize, and adds a pre-FX glow keyed
// to the weapon accent (outer) and armor accent (inner). Glow strength
// scales with tier so higher-tier gear is visibly more impressive.
//
// If the WebGL pre-FX pipeline is unavailable (canvas fallback or
// missing texture), the helper degrades gracefully to a plain tinted
// image so the game remains playable without the accent.

const DEFAULT_TARGET_SIZE = 100;

function hexToInt(hex) {
  if (!hex || typeof hex !== "string") return null;
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return Number.isNaN(n) ? null : n;
}

function weaponGlowStrength(tier) {
  if (!tier || tier <= 0) return 0;
  // T1 barely glows, T7 glows prominently.
  return 2 + tier * 1.5;
}

function armorGlowStrength(tier) {
  if (!tier || tier <= 0) return 0;
  return 1 + tier * 0.8;
}

/**
 * Build a composed sprite for a party member.
 *
 * @param {Phaser.Scene} scene       - The scene to add the sprite to.
 * @param {number} x                 - Screen X (sprite origin center).
 * @param {number} y                 - Screen Y (sprite origin center).
 * @param {object} composition       - Server-provided composition descriptor.
 * @param {object} [opts]            - Render options.
 * @param {boolean} [opts.alive=true]  - Living party member (dead = grey tint).
 * @param {number} [opts.targetSize]   - Target pixel size for the base sprite.
 * @param {string} [opts.fallbackKey]  - Texture key to use if composition is missing.
 * @returns {Phaser.GameObjects.Image|Phaser.GameObjects.Rectangle}
 */
export function createComposedSprite(scene, x, y, composition, opts = {}) {
  const alive = opts.alive !== false;
  const targetSize = opts.targetSize || DEFAULT_TARGET_SIZE;
  const baseKey =
    (composition && composition.base_sprite) || opts.fallbackKey || "";

  if (!baseKey || !scene.textures.exists(baseKey)) {
    // Fallback: colored rectangle so render path never fully breaks.
    return scene.add.rectangle(x, y, 35, 35, alive ? 0xff5722 : 0x444444);
  }

  const sprite = scene.add.image(x, y, baseKey);
  sprite.setScale(targetSize / Math.max(sprite.width, sprite.height));

  if (!alive) {
    sprite.setTint(0x444444);
    return sprite;
  }

  // Only attempt pre-FX glow if the pipeline is available (WebGL).
  if (sprite.preFX && composition) {
    const weaponAccent = hexToInt(composition.weapon_accent);
    const armorAccent = hexToInt(composition.armor_accent);
    const weaponStrength = weaponGlowStrength(composition.weapon_tier);
    const armorStrength = armorGlowStrength(composition.armor_tier);

    if (weaponAccent !== null && weaponStrength > 0) {
      // Outer glow keyed to weapon tier.
      sprite.preFX.addGlow(weaponAccent, weaponStrength, 0, false, 0.1, 16);
    }
    if (armorAccent !== null && armorStrength > 0) {
      // Inner glow (knockout=false, innerStrength>0) keyed to armor tier.
      sprite.preFX.addGlow(armorAccent, 0, armorStrength, false, 0.1, 12);
    }
  }

  return sprite;
}
