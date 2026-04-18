import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const WIZARD_TITLES = [
  "LOCALITY WIZARD",
  "DISCOVERED LOCATIONS",
  "NAME YOUR NPCs",
  "NAME YOUR PLACES",
  "THE BIG BUILDING",
  "PICK YOUR PARTY",
  "MAP PREVIEW",
  "CONFIRM YOUR GAME",
];
const PREVIEW_NODES = [
  {
    id: "poi-library",
    name: "Cadott Library",
    kind: "landmark",
    importance: 9,
    lat: 44.9481,
    lng: -91.1502,
  },
  {
    id: "poi-school",
    name: "Cadott School",
    kind: "place",
    importance: 8,
    lat: 44.9474,
    lng: -91.1494,
  },
  {
    id: "poi-fire-hall",
    name: "Fire Hall",
    kind: "business",
    importance: 7,
    lat: 44.949,
    lng: -91.1487,
  },
];

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function clickWizardText(page, label) {
  await page.evaluate(
    (text) => window.__kithlandsTest.clickInteractiveText(text, "Wizard"),
    label,
  );
}

async function waitForWizardText(page, label) {
  await page.waitForFunction(
    (text) =>
      (window.__kithlandsTest.visibleTexts("Wizard") || []).some((entry) =>
        entry.text.includes(text),
      ),
    label,
  );
}

async function recordWizardTitles(page) {
  await page.evaluate((titles) => {
    window.__issue219WizardTitleHistory = [];
    window.__issue219WizardTitleTracker = setInterval(() => {
      if (window.__kithlandsTest.activeSceneKey() !== "Wizard") return;
      const visible = window.__kithlandsTest
        .visibleTexts("Wizard")
        .map((entry) => entry.text);
      for (const title of titles) {
        if (
          visible.includes(title) &&
          !window.__issue219WizardTitleHistory.includes(title)
        ) {
          window.__issue219WizardTitleHistory.push(title);
        }
      }
    }, 40);
  }, WIZARD_TITLES);
}

async function stopWizardTitleRecorder(page) {
  return page.evaluate((titles) => {
    if (window.__kithlandsTest.activeSceneKey() === "Wizard") {
      const visible = window.__kithlandsTest
        .visibleTexts("Wizard")
        .map((entry) => entry.text);
      for (const title of titles) {
        if (
          visible.includes(title) &&
          !window.__issue219WizardTitleHistory.includes(title)
        ) {
          window.__issue219WizardTitleHistory.push(title);
        }
      }
    }
    clearInterval(window.__issue219WizardTitleTracker);
    return window.__issue219WizardTitleHistory || [];
  }, WIZARD_TITLES);
}

async function addProofOverlay(page, label, sceneKey, highlights = []) {
  await page.evaluate(
    ({ overlayLabel, key, focusTexts }) => {
      const existing = document.getElementById("wizard-start-proof");
      if (existing) existing.remove();

      const visible = window.__kithlandsTest
        .visibleTexts(key)
        .map((entry) => entry.text)
        .filter((text) =>
          focusTexts.length === 0
            ? text.length > 0
            : focusTexts.some((focus) => text.includes(focus)),
        )
        .slice(0, 12);

      const panel = document.createElement("div");
      panel.id = "wizard-start-proof";
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
      panel.textContent = [
        overlayLabel,
        `Scene: ${window.__kithlandsTest.activeSceneKey()}`,
        `Visible: ${visible.join(" | ") || "(none)"}`,
      ].join("\n");
      document.body.appendChild(panel);
    },
    { overlayLabel: label, key: sceneKey, focusTexts: highlights },
  );
}

test.describe("wizard start flow", () => {
  test("skips straight from OSM search to party creation with no confirmation screen", async ({
    page,
  }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await page.route("**/api/geocode", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lat: 44.9475,
          lng: -91.1504,
          display_name: "Cadott, WI, USA",
        }),
      });
    });

    await page.route("**/api/osm/preview", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          radius_miles: 1.5,
          nodes: PREVIEW_NODES,
        }),
      });
    });

    await page.goto("/");
    await waitForBridge(page);
    await recordWizardTitles(page);

    await page
      .locator('input[type="email"]')
      .fill(`wizard-${RUN_ID}@kithlands.dev`);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("NEW GAME", "Title"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Wizard",
    );

    await waitForWizardText(page, "LOCALITY WIZARD");
    await page.locator('input[type="text"]').fill("Cadott, WI");

    await addProofOverlay(page, "Search step before submit", "Wizard", [
      "LOCALITY WIZARD",
      "FIND & CONTINUE",
      "Use real-world map data",
    ]);
    await page.screenshot({
      path: testInfo.outputPath(`issue-219-search-before-${RUN_ID}.png`),
      fullPage: true,
    });

    await clickWizardText(page, "FIND & CONTINUE");

    await waitForWizardText(page, "Searching Cadott...");
    await expect(page.locator('input[type="text"]')).toHaveCount(0);
    await expect(page.locator('input[type="range"]')).toHaveCount(0);

    const busyTexts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Wizard").map((entry) => entry.text),
    );
    expect(busyTexts.some((text) => text.includes("Searching Cadott..."))).toBe(
      true,
    );
    expect(busyTexts).not.toContain("Looking up location...");
    expect(
      busyTexts.some((text) => text.includes("Use real-world map data")),
    ).toBe(false);
    expect(busyTexts.some((text) => text.includes("Search radius:"))).toBe(
      false,
    );
    expect(busyTexts).not.toContain("[ FIND & CONTINUE ]");

    await addProofOverlay(page, "Search loading panel", "Wizard", [
      "LOCALITY WIZARD",
      "Searching Cadott...",
    ]);
    await page.screenshot({
      path: testInfo.outputPath(`issue-219-search-busy-${RUN_ID}.png`),
      fullPage: true,
    });

    await waitForWizardText(page, "PICK YOUR PARTY");

    const seenTitles = await stopWizardTitleRecorder(page);
    expect(seenTitles).toEqual(["LOCALITY WIZARD", "PICK YOUR PARTY"]);

    const visibleTexts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Wizard").map((entry) => entry.text),
    );
    expect(visibleTexts).toContain("PICK YOUR PARTY");
    expect(visibleTexts).toContain("[ CANCEL ]");
    expect(visibleTexts).toContain("[ CREATE GAME ]");
    expect(visibleTexts).not.toContain("CONFIRM YOUR GAME");
    expect(visibleTexts).not.toContain("DISCOVERED LOCATIONS");
    expect(visibleTexts).not.toContain("MAP PREVIEW");

    await page.locator('input[type="text"]').nth(0).fill("Ayla");
    await page.locator('input[type="text"]').nth(1).fill("Mira");
    await page.locator('input[type="text"]').nth(2).fill("Cato");
    await page.locator('input[type="text"]').nth(3).fill("Nia");

    await addProofOverlay(
      page,
      "Final wizard step with Create/Cancel",
      "Wizard",
      ["PICK YOUR PARTY", "CREATE GAME", "CANCEL"],
    );
    await page.screenshot({
      path: testInfo.outputPath(`issue-219-final-step-${RUN_ID}.png`),
      fullPage: true,
    });

    await clickWizardText(page, "CREATE GAME");
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );

    expect(pageErrors).toEqual([]);
  });

  test("restores the search form with an error banner when OSM preview fails", async ({
    page,
  }) => {
    await page.route("**/api/geocode", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lat: 44.9475,
          lng: -91.1504,
          display_name: "Cadott, WI, USA",
        }),
      });
    });

    await page.route("**/api/osm/preview", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          error: "osm temporarily unavailable",
        }),
      });
    });

    await page.goto("/");
    await waitForBridge(page);
    await page
      .locator('input[type="email"]')
      .fill(`wizard-error-${RUN_ID}@kithlands.dev`);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("NEW GAME", "Title"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Wizard",
    );

    await page.locator('input[type="text"]').fill("Cadott, WI");
    await clickWizardText(page, "FIND & CONTINUE");

    await waitForWizardText(page, "Searching Cadott...");
    await waitForWizardText(page, "Map lookup failed. Try again.");

    await expect(page.locator('input[type="text"]')).toHaveValue("Cadott, WI");
    await expect(page.locator('input[type="range"]')).toHaveCount(1);

    const visibleTexts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Wizard").map((entry) => entry.text),
    );
    expect(visibleTexts).toContain("Map lookup failed. Try again.");
    expect(
      visibleTexts.some((text) => text.includes("Use real-world map data")),
    ).toBe(true);
    expect(visibleTexts).toContain("[ FIND & CONTINUE ]");
  });
});
