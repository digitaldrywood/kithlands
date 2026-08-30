import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const RUN_ID = Date.now();
const PROOF_DIR = path.join("tmp", `character-detail-responsive-${RUN_ID}`);

async function startQuickGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function clickBridgePosition(page, method, ...args) {
  const position = await page.evaluate(
    ({ method, args }) => window.__kithlandsTest[method](...args),
    { method, args },
  );
  expect(position).toBeTruthy();
  await page.mouse.click(position.x, position.y);
}

async function openCharacterScreen(page) {
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => !!window.__kithlandsTest.partyMenuSummary("World"),
  );
  await clickBridgePosition(page, "menuButtonPosition", "CHARACTER", "World");
  await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
}

async function box(locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).toBeTruthy();
  return bounds;
}

test("keeps the real character screen readable and touchable across screen shapes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mkdir(PROOF_DIR, { recursive: true });

  await page.setViewportSize({ width: 800, height: 600 });
  await startQuickGame(page);
  await openCharacterScreen(page);

  const desktopDialog = await box(page.locator(".kith-equipment-screen"));
  expect(desktopDialog.width).toBeLessThanOrEqual(800);
  expect(desktopDialog.height).toBeLessThanOrEqual(600);
  await expect(page.locator(".equipment-slot")).toHaveCount(12);
  await page.screenshot({
    path: path.join(PROOF_DIR, "character-detail-desktop-800x600.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Close equipment" }).click();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await openCharacterScreen(page);

  const screen = page.locator(".kith-equipment-screen");
  await expect(screen).toHaveClass(/is-compact/);
  const mobileDialog = await box(screen);
  expect(mobileDialog.width).toBeLessThanOrEqual(390);
  expect(mobileDialog.height).toBeLessThanOrEqual(844);

  const touchTargets = [
    page.getByRole("button", { name: "Previous character" }),
    page.getByRole("button", { name: "Next character" }),
    page.getByRole("button", { name: "Recommend Gear" }),
    page.getByRole("button", { name: "Close equipment" }),
    page.locator(".equipment-goal"),
    page.getByRole("tab", { name: "Summary" }),
    page.getByRole("tab", { name: "Spells" }),
    page.getByRole("tab", { name: "Special" }),
  ];
  for (const target of touchTargets) {
    expect((await box(target)).height).toBeGreaterThanOrEqual(44);
  }

  const overflow = await screen.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  await page.screenshot({
    path: path.join(PROOF_DIR, "character-detail-mobile-390x844.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Spells" }).click();
  await expect(page.getByRole("tab", { name: "Spells" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Next character" }).click();
  await expect(page.locator(".equipment-party-position")).toHaveText("2/2");
  await page.screenshot({
    path: path.join(PROOF_DIR, "character-detail-mobile-spells-390x844.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Close equipment" }).click();
  await expect(page.getByRole("dialog", { name: "Character" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(() => window.__kithlandsTest.logicalGameSize("World")),
    )
    .toEqual({ width: 800, height: 600 });
});
