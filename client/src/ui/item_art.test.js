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

it("every authored weapon has a canonical icon backed by a local asset", () => {
  const { weapons } = JSON.parse(
    readFileSync(new URL("../../../shared/items.json", import.meta.url)),
  );
  expect(weapons.length).toBeGreaterThan(0);
  for (const weapon of weapons) {
    const url = itemArtURL(weapon.icon_key);
    expect(url, `${weapon.id} has explicit canonical art`).toBeTruthy();
    const asset = new URL(`../../public${url}`, import.meta.url);
    expect(existsSync(asset), `${weapon.id} icon exists`).toBe(true);
    expect(readFileSync(asset).length).toBeGreaterThan(0);
  }
});
