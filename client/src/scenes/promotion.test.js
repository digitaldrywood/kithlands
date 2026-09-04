import { describe, expect, it } from "vitest";
import { promotionPreview } from "./promotion.js";

describe("promotion metadata", () => {
  it("uses the server catalog instead of a client class map", () => {
    expect(
      promotionPreview({ name: "Ayla", class_id: "new-class", level: 8 }, [
        {
          id: "new-class",
          name: "Trailkeeper",
          promoted_name: "Pathfinder",
          magic: { promoted_schools: ["white"], promoted_max_spell_level: 4 },
        },
      ]),
    ).toEqual({
      name: "Ayla",
      current: "Trailkeeper · Lv. 8",
      destination: "Pathfinder",
      magic: "white magic · up to tier 4",
    });
  });
  it("still presents the party when metadata is unavailable", () => {
    expect(
      promotionPreview(
        { name: "Ayla", class_id: "warrior", class_name: "Warrior", level: 8 },
        [],
      ),
    ).toMatchObject({
      name: "Ayla",
      current: "Warrior · Lv. 8",
      destination: "Advanced class",
      magic: "",
    });
  });
});
