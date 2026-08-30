import { describe, expect, it } from "vitest";
import {
  centeredPlayfieldOffset,
  gameplayViewportLayout,
  isPortraitPhone,
} from "./gameplayViewport.js";

describe("gameplay viewport", () => {
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
