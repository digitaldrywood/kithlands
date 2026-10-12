import { describe, it, expect, vi } from "vitest";
vi.mock("../api.js", () => ({
  gatherResource: vi.fn(),
  getResourceStatus: vi.fn(),
}));
import { getResourceStatus } from "../api.js";
import { resourceTerrain, refreshExpiredResources } from "./world_gathering.js";

describe("resource territories and authoritative refresh", () => {
  it("blends habitat ground without changing traversal, roads or water", () => {
    const tiles = [
      [0, 1, 2],
      [9, 5, 11],
    ];
    const nodes = [
      {
        surface_tile: 11,
        habitat_tiles: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ];
    expect(resourceTerrain(tiles, nodes)).toEqual([
      [11, 1, 2],
      [9, 5, 11],
    ]);
    expect(tiles).toEqual([
      [0, 1, 2],
      [9, 5, 11],
    ]);
  });
  it("does not refresh before due or during a gathering mutation", async () => {
    getResourceStatus.mockClear();
    await refreshExpiredResources({ resourceRefreshAt: Infinity });
    await refreshExpiredResources({
      resourceRefreshAt: 0,
      gatheringPending: true,
    });
    expect(getResourceStatus).not.toHaveBeenCalled();
  });
  it("discards a reply after a newer game-state mutation", async () => {
    let resolve;
    getResourceStatus.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const scene = {
      resourceRefreshAt: 0,
      gameState: { id: "test", resources: [{ id: "old" }] },
      scene: { isActive: () => true },
    };
    const pending = refreshExpiredResources(scene);
    scene.gameState = { id: "test", resources: [{ id: "new" }] };
    resolve({ resources: [{ id: "stale" }] });
    await pending;
    expect(scene.gameState.resources[0].id).toBe("new");
    expect(scene.resourceRefreshPending).toBe(false);
  });
  it("retries failed confirmation without locally respawning a node", async () => {
    getResourceStatus.mockResolvedValueOnce({ error: "offline" });
    const scene = {
      resourceRefreshAt: 0,
      gameState: { id: "test", resources: [{ gathered: true }] },
      scene: { isActive: () => true },
    };
    await refreshExpiredResources(scene);
    expect(scene.gameState.resources[0].gathered).toBe(true);
    expect(scene.resourceRefreshAt).toBeGreaterThan(performance.now());
  });
});
