import { describe, expect, it } from "vitest";
import { questObjectiveText, questCustodyText } from "./quest_text.js";
import { nearbyQuestObjective } from "./town_objectives.js";

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
});
