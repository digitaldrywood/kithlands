import { expect, it } from "vitest";
import { combatReadTime } from "./combat_read_time.js";
it("leaves a reading period after the typewriter finishes", () => {
  expect(combatReadTime("Hero attacks Goblin!", 30)).toBeGreaterThanOrEqual(
    19 * 30 + 1000,
  );
  expect(combatReadTime("Miss", 0)).toBe(1500);
  expect(combatReadTime("", 30)).toBe(0);
  expect(combatReadTime("x".repeat(1000), 80)).toBe(6000);
});
