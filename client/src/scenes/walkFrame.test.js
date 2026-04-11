import { describe, it, expect } from "vitest";
import { nextWalkFrame, walkTextureKey, WALK_FRAME_COUNT } from "./walkFrame.js";

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

describe("walkTextureKey", () => {
  it.each(["up", "down", "left", "right"])(
    "builds walk_%s_<frame> for each direction",
    (dir) => {
      expect(walkTextureKey(dir, 0)).toBe(`walk_${dir}_0`);
      expect(walkTextureKey(dir, 3)).toBe(`walk_${dir}_3`);
    },
  );
});
