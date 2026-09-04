import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const PROOF_DIR = path.join("tmp", "demo-pacing", String(RUN_ID));

mkdirSync(PROOF_DIR, { recursive: true });

test.use({ viewport: { width: 1440, height: 900 } });

test("fresh campaign exposes twelve required beats with Q12 last", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await page.goto("/");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  const state = await page.evaluate(() =>
    window.__kithlandsTest.startQuickGame(
      `demo-pacing-${Date.now()}@kithlands.dev`,
    ),
  );

  expect(state.quests).toHaveLength(12);
  expect(state.current_quest).toBe(0);
  expect(state.quests.every((quest) => !quest.is_side_quest)).toBe(true);
  expect(state.quests.at(-1).template_id).toBe("Q12");
  expect(state.quests.at(-1).name).toContain("Bellbound Regent");

  writeFileSync(
    path.join(PROOF_DIR, `fresh-campaign-${RUN_ID}.json`),
    JSON.stringify(
      {
        requiredQuestCount: state.quests.length,
        requiredQuestIDs: state.quests.map((quest) => quest.id),
        requiredTemplateIDs: state.quests.map((quest) => quest.template_id),
        currentQuest: state.current_quest,
        finalQuest: state.quests.at(-1),
        transport: state.transport,
      },
      null,
      2,
    ),
  );

  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("QUEST LOG", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text.includes("12 main objectives remain")),
  );
  await page.screenshot({
    path: path.join(PROOF_DIR, `quest-log-desktop-${RUN_ID}.png`),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes("12 main objectives remain")),
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(PROOF_DIR, `quest-log-phone-${RUN_ID}.png`),
    fullPage: true,
  });

  expect(pageErrors).toEqual([]);
});
