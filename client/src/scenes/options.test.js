import { beforeEach, describe, expect, it } from "vitest";
import { OPTIONS_ROWS, nudgeOption } from "./options_settings.js";
import {
  getBattleSpeed,
  getLongCinematicMode,
  getMessageSpeed,
  getWalkSpeed,
} from "../systems/prefs.js";

beforeEach(() => {
  OPTIONS_ROWS.forEach((row) => row.set(row.min));
});

describe("Options preference controls", () => {
  it("uses the existing speed ranges and fastest-to-slowest direction", () => {
    expect(OPTIONS_ROWS.slice(0, 3).map((row) => [row.min, row.max])).toEqual([
      [1, 6],
      [1, 6],
      [1, 3],
    ]);
    OPTIONS_ROWS.slice(0, 3).forEach((row) => nudgeOption(row, 1));
    expect([getBattleSpeed(), getMessageSpeed(), getWalkSpeed()]).toEqual([
      2, 2, 2,
    ]);
  });
  it.each(OPTIONS_ROWS)(
    "keeps $key within both bounds and can leave either bound",
    (row) => {
      nudgeOption(row, -1);
      expect(row.get()).toBe(row.min);
      nudgeOption(row, 1);
      expect(row.get()).toBe(row.min + 1);
      row.set(row.max);
      nudgeOption(row, 1);
      expect(row.get()).toBe(row.max);
      nudgeOption(row, -1);
      expect(row.get()).toBe(row.max - 1);
    },
  );
  it("preserves short, once-per-battle, and full cinematic semantics", () => {
    const row = OPTIONS_ROWS[3];
    expect(getLongCinematicMode()).toBe("short");
    nudgeOption(row, 1);
    expect(getLongCinematicMode()).toBe("once");
    expect(row.format(row.get())).toBe("ONCE");
    nudgeOption(row, 1);
    expect(getLongCinematicMode()).toBe("full");
  });
});
