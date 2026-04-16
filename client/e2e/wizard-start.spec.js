import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

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

async function addProofOverlay(page, label) {
  await page.evaluate((overlayLabel) => {
    const existing = document.getElementById("wizard-start-proof");
    if (existing) existing.remove();

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

    const gs = window.__kithlandsTest.gameState("World");
    const party = gs?.party || [];
    panel.textContent = [
      overlayLabel,
      `Scene: ${window.__kithlandsTest.activeSceneKey()}`,
      ...party.map(
        (member, idx) => `P${idx + 1} ${member.name} (${member.class_id})`,
      ),
    ].join("\n");
    document.body.appendChild(panel);
  }, label);
}

test.describe("wizard start flow", () => {
  test("creates a game from the wizard without uncaught client errors", async ({
    page,
  }, testInfo) => {
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await page.goto("/");
    await waitForBridge(page);

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
    await clickWizardText(page, "Use real-world map data");
    await page.locator('input[type="text"]').fill("Cadott, WI");
    await clickWizardText(page, "FIND & CONTINUE");

    await waitForWizardText(page, "NAME YOUR NPCs");
    await clickWizardText(page, "NEXT");

    await waitForWizardText(page, "NAME YOUR PLACES");
    await clickWizardText(page, "NEXT");

    await waitForWizardText(page, "THE BIG BUILDING");
    await clickWizardText(page, "NEXT");

    await waitForWizardText(page, "PICK YOUR PARTY");
    await page.locator('input[type="text"]').nth(1).fill("Sparks");
    await clickWizardText(page, "NEXT");

    await waitForWizardText(page, "CONFIRM YOUR GAME");
    await clickWizardText(page, "BEGIN ADVENTURE");

    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );

    const history = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("kithlands_prefs") || "{}")
          .party_history,
    );
    expect(history?.length).toBe(1);

    await addProofOverlay(page, "Wizard start reached World");
    await page.screenshot({
      path: testInfo.outputPath(`wizard-start-proof-${RUN_ID}.png`),
      fullPage: true,
    });

    expect(pageErrors).toEqual([]);
  });
});
