import { afterEach, expect, it, vi } from "vitest";
import { gameAction, setToken } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
  setToken(null);
});

it("sends ordinary game inputs without requiring request options", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ json: async () => ({ phase: "world" }) });
  vi.stubGlobal("fetch", fetch);
  await expect(
    gameAction("game", { type: "battle_continue" }),
  ).resolves.toEqual({ phase: "world" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/game/game/action",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ type: "battle_continue" }),
    }),
  );
});

it("forwards cancellation to the actual action fetch", async () => {
  const controller = new AbortController();
  const fetch = vi.fn((_url, options) => {
    if (!options.signal)
      return Promise.resolve({ json: async () => ({ phase: "world" }) });
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () =>
        reject(new DOMException("Request aborted", "AbortError")),
      );
    });
  });
  vi.stubGlobal("fetch", fetch);
  const pending = gameAction(
    "game",
    { type: "battle_continue" },
    { signal: controller.signal },
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/game/game/action",
    expect.objectContaining({ signal: controller.signal }),
  );
});
