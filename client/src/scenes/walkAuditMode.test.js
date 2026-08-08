import { describe, expect, it } from "vitest";
import {
  buildWalkAuditParty,
  walkAuditHUDText,
  walkAuditRequested,
} from "./walkAuditMode.js";
import { WALK_SHEET_CLASS_IDS } from "./walkFrame.js";

describe("walk audit mode", () => {
  it("recognizes only the explicit development route flag", () => {
    expect(walkAuditRequested("?walkAudit=1")).toBe(true);
    expect(walkAuditRequested("?walkAudit=0")).toBe(false);
    expect(walkAuditRequested("?noEncounters=1")).toBe(false);
  });

  it("builds one living party member for every runtime walk sheet", () => {
    const party = buildWalkAuditParty([
      { hp: 12, max_hp: 35, level: 1, class_id: "warrior" },
    ]);

    expect(party.map((member) => member.sprite_id)).toEqual(
      WALK_SHEET_CLASS_IDS,
    );
    expect(party).toHaveLength(12);
    expect(party.every((member) => member.hp === member.max_hp)).toBe(true);
    expect(party.find((member) => member.sprite_id === "knight").class_id).toBe(
      "warrior",
    );
  });

  it("shows the active class without overflowing the HUD with all members", () => {
    const party = buildWalkAuditParty();
    expect(walkAuditHUDText(party, 6)).toBe(
      "WALK AUDIT 7/12 | Knight | Space: next class",
    );
  });
});
