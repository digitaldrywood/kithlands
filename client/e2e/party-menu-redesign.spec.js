import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();

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

async function addProofOverlay(page, label) {
  await page.evaluate((labelText) => {
    const existing = document.getElementById("party-menu-redesign-proof");
    if (existing) existing.remove();

    const summary = window.__kithlandsTest.partyMenuSummary("World");
    const layout = window.__kithlandsTest.partyMenuLayout("World");
    const portraitSummary = summary.rows
      .map(
        (row) =>
          `slot ${row.slot + 1}: ${row.portraitKind}${row.portraitKey ? ` (${row.portraitKey})` : ""}`,
      )
      .join("\n");
    const actionSummary = [
      ...new Set(summary.actionIcons.map((icon) => icon.label)),
    ].join(", ");
    const barSummary = layout.statBars
      .map((bar) => `${bar.prefix} ${bar.trackWidth}px`)
      .join(" | ");

    const panel = document.createElement("div");
    panel.id = "party-menu-redesign-proof";
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
Portraits:
${portraitSummary}
Actions: ${actionSummary}
Bars: ${barSummary}`;
    document.body.appendChild(panel);
  }, label);
}

test.describe("party menu redesign", () => {
  test("renders portraits, icon-labeled actions, and hoverable rows", async ({
    page,
  }) => {
    await startPartyMenuGame(page);
    await openPartyMenu(page);

    const summary = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuSummary("World"),
    );
    expect(summary.rows).toHaveLength(4);
    expect(summary.rows.every((row) => row.portraitKind === "image")).toBe(
      true,
    );

    const actionLabels = [
      ...new Set(summary.actionIcons.map((icon) => icon.label)),
    ];
    expect(actionLabels).toEqual(
      expect.arrayContaining([
        "ITEMS",
        "MAGIC",
        "EQUIP",
        "QUEST LOG",
        "WORLD MAP",
        "SAVE",
        "OPTIONS",
        "CLOSE",
      ]),
    );
    expect(actionLabels.some((label) => label.startsWith("AUTO:"))).toBe(true);

    const layout = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuLayout("World"),
    );
    expect(layout.outOfBounds).toEqual([]);
    expect(layout.labelCounts.hp).toBe(4);
    expect(layout.labelCounts.mp).toBe(4);
    expect(layout.labelCounts.xp).toBe(4);

    await addProofOverlay(page, "Issue #223 proof: menu before hover");
    await page.screenshot({
      path: `tmp/issue-223-party-menu-before-${RUN_ID}.png`,
      fullPage: true,
    });

    const slotOne = summary.rows.find((row) => row.slot === 1);
    expect(slotOne).toBeTruthy();
    const rowPos = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuRowPosition(1, "World"),
    );
    await page.mouse.move(rowPos.x, rowPos.y);
    await page.waitForTimeout(100);

    const hoveredSummary = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuSummary("World"),
    );
    const hoveredSlotOne = hoveredSummary.rows.find((row) => row.slot === 1);
    expect(hoveredSlotOne.fillColor).not.toBe(slotOne.fillColor);

    await addProofOverlay(page, "Issue #223 proof: hovered row highlight");
    await page.screenshot({
      path: `tmp/issue-223-party-menu-hover-${RUN_ID}.png`,
      fullPage: true,
    });

    await page.mouse.click(rowPos.x, rowPos.y);
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").characterDetailOpen,
    );
  });
});
