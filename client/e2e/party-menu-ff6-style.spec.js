import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();

test.use({
  viewport: { width: 1440, height: 900 },
});

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
  await page.evaluate(() =>
    window.__kithlandsTest.setPartyVitalsLocal(
      [{ slot: 2, hp: 4, status: "poison" }],
      "World",
    ),
  );
}

async function openPartyMenu(page) {
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
}

test.describe("party menu FF6 styling pass", () => {
  test("renders framed chrome, distinct row states, and hotkey footer buttons", async ({
    page,
  }) => {
    await startPartyMenuGame(page);
    await openPartyMenu(page);

    const summary = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuSummary("World"),
    );
    expect(summary.rows).toHaveLength(4);
    expect(summary.rows.map((row) => row.nextLevel)).toEqual([70, 70, 70, 70]);
    expect(summary.rows.find((row) => row.slot === 2)?.status).toBe(
      "POISON · CRITICAL",
    );
    expect(summary.resourceChips.map((chip) => chip.key).sort()).toEqual([
      "ether",
      "gold",
      "potions",
    ]);

    const actionLabels = [
      ...new Set(summary.actionIcons.map((icon) => icon.label)),
    ];
    expect(actionLabels).toEqual(
      expect.arrayContaining([
        "CHARACTER",
        "ITEMS",
        "MAGIC",
        "FORMATION",
        "QUEST LOG",
        "WORLD MAP",
        "SAVE",
        "OPTIONS",
        "CLOSE",
      ]),
    );
    expect(actionLabels.some((label) => label.startsWith("AUTO:"))).toBe(true);
    expect(
      summary.actionIcons
        .filter((icon) => icon.hotkey)
        .map((icon) => icon.hotkey),
    ).toEqual(
      expect.arrayContaining([
        "C",
        "I",
        "M",
        "F",
        "Q",
        "W",
        "S",
        "A",
        "O",
        "ESC",
      ]),
    );

    const initialSelected = summary.rows.filter(
      (row) => row.state === "selected",
    );
    expect(initialSelected).toHaveLength(1);
    expect(initialSelected[0].slot).toBe(0);

    const hoverTarget = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuRowPosition(1, "World"),
    );
    await page.mouse.move(hoverTarget.x, hoverTarget.y);
    await page.waitForTimeout(120);

    const hoveredSummary = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuSummary("World"),
    );
    const selectedRow = hoveredSummary.rows.find((row) => row.slot === 0);
    const hoveredRow = hoveredSummary.rows.find((row) => row.slot === 1);
    expect(selectedRow?.state).toBe("selected");
    expect(hoveredRow?.state).toBe("hover");

    const layout = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuLayout("World"),
    );
    expect(layout.outOfBounds).toEqual([]);
    expect(layout.statBars.every((bar) => bar.trackWidth === 180)).toBe(true);
    for (const row of layout.rowMetrics) {
      expect(row.classToHpGap).toBeGreaterThanOrEqual(0);
      expect(row.hpToMpGap).toBeGreaterThanOrEqual(0);
      expect(row.mpToXpGap).toBeGreaterThanOrEqual(0);
    }

    await page.screenshot({
      path: `e2e/issue-247-party-menu-ff6-proof-${RUN_ID}.png`,
    });
  });

  test("keeps critical condition text visible in a portrait viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startPartyMenuGame(page);
    await openPartyMenu(page);

    const summary = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuSummary("World"),
    );
    expect(summary.rows.find((row) => row.slot === 2)?.status).toBe(
      "POISON · CRITICAL",
    );

    const layout = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuLayout("World"),
    );
    expect(layout.outOfBounds).toEqual([]);

    await page.screenshot({
      path: `e2e/party-menu-critical-mobile-390x844-${RUN_ID}.png`,
    });
  });
});
