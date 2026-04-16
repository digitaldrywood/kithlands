import { describe, expect, it } from "vitest";

import { GRID_DIMENSION, buildSheetCells, debuggerCatalog } from "./model.js";
import { WALK_SHEET_CLASS_IDS, WALK_DIRS } from "../scenes/walkFrame.js";

describe("sprite debugger model", () => {
  it("uses the runtime walk-sheet class list for debugger coverage", () => {
    expect(debuggerCatalog.walkSheets.map((sheet) => sheet.id)).toEqual(
      WALK_SHEET_CLASS_IDS,
    );
  });

  it("slices a 4x4 walk sheet into inspectable cells with direction metadata", () => {
    const cells = buildSheetCells(512, 512);

    expect(GRID_DIMENSION).toBe(4);
    expect(cells).toHaveLength(16);
    expect(cells[0]).toMatchObject({
      id: "r0-c0",
      direction: WALK_DIRS[0],
      row: 0,
      col: 0,
      width: 128,
      height: 128,
      x: 0,
      y: 0,
    });
    expect(cells.at(-1)).toMatchObject({
      id: "r3-c3",
      direction: WALK_DIRS[3],
      row: 3,
      col: 3,
      width: 128,
      height: 128,
      x: 384,
      y: 384,
    });
  });

  it("rejects sheet dimensions that cannot form an even 4x4 grid", () => {
    expect(() => buildSheetCells(510, 512)).toThrow(/4x4/i);
    expect(() => buildSheetCells(512, 510)).toThrow(/4x4/i);
  });
});
