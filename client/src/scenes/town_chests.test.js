import { describe, expect, it } from "vitest";
import { chestFlagKey, isChestOpen } from "./town_chests.js";

describe("town chest helpers", () => {
  it("builds the persistent chest-open flag key", () => {
    expect(chestFlagKey("node-7", "crypt_reliquary")).toBe(
      "chest_open:node-7:crypt_reliquary",
    );
  });

  it("reads opened chests from triggered flags", () => {
    const flags = {
      "chest_open:node-7:crypt_reliquary": true,
    };
    expect(isChestOpen(flags, "node-7", "crypt_reliquary")).toBe(true);
    expect(isChestOpen(flags, "node-7", "riverrest_guest_cache")).toBe(false);
  });
});
