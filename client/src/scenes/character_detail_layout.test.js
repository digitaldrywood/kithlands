import { describe, expect, it } from "vitest";
import { characterDetailLayout } from "./character_detail_layout.js";

describe("characterDetailLayout", () => {
  it("preserves the established 800x600 desktop composition", () => {
    const layout = characterDetailLayout({
      viewportWidth: 1280,
      viewportHeight: 720,
    });

    expect(layout).toMatchObject({
      mode: "desktop",
      gameWidth: 800,
      gameHeight: 600,
      shell: { x: 400, y: 300, width: 760, height: 540 },
      portrait: { x: 140, y: 260, width: 180, height: 200 },
      close: { x: 400, y: 530, width: 200, height: 34 },
    });
    expect(layout.equipment.cards).toEqual([
      { x: 640, y: 165 },
      { x: 640, y: 275 },
    ]);
  });

  it("reflows every control into a portrait logical canvas", () => {
    const layout = characterDetailLayout({
      viewportWidth: 390,
      viewportHeight: 844,
    });

    expect(layout).toMatchObject({
      mode: "mobile",
      gameWidth: 800,
      gameHeight: 1600,
      shell: { x: 400, y: 800, width: 760, height: 1460 },
      close: { x: 400, y: 1452, width: 680, height: 94 },
    });
    expect(layout.header.previous.height).toBeGreaterThanOrEqual(88);
    expect(layout.header.next.height).toBeGreaterThanOrEqual(88);
    expect(layout.header.loadout.height).toBeGreaterThanOrEqual(72);
    expect(layout.equipment.cardHeight).toBeGreaterThanOrEqual(180);
    expect(layout.equipment.details.height).toBeGreaterThanOrEqual(58);
    expect(layout.equipment.socket.height).toBeGreaterThanOrEqual(60);
  });

  it("returns defensive copies for callers that annotate layout state", () => {
    const first = characterDetailLayout({
      viewportWidth: 390,
      viewportHeight: 844,
    });
    first.header.previous.width = 1;
    first.equipment.cards[0].x = 1;

    const second = characterDetailLayout({
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(second.header.previous.width).toBe(88);
    expect(second.equipment.cards[0].x).toBe(220);
  });
});
