import { describe, expect, it } from "vitest";
import { equipmentBuildMoveLabel } from "./equipment_builds.js";

describe("saved build move descriptions", () => {
  it("names affected characters, slots, and both items", () => {
    expect(
      equipmentBuildMoveLabel({
        character_name: "Ayla",
        slot_name: "Ring II",
        from: { name: "Copper Ring" },
        to: { name: "Silver Ring" },
      }),
    ).toBe("Ayla · Ring II: Copper Ring → Silver Ring");
  });
  it("explains cleared donor slots and previously empty destinations", () => {
    expect(
      equipmentBuildMoveLabel({
        character_name: "Mira",
        slot_name: "Ring I",
        from: { name: "Copper Ring" },
      }),
    ).toBe("Mira · Ring I: Copper Ring → Empty");
    expect(
      equipmentBuildMoveLabel({
        character_name: "Ayla",
        slot_name: "Ring II",
        to: { name: "Copper Ring" },
      }),
    ).toBe("Ayla · Ring II: Empty → Copper Ring");
  });
});
