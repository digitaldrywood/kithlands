import { describe, expect, it } from "vitest";

import {
  GRID_DIMENSION,
  SHEET_ROW_COUNT,
  buildSheetCells,
  debuggerCatalog,
  totalBackgroundCount,
} from "./model.js";
import {
  WALK_SHEET_CLASS_IDS,
  WALK_SKILL_DIRECTIONS,
} from "../scenes/walkFrame.js";
import { BG_VARIANTS } from "../scenes/battleBackgrounds.js";

describe("sprite debugger model", () => {
  it("uses the runtime walk-sheet class list for debugger coverage", () => {
    expect(debuggerCatalog.walkSheets.map((sheet) => sheet.id)).toEqual(
      WALK_SHEET_CLASS_IDS,
    );
    expect(debuggerCatalog.attackSheets.map((sheet) => sheet.id)).toEqual(
      WALK_SHEET_CLASS_IDS,
    );
  });

  it("slices warrior's native 6x8 skill sheet with direction metadata", () => {
    const warrior = debuggerCatalog.walkSheets.find(
      (sheet) => sheet.id === "warrior",
    );
    const cells = buildSheetCells(384, 512, warrior.geometry);

    expect(GRID_DIMENSION).toBe(6);
    expect(SHEET_ROW_COUNT).toBe(8);
    expect(cells).toHaveLength(48);
    expect(cells[0]).toMatchObject({
      id: "r0-c0",
      direction: WALK_SKILL_DIRECTIONS[0],
      row: 0,
      col: 0,
      width: 64,
      height: 64,
      x: 0,
      y: 0,
      pose: expect.objectContaining({
        id: "contact-a",
        label: "Contact A",
      }),
    });
    expect(cells[2]).toMatchObject({
      id: "r0-c2",
      pose: expect.objectContaining({
        id: "passing-a",
        label: "Passing A",
      }),
    });
    expect(cells.at(-1)).toMatchObject({
      id: "r7-c5",
      direction: WALK_SKILL_DIRECTIONS[7],
      row: 7,
      col: 5,
      width: 64,
      height: 64,
      x: 320,
      y: 448,
      pose: expect.objectContaining({
        id: "down-b",
        label: "Down B",
      }),
    });
  });

  it("auto-detects the old 8x4 legacy sheets for review-only assets", () => {
    const cells = buildSheetCells(1024, 512);
    expect(cells).toHaveLength(32);
    expect(cells.at(-1)).toMatchObject({
      id: "r3-c7",
      direction: "right",
      width: 128,
      height: 128,
    });
  });

  it("slices native 8x8 attack sheets with direction metadata", () => {
    const brawler = debuggerCatalog.attackSheets.find(
      (sheet) => sheet.id === "brawler",
    );
    const cells = buildSheetCells(512, 512, brawler.geometry);
    expect(cells).toHaveLength(64);
    expect(cells[16]).toMatchObject({
      id: "r2-c0",
      direction: "east",
      row: 2,
      col: 0,
      width: 64,
      height: 64,
    });
  });

  it("rejects sheet dimensions that cannot form the requested grid", () => {
    const warrior = debuggerCatalog.walkSheets.find(
      (sheet) => sheet.id === "warrior",
    );
    expect(() => buildSheetCells(511, 512, warrior.geometry)).toThrow(/6x8/i);
    expect(() => buildSheetCells(384, 510, warrior.geometry)).toThrow(/6x8/i);
  });

  it("exposes one debugger entry per committed battle background variant", () => {
    const expected = Object.values(BG_VARIANTS).reduce((a, n) => a + n, 0);
    expect(debuggerCatalog.backgrounds).toHaveLength(expected);
    expect(totalBackgroundCount()).toBe(expected);
    for (const bg of debuggerCatalog.backgrounds) {
      expect(bg.path).toMatch(/\/backgrounds\/[^/]+\/[^/]+\.png$/);
      expect(bg.id).toMatch(/^bg_[a-z]+_\d+$/);
      expect(bg.badgeLabel).toBe("BG");
    }
  });
});
