import { describe, it, expect } from "vitest";
import { groupSaveAdventures } from "./title_saves.js";

describe("save adventure grouping", () => {
  it("shows a newer autosave ahead of manual saves while keeping distinct runs", () => {
    const saves = [
      {
        id: "manual",
        adventure_id: "run",
        name: "Same name",
        updated_at: "2026-10-11T10:00:00Z",
      },
      {
        id: "other-run",
        adventure_id: "other",
        name: "Same name",
        updated_at: "2026-10-11T11:00:00Z",
      },
      {
        id: "auto",
        adventure_id: "run",
        save_type: "autosave",
        updated_at: "2026-10-11T12:00:00Z",
      },
    ];
    expect(
      groupSaveAdventures(saves).map((group) => group.map((save) => save.id)),
    ).toEqual([["auto", "manual"], ["other-run"]]);
    expect(saves[0].id).toBe("manual");
  });
  it("does not merge unnamed legacy adventures or ambiguous dates", () => {
    expect(
      groupSaveAdventures([
        { id: "a", name: "Same", updated_at: "bad" },
        { id: "b", name: "Same" },
      ]),
    ).toHaveLength(2);
    expect(groupSaveAdventures([])).toEqual([]);
  });
});
