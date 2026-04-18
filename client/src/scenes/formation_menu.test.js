import { describe, expect, it } from "vitest";

import {
  buildFormationDraft,
  buildFormationPayload,
  buildPreviewDraft,
  swapDraftSlots,
} from "./formation_menu.js";

describe("buildFormationDraft", () => {
  it("preserves original slots and normalizes row defaults", () => {
    const draft = buildFormationDraft([
      { name: "Ayla", class_id: "warrior", max_hp: 100, max_mp: 0 },
      {
        name: "Mira",
        class_id: "mender",
        max_hp: 30,
        max_mp: 12,
        row: "front",
      },
      { name: "Cato", class_id: "cinder", max_hp: 24, max_mp: 10 },
    ]);

    expect(draft.map((member) => member.originalSlot)).toEqual([0, 1, 2]);
    expect(draft.map((member) => member.row)).toEqual([
      "front",
      "front",
      "back",
    ]);
  });
});

describe("swapDraftSlots", () => {
  it("returns a reordered copy without mutating the original draft", () => {
    const draft = buildFormationDraft([
      { name: "Ayla", class_id: "warrior", row: "front" },
      { name: "Mira", class_id: "mender", row: "back" },
      { name: "Cato", class_id: "cinder", row: "back" },
    ]);

    const swapped = swapDraftSlots(draft, 0, 2);

    expect(draft.map((member) => member.name)).toEqual([
      "Ayla",
      "Mira",
      "Cato",
    ]);
    expect(swapped.map((member) => member.name)).toEqual([
      "Cato",
      "Mira",
      "Ayla",
    ]);
  });
});

describe("buildPreviewDraft", () => {
  it("shows the pending swap target while a pick is active", () => {
    const draft = buildFormationDraft([
      { name: "Ayla", class_id: "warrior", row: "front" },
      { name: "Mira", class_id: "mender", row: "back" },
      { name: "Cato", class_id: "cinder", row: "back" },
    ]);

    const preview = buildPreviewDraft(draft, 0, 2);

    expect(preview.map((member) => member.name)).toEqual([
      "Cato",
      "Mira",
      "Ayla",
    ]);
  });
});

describe("buildFormationPayload", () => {
  it("emits the server permutation and final rows from the draft order", () => {
    const swapped = swapDraftSlots(
      buildFormationDraft([
        { name: "Ayla", class_id: "warrior", row: "front" },
        { name: "Mira", class_id: "mender", row: "back" },
        { name: "Cato", class_id: "cinder", row: "back" },
      ]),
      0,
      2,
    ).map((member, slot) => (slot === 2 ? { ...member, row: "back" } : member));

    const payload = buildFormationPayload(swapped);

    expect(payload.reorder).toEqual([2, 1, 0]);
    expect(payload.updates).toEqual([
      { slot: 0, row: "back" },
      { slot: 1, row: "back" },
      { slot: 2, row: "back" },
    ]);
  });
});
