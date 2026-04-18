import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();
const PROOF_STAGE = process.env.KITHLANDS_PROOF_STAGE || "proof";

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startPartyMenuGame(page) {
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
      difficulty: "normal",
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
        { name: "Cato", class_id: "cinder" },
        { name: "Nia", class_id: "rogue" },
      ],
    }),
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

async function addProofOverlay(page, layout) {
  await page.evaluate(
    ({ labelText, nextLayout }) => {
      const existing = document.getElementById(
        "party-menu-class-spacing-proof",
      );
      if (existing) existing.remove();

      const panel = document.createElement("div");
      panel.id = "party-menu-class-spacing-proof";
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
      panel.textContent = `${labelText}
${nextLayout.rowMetrics
  .map(
    (row) =>
      `slot ${row.slot + 1}: class->HP ${row.classToHpGap}px | HP->MP ${row.hpToMpGap}px | MP->XP ${row.mpToXpGap}px`,
  )
  .join("\n")}`;
      document.body.appendChild(panel);
    },
    {
      labelText: `Issue #235 ${PROOF_STAGE}: class/bar spacing`,
      nextLayout: layout,
    },
  );
}

test.describe("party menu class spacing", () => {
  test("keeps each class label clear of the HP bar", async ({ page }) => {
    await startPartyMenuGame(page);
    await openPartyMenu(page);

    const layout = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuLayout("World"),
    );

    expect(layout.outOfBounds).toEqual([]);
    expect(layout.rowMetrics).toHaveLength(4);

    await addProofOverlay(page, layout);
    await page.screenshot({
      path: `tmp/issue-235-party-menu-${PROOF_STAGE}-${RUN_ID}.png`,
      fullPage: true,
    });

    for (const row of layout.rowMetrics) {
      expect(row.classTextBounds).toBeTruthy();
      expect(row.hpTrackBounds).toBeTruthy();
      expect(row.classToHpGap).toBeGreaterThanOrEqual(0);
    }
  });

  test("keeps each class label clear of the HP bar for a 6-member party", async ({
    page,
  }) => {
    await startPartyMenuGame(page);
    await expandToSixMemberParty(page);
    await openPartyMenu(page);

    const layout = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuLayout("World"),
    );

    expect(layout.outOfBounds).toEqual([]);
    expect(layout.rowMetrics).toHaveLength(6);

    for (const row of layout.rowMetrics) {
      expect(row.classTextBounds).toBeTruthy();
      expect(row.hpTrackBounds).toBeTruthy();
      expect(row.classToHpGap).toBeGreaterThanOrEqual(0);
    }
  });
});
