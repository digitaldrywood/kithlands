import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let fixture;
test.beforeAll(() => {
  test.setTimeout(120000);
  const output = path.resolve("tmp/river-network-" + Date.now() + ".json");
  mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(
    "go",
    [
      "test",
      "-tags=integration",
      "./api",
      "-run",
      "^TestSeedRiverBrowserWorld$",
      "-count=1",
    ],
    {
      cwd: path.resolve("../server"),
      env: { ...process.env, KITHLANDS_RIVER_PROOF_PATH: output },
    },
  );
  fixture = JSON.parse(readFileSync(output, "utf8"));
});

for (const [width, height] of [
  [1440, 900],
  [645, 847],
  [390, 844],
]) {
  test(`generated river crossings remain visible and walkable at ${width}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height });
    await page.route("**/src/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()) + "\nwindow.__riverGame=game;",
      });
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(async ({ token, saveID }) => {
      const { setToken } = await import("/src/api.js");
      setToken(token);
      const result = await window.__kithlandsTest.loadSave(saveID);
      if (result.error) throw Error(result.error);
    }, fixture);
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "World",
    );
    const crossing = {
      ...fixture.crossing,
      key: fixture.crossing.dx ? "ArrowRight" : "ArrowDown",
    };
    const initial = await page.evaluate(() =>
      window.__kithlandsTest.worldNavigationSnapshot(),
    );
    expect([initial.x, initial.y]).toEqual([crossing.x, crossing.y]);
    await page.screenshot({
      path: info.outputPath(`bridge-bank-${width}-${Date.now()}.png`),
    });
    // Traverse one tile at a time using actual movement input, asserting each
    // water-to-bridge tile accepts walking and the far bank remains reachable.
    for (let step = 1; step <= crossing.steps; step++) {
      await page.keyboard.down(crossing.key);
      await expect
        .poll(async () =>
          page.evaluate(
            () => window.__kithlandsTest.worldNavigationSnapshot().animating,
          ),
        )
        .toBe(true);
      await page.keyboard.up(crossing.key);
      await expect
        .poll(async () =>
          page.evaluate(
            () => window.__kithlandsTest.worldNavigationSnapshot().animating,
          ),
        )
        .toBe(false);
      const p = await page.evaluate(() =>
        window.__kithlandsTest.worldNavigationSnapshot(),
      );
      expect([p.x, p.y]).toEqual([
        crossing.x + crossing.dx * step,
        crossing.y + crossing.dy * step,
      ]);
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const c =
              window.__kithlandsTest.worldNavigationSnapshot().checkpoint;
            return [c.x, c.y];
          }),
        )
        .toEqual([
          crossing.x + crossing.dx * step,
          crossing.y + crossing.dy * step,
        ]);
      if (step === 1)
        await page.screenshot({
          path: info.outputPath(`bridge-walking-${width}-${Date.now()}.png`),
        });
    }
    await page.screenshot({
      path: info.outputPath(`bridge-far-bank-${width}-${Date.now()}.png`),
    });
    await page.evaluate(async () => {
      const { showWorldMapDialog } = await import("/src/ui/world_map_menu.js");
      showWorldMapDialog(window.__riverGame.scene.getScene("World"));
    });
    await expect(
      page.getByRole("img", { name: /Map: red marks/ }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`river-map-${width}-${Date.now()}.png`),
    });
    await page.getByRole("button", { name: "Back to game" }).click();
    await expect(page.getByRole("img", { name: /Map: red marks/ })).toHaveCount(
      0,
    );
  });
}
