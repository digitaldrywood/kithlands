import { describe, expect, it } from "vitest";
import { questMilestone } from "./quest_milestone.js";
const before = {
  id: "adventure",
  quests: [{ id: "q1", completed: false }],
  party: [
    { name: "Hero", level: 1 },
    { name: "Sparks", level: 2 },
  ],
};
const after = {
  id: "adventure",
  quests: [
    {
      id: "q1",
      completed: true,
      name: "Delivery",
      reward: { xp: 180, gold: 30 },
    },
  ],
  party: [
    { name: "Hero", level: 3 },
    { name: "Sparks", level: 2 },
  ],
};
describe("quest milestone from server responses", () => {
  it("shows the awarded reward and actual level changes", () => {
    expect(questMilestone(before, after)).toEqual({
      key: "adventure:q1",
      name: "Delivery",
      reward: { xp: 180, gold: 30 },
      levels: [{ name: "Hero", level: 3 }],
    });
  });
  it("does not celebrate replay, a loaded completed quest, or rejected actions", () => {
    expect(questMilestone(after, after)).toBeNull();
    expect(questMilestone(undefined, after)).toBeNull();
    expect(questMilestone(before, { ...after, error: "rejected" })).toBeNull();
  });
  it("does not combine different adventures or infer reordered member levels", () => {
    expect(questMilestone(before, { ...after, id: "another" })).toBeNull();
    expect(
      questMilestone(before, {
        ...after,
        party: [
          { name: "Sparks", level: 3 },
          { name: "Hero", level: 3 },
        ],
      }).levels,
    ).toEqual([]);
  });
  it("still reports quest rewards when nobody levels", () => {
    expect(
      questMilestone(before, { ...after, party: before.party }).levels,
    ).toEqual([]);
  });
});
