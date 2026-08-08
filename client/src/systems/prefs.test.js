import { beforeEach, describe, expect, it } from "vitest";
import {
  addPartyToHistory,
  clearPrefs,
  getLongCinematicMode,
  getPartyHistory,
  setLongCinematicMode,
} from "./prefs.js";

function stubLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("party preference history", () => {
  beforeEach(() => {
    stubLocalStorage();
    clearPrefs();
  });

  it("deduplicates matching parties without throwing", () => {
    const party = [
      { name: "Hero", class_id: "warrior" },
      { name: "Willow", class_id: "mender" },
    ];

    addPartyToHistory(party);
    addPartyToHistory([
      { name: "hero", class_id: "warrior" },
      { name: "willow", class_id: "mender" },
    ]);

    expect(getPartyHistory()).toEqual([party]);
  });

  it("keeps only the five most recent unique parties", () => {
    for (let i = 0; i < 6; i++) {
      addPartyToHistory([{ name: `Hero ${i}`, class_id: "warrior" }]);
    }

    const history = getPartyHistory();
    expect(history).toHaveLength(5);
    expect(history[0][0].name).toBe("Hero 5");
    expect(history[4][0].name).toBe("Hero 1");
  });
});

describe("battle cinematic preference", () => {
  beforeEach(() => {
    stubLocalStorage();
    clearPrefs();
  });

  it("defaults to full major cinematics", () => {
    expect(getLongCinematicMode()).toBe("full");
  });

  it("persists valid modes and rejects unknown values", () => {
    setLongCinematicMode("once");
    expect(getLongCinematicMode()).toBe("once");

    setLongCinematicMode("warp-speed");
    expect(getLongCinematicMode()).toBe("full");
  });
});
