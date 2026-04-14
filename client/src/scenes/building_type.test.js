import { describe, expect, it } from "vitest";
import { buildingTypeFromTags, isRestBuilding } from "./building_type.js";

describe("buildingTypeFromTags", () => {
  it("maps house tags to house interiors", () => {
    expect(buildingTypeFromTags(["house"])).toBe("house");
  });

  it("maps safehouse tags to house interiors", () => {
    expect(buildingTypeFromTags(["safehouse"])).toBe("house");
  });

  it("still preserves other specialized building types", () => {
    expect(buildingTypeFromTags(["rest"])).toBe("inn");
    expect(buildingTypeFromTags(["shop"])).toBe("shop");
    expect(buildingTypeFromTags(["temple"])).toBe("temple");
  });

  it("treats inns, houses, and safehouses as rest buildings", () => {
    expect(isRestBuilding(["rest"])).toBe(true);
    expect(isRestBuilding(["house"])).toBe(true);
    expect(isRestBuilding(["safehouse"])).toBe(true);
    expect(isRestBuilding(["temple"])).toBe(false);
  });
});
