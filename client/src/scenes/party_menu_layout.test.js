import { describe, expect, it } from "vitest";
import { partyMenuLayout } from "./party_menu_layout.js";

describe("partyMenuLayout", () => {
  it("keeps the established 800x600 desktop composition", () => {
    const layout = partyMenuLayout({
      viewportWidth: 1440,
      viewportHeight: 900,
      partyCount: 4,
    });

    expect(layout.mode).toBe("desktop");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 600]);
    expect(layout.panel).toEqual({
      x: 400,
      y: 300,
      width: 760,
      height: 540,
    });
    expect(layout.body.rowHeight).toBe(90);
    expect(layout.actions.mode).toBe("rows");
  });

  it("uses a tall logical canvas and touch-sized action grid in portrait", () => {
    const layout = partyMenuLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      partyCount: 4,
    });

    expect(layout.mode).toBe("mobile");
    expect([layout.gameWidth, layout.gameHeight]).toEqual([800, 1600]);
    expect(layout.body.rowHeight).toBe(177);
    expect(layout.actions).toMatchObject({
      mode: "grid",
      columns: 2,
      buttonWidth: 334,
    });
  });

  it("fits six members without changing the selected breakpoint", () => {
    const layout = partyMenuLayout({
      viewportWidth: 430,
      viewportHeight: 932,
      partyCount: 6,
    });

    expect(layout.mode).toBe("mobile");
    expect(layout.body.rowHeight).toBe(118);
  });
});
