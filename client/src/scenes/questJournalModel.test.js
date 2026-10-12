import { describe, expect, it } from "vitest";
import {
  questJournalModel,
  trackQuest,
  trackedQuestID,
} from "./questJournalModel.js";

const state = {
  id: "game-a",
  current_quest: 0,
  quests: [
    { name: "Recover the bell", target_name: "Library" },
    { name: "Secret", hidden: true },
  ],
  dungeon_entries: [
    {
      id: "old-mill",
      title: "The Old Mill",
      label: "Old Mill trail",
      objective: "Read the ledger",
      started: true,
      journal: ["The split oak marks the trail"],
    },
  ],
};
describe("unified quest journal", () => {
  it("keeps undiscovered campaign quests hidden alongside available stories", () => {
    const model = questJournalModel(state);
    expect(model.tracker.title).toBe("Recover the bell");
    expect(model.upcoming).toEqual([]);
    expect(model.entries[0].journal).toEqual(state.dungeon_entries[0].journal);
  });
  it("shows travel and remembered objective after retreat", () => {
    expect(
      questJournalModel(state, "dungeon:old-mill").tracker.detail,
    ).toContain("Continue: Read the ledger");
  });
  it("uses active room progress even when the campaign was tracked", () => {
    const model = questJournalModel({
      ...state,
      dungeon: {
        id: "old-mill",
        objective: "Fit the handle",
        journal: ["Handle found"],
      },
    });
    expect(model.tracker.detail).toBe("Fit the handle");
    expect(model.entries[0].journal).toEqual(["Handle found"]);
  });
  it("returns to the campaign when the tracked story is complete", () => {
    const model = questJournalModel(
      {
        ...state,
        dungeon_entries: [{ ...state.dungeon_entries[0], completed: true }],
      },
      "dungeon:old-mill",
    );
    expect(model.tracker.key).toBe("campaign");
  });
  it("shares tracking across scenes but does not carry it into another save", () => {
    const data = new Map();
    const registry = {
      get: (key) => data.get(key),
      set: (key, value) => data.set(key, value),
    };
    trackQuest({ registry, gameState: state }, "dungeon:old-mill");
    expect(trackedQuestID({ registry, gameState: state })).toBe(
      "dungeon:old-mill",
    );
    expect(trackedQuestID({ registry, gameState: { id: "game-b" } })).toBe(
      "campaign",
    );
  });
  it("handles empty and legacy quest state", () => {
    expect(questJournalModel({}).tracker.title).toBe("Campaign Complete");
    expect(trackedQuestID({ gameState: {} })).toBe("campaign");
  });
});
