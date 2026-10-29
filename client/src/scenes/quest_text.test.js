import { describe, expect, it, vi } from "vitest";
import { questObjectiveText, questCustodyText } from "./quest_text.js";
import {
  nearbyQuestObjective,
  syncTownObjectiveVisibility,
} from "./town_objectives.js";

const quest = {
  id: "delivery",
  description: "A misleading generated description about monsters",
  objectives: { step: 1, item: "sealed parcel" },
  actions: [
    { type: "goto", location: "mill", text: "Travel to the mill." },
    {
      type: "give",
      location: "mill",
      text: "Deliver the parcel to the keeper.",
      prompt: "Deliver parcel",
    },
  ],
};

describe("staged quest presentation", () => {
  it("uses authoritative progress and custody instead of guessing from prose", () => {
    expect(questObjectiveText(quest)).toBe(
      "2/2 · Deliver the parcel to the keeper.",
    );
    expect(questCustodyText(quest)).toBe("Carrying: sealed parcel");
    expect(
      questCustodyText({ objectives: { clue: "The upper route is safe." } }),
    ).toContain("upper route is safe");
  });
  it("shows the server-owned traveler and reunion destination", () => {
    expect(
      questCustodyText({
        giver_name: "North lodge",
        objectives: { companion: "lost traveler", clue: "found" },
      }),
    ).toBe("Traveling with you: lost traveler · Return to North lodge.");
  });
  it("offers actions only beside the local ground-floor keeper", () => {
    const scene = {
      gameState: { current_quest: 0, quests: [quest] },
      spawn: { node_id: "mill" },
      floorIndex: 0,
      nearNpcIndex: 0,
    };
    expect(nearbyQuestObjective(scene)?.action.prompt).toBe("Deliver parcel");
    for (const change of [
      { floorIndex: 1 },
      { nearNpcIndex: 1 },
      { nearNpcIndex: -1 },
      { spawn: { node_id: "elsewhere" } },
    ]) {
      expect(nearbyQuestObjective({ ...scene, ...change })).toBeNull();
    }
  });
  it("hides the objective banner while an overlay owns the scene", () => {
    const setVisible = vi.fn();
    const scene = { objectiveText: { setVisible }, menuOpen: false };
    expect(syncTownObjectiveVisibility(scene)).toBe(true);
    scene._modalLocks = new Set(["party_menu"]);
    expect(syncTownObjectiveVisibility(scene)).toBe(false);
    scene._modalLocks.clear();
    expect(syncTownObjectiveVisibility(scene)).toBe(true);
    expect(setVisible.mock.calls).toEqual([[true], [false], [true]]);
  });
});
