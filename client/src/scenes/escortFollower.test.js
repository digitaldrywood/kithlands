import { describe, it, expect } from "vitest";
import { followerPoint } from "./escortFollower.js";
describe("escort breadcrumb route", () => {
  it("follows a corner rather than cutting straight through the wall", () => {
    const points = [
      { x: 0, y: 0, distance: 0 },
      { x: 32, y: 0, distance: 32 },
      { x: 32, y: 32, distance: 64 },
    ];
    expect(followerPoint(points, 16)).toEqual({ x: 16, y: 0 });
    expect(followerPoint(points, 48)).toEqual({ x: 32, y: 16 });
    expect(points).toHaveLength(2);
  });
  it("clamps before the first route sample and tolerates a stationary start", () => {
    expect(
      followerPoint(
        [
          { x: 4, y: 9, distance: 0 },
          { x: 4, y: 9, distance: 0 },
        ],
        -24,
      ),
    ).toEqual({ x: 4, y: 9 });
  });
});
