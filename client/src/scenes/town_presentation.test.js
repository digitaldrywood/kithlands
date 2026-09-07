import { describe, expect, it, vi } from "vitest";
import {
  preloadInteriorProps,
  drawInteriorProps,
} from "./town_presentation.js";

describe("reusable interior furniture", () => {
  it("shares textures across repeated furniture and subsequent room visits", () => {
    const loaded = new Set();
    const image = vi.fn((key) => loaded.add(key));
    const scene = {
      textures: { exists: (key) => loaded.has(key) },
      load: { image },
      interiorPresentation: {
        props: [
          { asset: "/interiors/library/bookcase.png" },
          { asset: "/interiors/library/bookcase.png" },
        ],
      },
    };
    preloadInteriorProps(scene);
    preloadInteriorProps(scene);
    expect(image).toHaveBeenCalledTimes(1);
  });

  it("places furniture at room-relative coordinates and its feet row", () => {
    const sprite = {
      setOrigin: vi.fn().mockReturnThis(),
      setDisplaySize: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
    };
    const image = vi.fn(() => sprite);
    const result = drawInteriorProps(
      {
        offsetX: 144,
        offsetY: 80,
        add: { image },
        interiorPresentation: {
          props: [
            {
              asset: "/interiors/library/desk.png",
              x: 64,
              y: 96,
              width: 96,
              height: 64,
              row: 4,
            },
          ],
        },
      },
      (row) => row * 10,
    );
    expect(image).toHaveBeenCalledWith(
      208,
      176,
      "interior_prop:/interiors/library/desk.png",
    );
    expect(sprite.setDisplaySize).toHaveBeenCalledWith(96, 64);
    expect(sprite.setDepth).toHaveBeenCalledWith(40);
    expect(result).toEqual([sprite]);
  });
});
