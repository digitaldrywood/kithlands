import { expect, it } from "vitest";
import { itemArtURL } from "./item_art.js";
import { existsSync, readFileSync } from "node:fs";
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

it("every authored equipment item has a canonical icon backed by a local asset", () => {
  const content = JSON.parse(
    readFileSync(new URL("../../../shared/items.json", import.meta.url)),
  );
  const equipment = ["weapons", "armor", "shields", "helmets", "gear"].flatMap(
    (group) => content[group],
  );
  expect(equipment.length).toBeGreaterThan(0);
  for (const item of equipment) {
    const url = itemArtURL(item.icon_key);
    expect(url, `${item.id} has explicit canonical art`).toBeTruthy();
    const asset = new URL(`../../public${url}`, import.meta.url);
    expect(existsSync(asset), `${item.id} icon exists`).toBe(true);
    expect(readFileSync(asset).length).toBeGreaterThan(0);
  }
});
