import { describe, expect, it } from "vitest";
import { menuOverlayLayout } from "./menu_overlay_layout.js";

describe("menuOverlayLayout", () => {
  it("preserves the established desktop overlay geometry", () => {
    const layout = menuOverlayLayout({
      viewportWidth: 1440,
      viewportHeight: 900,
      desktopRowHeight: 25,
      desktopMaxVisible: 9,
    });

    expect(layout.mode).toBe("desktop");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 600]);
    expect(layout.panel).toEqual({
      x: 400,
      y: 300,
      width: 560,
      height: 420,
    });
    expect(layout.list.rowHeight).toBe(25);
    expect(layout.list.maxVisible).toBe(9);
    expect(layout.footer.buttonHeight).toBe(26);
  });

  it("uses the portrait canvas and touch-sized controls on phones", () => {
    const layout = menuOverlayLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      desktopRowHeight: 25,
      desktopMaxVisible: 9,
    });

    expect(layout.mode).toBe("mobile");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 1600]);
    expect(layout.panel).toEqual({
      x: 400,
      y: 800,
      width: 760,
      height: 1460,
    });
    expect(layout.list.rowHeight).toBe(88);
    expect(layout.list.maxVisible).toBe(9);
    expect(layout.footer.buttonHeight).toBeGreaterThanOrEqual(88);
    expect(layout.targets.cardHeight).toBeGreaterThanOrEqual(160);
  });

  it("does not treat a narrow landscape viewport as portrait", () => {
    const layout = menuOverlayLayout({
      viewportWidth: 480,
      viewportHeight: 320,
    });

    expect(layout.mode).toBe("desktop");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 600]);
  });
});
