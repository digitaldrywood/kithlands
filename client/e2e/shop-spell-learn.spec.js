import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(SPEC_DIR, "tmp");

mkdirSync(PROOF_DIR, { recursive: true });

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startSpellShopGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [
        { name: "Coach Bell", relation: "friendly" },
        { name: "Ms Rivera", relation: "neutral" },
        { name: "Mallory", relation: "rival" },
      ],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      party: [
        { name: "Bruno", class_id: "warrior" },
        { name: "Nia", class_id: "mender" },
        { name: "Mira", class_id: "mender" },
      ],
      difficulty: "normal",
      spawn_node_id: "shop",
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(async () => {
    await window.__kithlandsTest.setGold(500, "World");
    await window.__kithlandsTest.setPartyLevels(
      [
        { slot: 0, level: 4 },
        { slot: 1, level: 1 },
        { slot: 2, level: 7 },
      ],
      "World",
    );
  });
}

async function visitShop(page) {
  await page.evaluate(async () => {
    const api = await import("/src/api.js");
    let gs = window.__kithlandsTest.gameState("World");
    gs = await api.transitionLocation(
      gs.id,
      "enter-settlement",
      gs.settlement_entry_node_id,
    );
    if (gs.error) throw new Error(gs.error);
    const door = gs.settlement_map.layers
      .flatMap((layer) => layer.objects || [])
      .find((object) =>
        object.properties?.some(
          (property) =>
            property.name === "building_type" && property.value === "shop",
        ),
      );
    if (!door) throw new Error("Settlement has no shop entrance");
    gs = await api.transitionLocation(gs.id, door.name);
    if (gs.error) throw new Error(gs.error);
    window.__kithlandsTest.startScene("Town", {
      gameState: gs,
      spawn: gs.current_location.interior,
    });
  });
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));

  const npc = await page.evaluate(
    () => window.__kithlandsTest.townNpcPositions("Town")[0],
  );
  await page.waitForFunction(
    ({ x, y }) =>
      window.__kithlandsTest.teleportTownPlayer(x, y + 1).nearNpcIndex === 0,
    npc,
  );

  await page.evaluate(() => window.__kithlandsTest.interact("Town"));
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Town")
      .some((entry) => entry.text === "Leave Shop"),
  );
}

async function addProofOverlay(page, label) {
  await page.evaluate((overlayLabel) => {
    const existing = document.getElementById("shop-spell-proof");
    if (existing) existing.remove();

    const state = window.__kithlandsTest.gameState("Town");
    const visible = window.__kithlandsTest
      .visibleTexts("Town")
      .map((entry) => entry.text)
      .filter(
        (text) =>
          text.includes("Bruno") ||
          text.includes("Nia") ||
          text.includes("Mira") ||
          text.includes("wrong class") ||
          text.includes("level too low") ||
          text === "Learn" ||
          text.includes("Heal"),
      );

    const panel = document.createElement("div");
    panel.id = "shop-spell-proof";
    panel.style.position = "fixed";
    panel.style.top = "8px";
    panel.style.left = "8px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(15, 23, 42, 0.94)";
    panel.style.color = "#e2e8f0";
    panel.style.padding = "10px 12px";
    panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
    panel.style.borderRadius = "8px";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "12px";
    panel.style.whiteSpace = "pre";
    panel.textContent = [
      overlayLabel,
      `Gold: ${state.gold}`,
      `Inventory: ${(state.items || []).map((item) => item.id).join(", ") || "(none)"}`,
      ...state.party.map(
        (member) =>
          `${member.name} Lv.${member.level}: ${(member.spells || []).map((spell) => spell.id).join(", ") || "(no spells)"}`,
      ),
      `UI: ${visible.join(" | ") || "(none)"}`,
      `Toast: ${window.__kithlandsTest.messageState("Town").text || "(hidden)"}`,
    ].join("\n");
    document.body.appendChild(panel);
  }, label);
}

test.describe("shop spell learning flow", () => {
  test("learns a purchased spell on the chosen party member instead of adding an inventory item", async ({
    page,
  }) => {
    const requests = [];
    page.on("request", (request) => {
      if (!request.url().includes("/api/game/")) return;
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData() || "",
      });
    });

    await startSpellShopGame(page);
    await visitShop(page);

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Spells", "Town"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text.includes("Heal")),
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Heal", "Town"),
    );
    await page.waitForFunction(() => {
      const texts = window.__kithlandsTest.visibleTexts("Town");
      return (
        texts.some((entry) => entry.text.includes("wrong class")) &&
        texts.some((entry) => entry.text.includes("level too low")) &&
        texts.some((entry) => entry.text === "Learn")
      );
    });

    await addProofOverlay(page, "BEFORE: spell picker shows eligible learner");
    await page.screenshot({
      path: path.join(PROOF_DIR, `issue-204-shop-spell-before-${RUN_ID}.png`),
      fullPage: true,
    });

    const learnResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/game/") &&
        response.url().endsWith("/learn"),
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Mira", "Town"),
    );

    await page.getByRole("button", { name: /^Learn(?: Alt|$)/ }).click();
    const learnResponse = await learnResponsePromise;
    const learnBody = await learnResponse.json();

    await page.waitForFunction(() => {
      const state = window.__kithlandsTest.gameState("Town");
      return (
        state.gold === 300 &&
        (state.party?.[2]?.spells || []).some((spell) => spell.id === "heal")
      );
    });

    const after = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    const toast = await page.locator(".shop-status").innerText();
    await addProofOverlay(
      page,
      "AFTER: Heal learned by Mira, not stored as an item",
    );
    await page.screenshot({
      path: path.join(PROOF_DIR, `issue-204-shop-spell-after-${RUN_ID}.png`),
      fullPage: true,
    });

    const learnRequests = requests.filter((request) =>
      request.url.endsWith("/learn"),
    );
    const buyRequests = requests.filter((request) =>
      request.url.endsWith("/buy"),
    );

    expect(learnRequests).toHaveLength(1);
    expect(JSON.parse(learnRequests[0].body)).toMatchObject({
      char_name: "Mira",
      stock_id: expect.any(String),
    });
    expect(buyRequests).toHaveLength(0);
    expect(learnBody.error).toBeFalsy();
    expect(after.gold).toBe(300);
    expect(
      (after.party[2].spells || []).some((spell) => spell.id === "heal"),
    ).toBe(true);
    expect(
      (after.party[1].spells || []).some((spell) => spell.id === "heal"),
    ).toBe(false);
    expect((after.items || []).some((item) => item.id === "heal")).toBe(false);
    expect((after.items || []).some((item) => item.id === "spell_heal")).toBe(
      false,
    );
    expect(toast).toContain("Mira learned Heal!");
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Leave Shop", "Town"),
    );
    await page.keyboard.press("m");
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("QUEST LOG", "Town"),
    );
    const journal = page.getByRole("dialog", { name: "Quest Log" });
    await expect(journal).toBeVisible();
    await expect(
      journal.getByRole("heading", { name: "Your campaign" }),
    ).toBeVisible();
    await expect(
      journal.getByRole("heading", { name: "Local stories" }),
    ).toHaveCount(1);
    await page.evaluate(() =>
      document.getElementById("shop-spell-proof")?.remove(),
    );
    await page.screenshot({
      path: path.join(PROOF_DIR, `town-shared-journal-${RUN_ID}.png`),
      fullPage: true,
    });
    await journal.getByRole("button", { name: "Close Quest Log" }).click();
    await expect(journal).toHaveCount(0);
  });
});
