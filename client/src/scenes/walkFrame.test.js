import { describe, it, expect } from "vitest";
import {
  nextWalkFrame,
  walkSheetKey,
  walkFrameIndex,
  WALK_FRAME_COUNT,
  WALK_DIRS,
  WALK_DIR_INDEX,
} from "./walkFrame.js";

describe("nextWalkFrame", () => {
  it("advances 0 -> 1 -> 2 -> 3", () => {
    expect(nextWalkFrame(0)).toBe(1);
    expect(nextWalkFrame(1)).toBe(2);
    expect(nextWalkFrame(2)).toBe(3);
  });

  it("wraps 3 back to 0", () => {
    expect(nextWalkFrame(3)).toBe(0);
  });

  it("returns to the start after WALK_FRAME_COUNT applications", () => {
    let f = 0;
    for (let i = 0; i < WALK_FRAME_COUNT; i++) f = nextWalkFrame(f);
    expect(f).toBe(0);
  });

  it("treats an out-of-range previous frame as a wrap", () => {
    expect(nextWalkFrame(WALK_FRAME_COUNT)).toBe(1);
  });
});

describe("walkSheetKey", () => {
  it.each([
    "warrior",
    "brawler",
    "rogue",
    "mender",
    "cinder",
    "wayfarer",
    "knight",
    "champion",
    "shadow",
    "sage",
    "pyromancer",
    "wanderer",
  ])("builds %s_walk", (cls) => {
    expect(walkSheetKey(cls)).toBe(`${cls}_walk`);
  });
});

describe("walkFrameIndex", () => {
  it("maps down row 0, up row 1, left row 2, right row 3", () => {
    expect(WALK_DIR_INDEX.down).toBe(0);
    expect(WALK_DIR_INDEX.up).toBe(1);
    expect(WALK_DIR_INDEX.left).toBe(2);
    expect(WALK_DIR_INDEX.right).toBe(3);
  });

  it.each(WALK_DIRS)("covers all 4 frames for %s", (dir) => {
    const base = WALK_DIR_INDEX[dir] * WALK_FRAME_COUNT;
    expect(walkFrameIndex(dir, 0)).toBe(base + 0);
    expect(walkFrameIndex(dir, 1)).toBe(base + 1);
    expect(walkFrameIndex(dir, 2)).toBe(base + 2);
    expect(walkFrameIndex(dir, 3)).toBe(base + 3);
  });

  it("produces a unique index for every (dir, frame) pair", () => {
    const seen = new Set();
    for (const dir of WALK_DIRS) {
      for (let f = 0; f < WALK_FRAME_COUNT; f++) {
        seen.add(walkFrameIndex(dir, f));
      }
    }
    expect(seen.size).toBe(WALK_DIRS.length * WALK_FRAME_COUNT);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(WALK_DIRS.length * WALK_FRAME_COUNT - 1);
  });
});
