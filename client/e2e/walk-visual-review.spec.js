import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const proof = new URL(
  `../tmp/walk-visual-review-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });
test("review sprite gallery and capture all classes walking and stopping through Space", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/sprites.html");
  await expect(page.locator("#walk-grid")).toBeVisible();
  await page.screenshot({
    path: new URL("sprite-gallery.png", proof).pathname,
    fullPage: true,
  });
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()) + "\nwindow.__reviewGame=game;",
    });
  });
  await page.addInitScript(() =>
    localStorage.setItem("kithlands_prefs", JSON.stringify({ walkSpeed: 1 })),
  );
  await page.goto("/?walkAudit=1&noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("World"),
  );
  const classes = await page.evaluate(() =>
    window.__kithlandsTest.walkSheetClassIds(),
  );
  for (const id of classes) {
    const info = await page.evaluate(() =>
      window.__kithlandsTest.sceneAuditInfo("World"),
    );
    expect(info.leaderClass).toBe(id);
    const anchor = await page.evaluate(() =>
      window.__kithlandsTest.findStraightAuditAnchor("right", 10, "World"),
    );
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.setPlayerTile(x, y, "World"),
      anchor,
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const game = window.__reviewGame,
        scene = game.scene.getScene("World");
      window.__reviewFrames = {};
      window.__reviewCapture = () => {
        const key = String(scene.player.frame.name);
        if (window.__reviewFrames[key]) return;
        const camera = scene.cameras.main;
        const point = camera.matrix.transformPoint(
          scene.player.x - camera.scrollX,
          scene.player.y - camera.scrollY,
        );
        if (
          point.x < 56 ||
          point.x > game.canvas.width - 56 ||
          point.y < 96 ||
          point.y > game.canvas.height - 16
        )
          return;
        const canvas = document.createElement("canvas");
        canvas.width = 112;
        canvas.height = 112;
        canvas
          .getContext("2d")
          .drawImage(
            game.canvas,
            point.x - 56,
            point.y - 96,
            112,
            112,
            0,
            0,
            112,
            112,
          );
        window.__reviewFrames[key] = canvas.toDataURL();
      };
      game.events.on("postrender", window.__reviewCapture);
    });
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1600);
    await page.keyboard.up("ArrowRight");
    await page.waitForTimeout(500);
    const frames = await page.evaluate(() => {
      window.__reviewGame.events.off("postrender", window.__reviewCapture);
      return window.__reviewFrames;
    });
    for (const frame of [12, 13, 14, 15, 16, 17])
      expect(frames[String(frame)]).toBeTruthy();
    for (const [frame, data] of Object.entries(frames))
      writeFileSync(
        new URL(`${id}-${frame}.png`, proof),
        Buffer.from(data.split(",")[1], "base64"),
      );
    await page.screenshot({
      path: new URL(`${id}-stopped.png`, proof).pathname,
    });
    await page.keyboard.press("Space");
    await page.waitForTimeout(100);
  }
});
