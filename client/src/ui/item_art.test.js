import { expect, it } from "vitest";
import { itemArtURL } from "./item_art.js";
it("uses canonical content art and preserves legacy PNG keys", () => {
  expect(itemArtURL("crafted/steel-sword.svg")).toBe(
    "/sprites/items/crafted/steel-sword.svg",
  );
  expect(itemArtURL("crafted/iron-sword")).toBe(
    "/sprites/items/crafted/iron-sword.png",
  );
  for (const key of [
    null,
    "../private",
    "https://remote/icon.svg",
    "a.svg.png?x",
  ])
    expect(itemArtURL(key)).toBeNull();
});
