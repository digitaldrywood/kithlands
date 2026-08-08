import { describe, it, expect } from "vitest";
import {
  attackFrameIndex,
  attackSheetKey,
  nextWalkFrame,
  walkSheetKey,
  walkFrameIndex,
  walkFrameForProgress,
  walkFramePose,
  walkSpritePosition,
  walkSpriteScale,
  nextLeaderIndex,
  WALK_FRAME_COUNT,
  WALK_DIRS,
  WALK_SHEET_FORMATS,
  WALK_FRAME_POSES,
  WALK_SHEET_CLASS_IDS,
  walkFrameCount,
  walkFrameSequence,
  walkSheetFrameSize,
  walkSheetGeometryForClass,
} from "./walkFrame.js";

describe("nextWalkFrame", () => {
  it("advances through the walk cycle frames", () => {
    expect(nextWalkFrame(0)).toBe(1);
    expect(nextWalkFrame(1)).toBe(2);
    expect(nextWalkFrame(4)).toBe(5);
  });

  it("wraps the final frame back to 0", () => {
    expect(nextWalkFrame(5)).toBe(0);
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
  it.each(WALK_SHEET_CLASS_IDS)("builds %s_walk", (cls) => {
    expect(walkSheetKey(cls)).toBe(`${cls}_walk`);
  });

  it.each(WALK_SHEET_CLASS_IDS)("builds %s_attack", (cls) => {
    expect(attackSheetKey(cls)).toBe(`${cls}_attack`);
  });
});

describe("walkFrameIndex", () => {
  it("maps warrior to the skill-native south/north/west/east rows", () => {
    expect(walkFrameIndex("down", 0, "warrior")).toBe(0);
    expect(walkFrameIndex("right", 0, "warrior")).toBe(12);
    expect(walkFrameIndex("up", 0, "warrior")).toBe(24);
    expect(walkFrameIndex("left", 0, "warrior")).toBe(36);
  });

  it("maps regenerated classes to the skill-native 8-direction rows", () => {
    expect(walkFrameIndex("down", 0, "brawler")).toBe(0);
    expect(walkFrameIndex("right", 0, "brawler")).toBe(16);
    expect(walkFrameIndex("up", 0, "brawler")).toBe(32);
    expect(walkFrameIndex("left", 0, "brawler")).toBe(48);
  });

  it.each(WALK_DIRS)("covers every warrior frame for %s", (dir) => {
    const geometry = walkSheetGeometryForClass("warrior");
    const base = walkFrameIndex(dir, 0, "warrior");
    for (let frame = 0; frame < WALK_FRAME_COUNT; frame++) {
      expect(walkFrameIndex(dir, frame, "warrior")).toBe(base + frame);
    }
    expect(geometry.columns).toBe(WALK_FRAME_COUNT);
  });

  it("produces a unique index for every warrior movement row/frame pair", () => {
    const seen = new Set();
    for (const dir of WALK_DIRS) {
      for (let f = 0; f < WALK_FRAME_COUNT; f++) {
        seen.add(walkFrameIndex(dir, f, "warrior"));
      }
    }
    expect(seen.size).toBe(WALK_DIRS.length * WALK_FRAME_COUNT);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(41);
  });
});

describe("walkFrameForProgress", () => {
  it("spreads the six skill walking frames across one warrior tile step", () => {
    expect(walkFrameForProgress(0, "warrior")).toBe(0);
    expect(walkFrameForProgress(0.16, "warrior")).toBe(0);
    expect(walkFrameForProgress(0.17, "warrior")).toBe(1);
    expect(walkFrameForProgress(0.5, "warrior")).toBe(3);
    expect(walkFrameForProgress(0.875, "warrior")).toBe(5);
  });

  it("preserves eight-frame progress for regenerated native sheets", () => {
    expect(walkFrameForProgress(0.5, "brawler")).toBe(4);
    expect(walkFrameForProgress(0.875, "brawler")).toBe(7);
  });

  it("clamps bad progress values", () => {
    expect(walkFrameForProgress(-1, "warrior")).toBe(0);
    expect(walkFrameForProgress(2, "warrior")).toBe(5);
  });
});

describe("walkFramePose", () => {
  it("documents the required 6-frame skill walk-cycle pose sequence", () => {
    expect(WALK_FRAME_POSES.map((pose) => pose.id)).toEqual([
      "contact-a",
      "down-a",
      "passing-a",
      "high-a",
      "contact-b",
      "down-b",
    ]);
  });

  it("wraps pose lookup for repeated animation loops", () => {
    expect(walkFramePose(0).label).toBe("Contact A");
    expect(walkFramePose(6).label).toBe("Contact A");
  });
});

describe("walk sheet geometry", () => {
  it("loads warrior as native Game Character 64 geometry", () => {
    expect(walkSheetGeometryForClass("warrior")).toMatchObject({
      formatId: "gameCharacter64",
      cellSize: 64,
      columns: 6,
      rows: 8,
    });
    expect(walkSheetFrameSize("warrior")).toBe(64);
    expect(walkFrameCount("warrior")).toBe(6);
    expect(walkFrameSequence("warrior")).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("loads regenerated Cinder as native six-frame geometry", () => {
    expect(walkSheetGeometryForClass("cinder")).toMatchObject({
      formatId: "gameCharacter64",
      cellSize: 64,
      columns: 6,
      rows: 8,
    });
    expect(walkFrameCount("cinder")).toBe(6);
    expect(walkFrameSequence("cinder")).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("loads brawler as native 8-step Game Character 64 geometry", () => {
    expect(walkSheetGeometryForClass("brawler")).toMatchObject({
      formatId: "gameCharacter64Eight",
      cellSize: 64,
      columns: 8,
      rows: 8,
    });
    expect(walkSheetFrameSize("brawler")).toBe(64);
    expect(walkFrameCount("brawler")).toBe(8);
    expect(walkFrameSequence("brawler")).toEqual(
      WALK_SHEET_FORMATS.gameCharacter64Eight.stepFrameSequence,
    );
  });
});

describe("walk sprite placement", () => {
  it("scales a native 64px warrior frame to a readable overland tile size", () => {
    expect(walkSpriteScale(32, "warrior")).toBeCloseTo(1);
  });

  it("scales regenerated native sheets to the same readable overland size", () => {
    expect(walkSpriteScale(32, "brawler")).toBeCloseTo(1);
  });

  it("anchors the sprite to the bottom center of a tile", () => {
    expect(walkSpritePosition(3, 4, 32)).toEqual({ x: 112, y: 160 });
  });

  it("supports interior room offsets", () => {
    expect(walkSpritePosition(3, 4, 32, 10, 20)).toEqual({
      x: 122,
      y: 180,
    });
  });
});

describe("attackFrameIndex", () => {
  it("maps attack rows to the native 8-direction attack atlas", () => {
    expect(attackFrameIndex("down", 0)).toBe(0);
    expect(attackFrameIndex("right", 0)).toBe(16);
    expect(attackFrameIndex("up", 0)).toBe(32);
    expect(attackFrameIndex("left", 0)).toBe(48);
    expect(attackFrameIndex("right", 7)).toBe(23);
  });
});

describe("nextLeaderIndex", () => {
  const alive = (hp = 100) => ({ hp });
  const dead = () => ({ hp: 0 });

  it("cycles 0 -> 1 -> 2 -> 3 -> 0 with all alive", () => {
    const party = [alive(), alive(), alive(), alive()];
    expect(nextLeaderIndex(party, 0)).toBe(1);
    expect(nextLeaderIndex(party, 1)).toBe(2);
    expect(nextLeaderIndex(party, 2)).toBe(3);
    expect(nextLeaderIndex(party, 3)).toBe(0);
  });

  it("skips dead member at slot 1", () => {
    const party = [alive(), dead(), alive(), alive()];
    expect(nextLeaderIndex(party, 0)).toBe(2);
  });

  it("skips multiple consecutive dead members", () => {
    const party = [alive(), dead(), dead(), alive()];
    expect(nextLeaderIndex(party, 0)).toBe(3);
  });

  it("wraps around skipping dead members at the end", () => {
    const party = [alive(), alive(), dead(), dead()];
    expect(nextLeaderIndex(party, 1)).toBe(0);
  });

  it("returns 0 for single-member party", () => {
    expect(nextLeaderIndex([alive()], 0)).toBe(0);
  });

  it("stays on current when all others are dead", () => {
    const party = [alive(), dead(), dead(), dead()];
    expect(nextLeaderIndex(party, 0)).toBe(0);
  });

  it("returns 0 for null party", () => {
    expect(nextLeaderIndex(null, 0)).toBe(0);
  });

  it("returns 0 for empty party", () => {
    expect(nextLeaderIndex([], 0)).toBe(0);
  });
});
