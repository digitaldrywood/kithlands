import { describe, it, expect } from "vitest";
import { createComposedSprite } from "./composedSprite.js";

// Regression guard for issue #84 (duplicate of #63, fixed in PR #72): promoted
// class sprites were rendering as the 0xff5722 fallback rectangle because
// boot.js wasn't preloading the promoted texture keys. These tests pin the
// contract between the server's Composition.BaseSprite output and the client's
// texture-key lookup: every base→promoted mapping the server can emit must
// resolve to a real image when its texture is present, and fall through to the
// fallback rectangle only when the texture is genuinely missing.

function makeScene(loadedKeys) {
  const loaded = new Set(loadedKeys);
  return {
    textures: { exists: (k) => loaded.has(k) },
    add: {
      image(x, y, key) {
        return {
          __kind: "image",
          x,
          y,
          key,
          width: 192,
          height: 192,
          preFX: null,
          setScale() {
            return this;
          },
          setTint(c) {
            this.tint = c;
            return this;
          },
        };
      },
      rectangle(x, y, w, h, color) {
        return { __kind: "rect", x, y, w, h, color };
      },
    },
  };
}

const PROMOTED_KEYS = [
  "knight",
  "champion",
  "shadow",
  "sage",
  "pyromancer",
  "wanderer",
];
const BASE_KEYS = [
  "warrior",
  "brawler",
  "rogue",
  "mender",
  "cinder",
  "wayfarer",
];

describe("createComposedSprite", () => {
  describe("promoted class sprites (issue #84 regression)", () => {
    for (const key of PROMOTED_KEYS) {
      it(`renders an image for ${key} when the texture is loaded`, () => {
        const scene = makeScene([key]);
        const sprite = createComposedSprite(
          scene,
          10,
          20,
          { base_sprite: key },
          { alive: true, targetSize: 100 },
        );
        expect(sprite.__kind).toBe("image");
        expect(sprite.key).toBe(key);
      });

      it(`falls back to the red rectangle for ${key} when texture missing`, () => {
        const scene = makeScene([]); // nothing loaded
        const sprite = createComposedSprite(
          scene,
          10,
          20,
          { base_sprite: key },
          { alive: true },
        );
        expect(sprite.__kind).toBe("rect");
        // 0xff5722 is the sentinel color the bug reporter called out in #84.
        // Keep this literal — if anyone changes the fallback color they MUST
        // update the issue reference too.
        expect(sprite.color).toBe(0xff5722);
      });
    }
  });

  describe("base class sprites", () => {
    for (const key of BASE_KEYS) {
      it(`renders ${key} when the texture is loaded`, () => {
        const scene = makeScene([key]);
        const sprite = createComposedSprite(
          scene,
          0,
          0,
          { base_sprite: key },
          {},
        );
        expect(sprite.__kind).toBe("image");
        expect(sprite.key).toBe(key);
      });
    }
  });

  describe("fallbackKey", () => {
    it("uses fallbackKey when composition has no base_sprite", () => {
      const scene = makeScene(["warrior"]);
      const sprite = createComposedSprite(
        scene,
        0,
        0,
        { base_sprite: "" },
        { fallbackKey: "warrior" },
      );
      expect(sprite.__kind).toBe("image");
      expect(sprite.key).toBe("warrior");
    });

    it("uses fallbackKey when composition is null", () => {
      const scene = makeScene(["rogue"]);
      const sprite = createComposedSprite(scene, 0, 0, null, {
        fallbackKey: "rogue",
      });
      expect(sprite.__kind).toBe("image");
      expect(sprite.key).toBe("rogue");
    });

    it("prefers composition.base_sprite over fallbackKey when both are set", () => {
      const scene = makeScene(["knight", "warrior"]);
      const sprite = createComposedSprite(
        scene,
        0,
        0,
        { base_sprite: "knight" },
        { fallbackKey: "warrior" },
      );
      expect(sprite.__kind).toBe("image");
      expect(sprite.key).toBe("knight");
    });
  });

  describe("dead members", () => {
    it("returns a grey rectangle when the texture is missing and alive=false", () => {
      const scene = makeScene([]);
      const sprite = createComposedSprite(
        scene,
        0,
        0,
        { base_sprite: "knight" },
        { alive: false },
      );
      expect(sprite.__kind).toBe("rect");
      expect(sprite.color).toBe(0x444444);
    });

    it("tints the image grey when alive=false and texture exists", () => {
      const scene = makeScene(["knight"]);
      const sprite = createComposedSprite(
        scene,
        0,
        0,
        { base_sprite: "knight" },
        { alive: false },
      );
      expect(sprite.__kind).toBe("image");
      expect(sprite.tint).toBe(0x444444);
    });
  });
});
