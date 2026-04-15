import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPrefs,
  getBattlePlanMemory,
  setBattlePlanMemory,
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

const PARTY = [
  { name: "Bruno", class_id: "warrior" },
  { name: "Nia", class_id: "cinder" },
];

beforeEach(() => {
  stubLocalStorage();
  clearPrefs();
});

describe("battle plan memory", () => {
  it("stores and reloads a round keyed by party composition", () => {
    const actions = [{ slot: 0, type: "attack", target_id: 99 }];
    setBattlePlanMemory(PARTY, actions);

    expect(getBattlePlanMemory(PARTY)).toEqual(actions);
  });

  it("returns null when the party key does not match", () => {
    setBattlePlanMemory(PARTY, [{ slot: 0, type: "attack", target_id: 99 }]);

    expect(
      getBattlePlanMemory([{ name: "Other", class_id: "warrior" }]),
    ).toBeNull();
  });
});
