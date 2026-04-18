import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startPartyMenuGame(page, party) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(
    (customParty) =>
      window.__kithlandsTest.startCustomGame({
        town_name: "Cadott, WI",
        people: [
          { name: "Coach Bell", relation: "friendly" },
          { name: "Ms Rivera", relation: "neutral" },
          { name: "Mallory", relation: "rival" },
        ],
        places: ["General Store", "Library", "Fire Hall"],
        big_building: "Town Hall",
        party: customParty,
        difficulty: "normal",
      }),
    party,
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function openPartyMenu(page) {
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
}

async function expandToSixMemberParty(page) {
  await page.evaluate(() => {
    const state = window.__kithlandsTest.gameState("World");
    const party = state.party || [];
    if (party.length < 4) {
      throw new Error("expected a 4-member base party");
    }
    const expandedParty = [
      ...party,
      {
        ...party[1],
        name: "Pax",
      },
      {
        ...party[2],
        name: "Vera",
      },
    ];
    return window.__kithlandsTest.setPartyStateLocal(expandedParty, "World");
  });
}

async function addProofOverlay(page, label, expectedWidth) {
  await page.evaluate(
    ({ labelText, width }) => {
      const existing = document.getElementById("party-menu-bar-width-proof");
      if (existing) existing.remove();

      const layout = window.__kithlandsTest.partyMenuLayout("World");
      const summary = layout.statBars
        .map((bar, index) => `${index + 1}. ${bar.prefix} ${bar.trackWidth}px`)
        .join("\n");

      const panel = document.createElement("div");
      panel.id = "party-menu-bar-width-proof";
      panel.style.position = "fixed";
      panel.style.top = "8px";
      panel.style.left = "8px";
      panel.style.zIndex = "9999";
      panel.style.background = "rgba(15, 23, 42, 0.92)";
      panel.style.color = "#e2e8f0";
      panel.style.padding = "10px 12px";
      panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
      panel.style.borderRadius = "8px";
      panel.style.fontFamily = "monospace";
      panel.style.fontSize = "12px";
      panel.style.whiteSpace = "pre";
      panel.textContent = `${labelText}\nExpected track width: ${width}px\n${summary}`;
      document.body.appendChild(panel);
    },
    { labelText: label, width: expectedWidth },
  );
}

async function assertUniformBarWidths(page, expectedPartySize) {
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.partyMenuLayout("World"),
  );
  expect(layout.outOfBounds).toEqual([]);
  expect(layout.labelCounts.hp).toBe(expectedPartySize);
  expect(layout.labelCounts.xp).toBe(expectedPartySize);

  const hpBars = layout.statBars.filter((bar) => bar.prefix === "HP");
  const mpBars = layout.statBars.filter((bar) => bar.prefix === "MP");
  const xpBars = layout.statBars.filter((bar) => bar.prefix === "XP");

  expect(hpBars).toHaveLength(expectedPartySize);
  expect(xpBars).toHaveLength(expectedPartySize);
  expect(mpBars.length).toBeGreaterThan(0);

  const widths = layout.statBars.map((bar) => bar.trackWidth);
  expect(widths.every((width) => width === 180)).toBe(true);
}

test.describe("party menu stat bar widths", () => {
  test("4-member party rows keep HP, MP, and XP tracks identical", async ({
    page,
  }) => {
    await startPartyMenuGame(page, [
      { name: "Ayla", class_id: "warrior" },
      { name: "Mira", class_id: "mender" },
      { name: "Cato", class_id: "cinder" },
      { name: "Nia", class_id: "rogue" },
    ]);
    await openPartyMenu(page);
    await assertUniformBarWidths(page, 4);
    await addProofOverlay(page, "Issue #222 proof: 4-member party", 180);
    await page.screenshot({
      path: `tmp/issue-222-party-menu-widths-4p-${RUN_ID}.png`,
      fullPage: true,
    });
  });

  test("6-member party rows keep HP, MP, and XP tracks identical", async ({
    page,
  }) => {
    await startPartyMenuGame(page, [
      { name: "Ayla", class_id: "warrior" },
      { name: "Mira", class_id: "mender" },
      { name: "Cato", class_id: "cinder" },
      { name: "Nia", class_id: "rogue" },
    ]);
    await expandToSixMemberParty(page);
    await openPartyMenu(page);
    await assertUniformBarWidths(page, 6);
    await addProofOverlay(page, "Issue #222 proof: 6-member party", 180);
    await page.screenshot({
      path: `tmp/issue-222-party-menu-widths-6p-${RUN_ID}.png`,
      fullPage: true,
    });
  });
});
