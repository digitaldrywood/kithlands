import { describe, expect, it } from "vitest";

import { formationMenuLayout } from "./formation_menu_layout.js";

describe("formationMenuLayout", () => {
  it("preserves the established desktop geometry", () => {
    const layout = formationMenuLayout({
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    expect(layout.mode).toBe("desktop");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 600]);
    expect(layout.shell).toEqual({
      x: 400,
      y: 300,
      width: 760,
      height: 540,
    });
    expect(layout.list.panel).toEqual({
      x: 561,
      y: 312,
      width: 430,
      height: 340,
    });
  });

  it("stacks large preview, order, and save regions on phones", () => {
    const layout = formationMenuLayout({
      viewportWidth: 390,
      viewportHeight: 844,
    });

    expect(layout.mode).toBe("mobile");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 1600]);
    expect(layout.shell.height).toBe(1460);
    expect(layout.preview.panel.y).toBeLessThan(layout.list.panel.y);
    expect(layout.list.rowBodyHeight).toBeGreaterThanOrEqual(88);
    expect(layout.list.badge.height).toBeGreaterThanOrEqual(58);
    expect(layout.save).toMatchObject({ width: 680, height: 94 });
  });

  it("keeps narrow landscape on the desktop canvas", () => {
    const layout = formationMenuLayout({
      viewportWidth: 480,
      viewportHeight: 320,
    });

    expect(layout.mode).toBe("desktop");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 600]);
  });
});
