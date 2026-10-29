import { describe, expect, it } from "vitest";
import {
  centeredPlayfieldOffset,
  portraitFontSize,
  gameplayViewportLayout,
  isPortraitPhone,
} from "./gameplayViewport.js";

describe("gameplay viewport", () => {
  it.each([
    [1440, 900],
    [390, 844],
  ])("reserves every painted D-pad button at %sx%s", (width, height) => {
    const { dpad, controlArea } = gameplayViewportLayout(width, height);
    const half = dpad.size / 2;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const x = dpad.x + dx * dpad.offset;
      const y = dpad.y + dy * dpad.offset;
      expect(controlArea.dpadLeft).toBeLessThanOrEqual(x - half);
      expect(controlArea.dpadRight).toBeGreaterThanOrEqual(x + half);
      expect(controlArea.dpadTop).toBeLessThanOrEqual(y - half);
      expect(controlArea.dpadBottom).toBeGreaterThanOrEqual(y + half);
    }
  });
  it("keeps the established 800x600 desktop contract", () => {
    const layout = gameplayViewportLayout(1440, 900);
    expect(layout).toMatchObject({
      portrait: false,
      width: 800,
      height: 600,
      footerY: 584,
    });
  });

  it("fills a portrait phone with a tall logical canvas", () => {
    const layout = gameplayViewportLayout(390, 844);
    expect(layout).toMatchObject({
      portrait: true,
      width: 800,
      height: 1731,
    });
    expect(layout.dpad.y).toBe(1421);
    expect(layout.action.y).toBe(1421);
    expect(layout.controlArea.footerTop).toBe(1526);
  });

  it("does not treat landscape phones or tablets as portrait phones", () => {
    expect(isPortraitPhone(844, 390)).toBe(false);
    expect(isPortraitPhone(768, 1024)).toBe(false);
  });

  it("centers authored spaces in the unobstructed portrait playfield", () => {
    const layout = gameplayViewportLayout(390, 844);
    expect(centeredPlayfieldOffset(layout, 512, 384)).toEqual({
      x: 144,
      y: 453,
    });
  });
});

it.each([320, 375, 390, 540])(
  "keeps fixed portrait text at least sixteen CSS pixels at %s",
  (width) => {
    const scene = {
      game: { canvas: { getBoundingClientRect: () => ({ width }) } },
      scale: { gameSize: { width: 800 } },
    };
    expect(
      (parseFloat(portraitFontSize(scene)) * width) / 800,
    ).toBeGreaterThanOrEqual(16);
  },
);
