import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ saveGame: vi.fn() }));
vi.mock("../api.js", async (importOriginal) => ({
  ...(await importOriginal()),
  saveGame: apiMocks.saveGame,
}));

import {
  buildLegacyQuestLogModel,
  buildPartyMemberScanContext,
  saveFromPartyMenu,
} from "./world_menu.js";

beforeEach(() => vi.clearAllMocks());

describe("party menu scan context", () => {
  it("reports remaining experience and suppresses normal status", () => {
    expect(
      buildPartyMemberScanContext({ xp: 26, xp_next: 70, status: "normal" }),
    ).toEqual({ xpRemaining: 44, status: "" });
  });

  it("normalizes abnormal status for compact display", () => {
    expect(
      buildPartyMemberScanContext({
        xp: 70,
        xp_next: 70,
        status: "turned_to_stone",
      }),
    ).toEqual({ xpRemaining: 0, status: "TURNED TO STONE" });
  });

  it("adds a color-independent HP warning to the scan line", () => {
    expect(
      buildPartyMemberScanContext({
        hp: 18,
        max_hp: 100,
        xp: 10,
        xp_next: 30,
        status: "poison",
      }),
    ).toEqual({ xpRemaining: 20, status: "POISON · CRITICAL" });
  });

  it("labels a defeated member as KO even when another status is stale", () => {
    expect(
      buildPartyMemberScanContext({
        hp: 0,
        max_hp: 100,
        xp: 10,
        xp_next: 30,
        status: "poison",
      }),
    ).toEqual({ xpRemaining: 20, status: "KO" });
  });
});

describe("legacy quest log hidden objectives", () => {
  const currentQuest = {
    template_id: "Q01",
    name: "Find the old road",
    description: "Search beyond the village.",
  };

  it("does not count or expose an opaque upcoming quest before reveal", () => {
    const model = buildLegacyQuestLogModel([currentQuest, { hidden: true }], 0);

    expect(model.remainingCount).toBe(1);
    expect(model.upcoming).toEqual([]);
    expect(model.upcoming.map((quest) => quest.name)).not.toContain(undefined);
  });

  it("includes the quest normally after the server reveals it", () => {
    const revealedQuest = {
      template_id: "Q02",
      name: "The Forgotten Shrine",
      description: "Follow the newly uncovered trail.",
    };
    const model = buildLegacyQuestLogModel([currentQuest, revealedQuest], 0);

    expect(model.remainingCount).toBe(2);
    expect(model.upcoming).toEqual([revealedQuest]);
    expect(model.upcoming.map((quest) => quest.name)).toEqual([
      "The Forgotten Shrine",
    ]);
  });
});

describe("party menu save location", () => {
  it.each([
    ["town", "settlement"],
    ["direct town", "world"],
    ["inn", "interior"],
    ["dungeon", "dungeon"],
  ])(
    "saves from %s without submitting room coordinates",
    async (sceneKey, kind) => {
      apiMocks.saveGame.mockResolvedValue({ status: "saved" });
      const scene = {
        scene: { key: sceneKey === "dungeon" ? "Dungeon" : "Town" },
        playerX: 5,
        playerY: 7,
        gameState: { id: "game-1", current_location: { kind } },
      };

      await expect(
        saveFromPartyMenu(scene, `${sceneKey} save`),
      ).resolves.toEqual({
        status: "saved",
      });
      expect(apiMocks.saveGame).toHaveBeenCalledWith(
        "game-1",
        `${sceneKey} save`,
        null,
      );
    },
  );
});
