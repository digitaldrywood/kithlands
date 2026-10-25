import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { interactWithNpc } from "../api.js";
import { performQuestObjective } from "./town_objectives.js";
import { openDialogue } from "./town_dialogue.js";
import { openShop } from "./world_shop.js";

vi.mock("../api.js", async (importOriginal) => ({
  ...(await importOriginal()),
  interactWithNpc: vi.fn(),
}));
vi.mock("./town_objectives.js", async (importOriginal) => ({
  ...(await importOriginal()),
  performQuestObjective: vi.fn(),
}));
vi.mock("./town_dialogue.js", () => ({ openDialogue: vi.fn() }));
vi.mock("./world_shop.js", () => ({ openShop: vi.fn() }));
let TownScene;
beforeAll(async () => {
  vi.stubGlobal("Phaser", { Scene: class {} });
  ({ TownScene } = await import("./town.js"));
});
beforeEach(() => {
  vi.clearAllMocks();
  interactWithNpc.mockResolvedValue({ dialogue: { lines: ["Welcome"] } });
  openDialogue.mockResolvedValue();
});
function fixture() {
  const scene = new TownScene();
  Object.assign(scene, {
    gameState: { id: "game" },
    spawn: { node_id: "shop", tags: ["shop"] },
    nearNpcIndex: 0,
    npcs: [{ isProprietor: true }],
    hideInteractPrompt: vi.fn(),
    showInteractPrompt: vi.fn(),
    openNearbyChest: vi.fn(async () => false),
  });
  return scene;
}
it("serializes confirmations before asynchronous objective and NPC work", async () => {
  const releases = [];
  performQuestObjective.mockImplementation(
    () => new Promise((resolve) => releases.push(resolve)),
  );
  const scene = fixture();
  const first = scene.interact(),
    second = scene.interact();
  const attempts = releases.length;
  releases.forEach((resolve) => resolve(false));
  await Promise.all([first, second]);
  expect(attempts).toBe(1);
  expect(interactWithNpc).toHaveBeenCalledTimes(1);
  expect(openDialogue).toHaveBeenCalledTimes(1);
  expect(openShop).toHaveBeenCalledTimes(1);
  expect([...scene._modalLocks]).toEqual([]);
});
it("allows retry after an interaction request fails", async () => {
  const scene = fixture();
  performQuestObjective.mockRejectedValueOnce(new Error("request failed"));
  await expect(scene.interact()).rejects.toThrow("request failed");
  performQuestObjective.mockResolvedValue(false);
  await scene.interact();
  expect(openShop).toHaveBeenCalledTimes(1);
  expect([...scene._modalLocks]).toEqual([]);
});
