import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const proofDir = path.join("tmp", "readiness", `startup-${Date.now()}`);
mkdirSync(proofDir, { recursive: true });

for (const [width, height] of [
  [800, 600],
  [1280, 720],
  [390, 844],
]) {
  test(`fresh startup reaches Title at ${width}x${height}`, async ({
    page,
  }) => {
    const events = [];
    page.on("pageerror", (error) => events.push({ error: String(error) }));
    page.on("requestfailed", (request) =>
      events.push({ url: request.url(), failure: request.failure() }),
    );
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        events.push({ type: message.type(), text: message.text() });
    });
    await page.setViewportSize({ width, height });
    const started = Date.now();
    try {
      await page.goto("/");
      await page.waitForFunction(
        () => window.__kithlandsTest?.sceneIsActive("Title"),
        null,
        { timeout: 20000 },
      );
      expect(events.filter((event) => event.error)).toEqual([]);
    } finally {
      const state = await page.evaluate(() =>
        window.__kithlandsTest?.startupSnapshot(),
      );
      writeFileSync(
        path.join(proofDir, `${width}x${height}.json`),
        JSON.stringify(
          { elapsedMs: Date.now() - started, events, state },
          null,
          2,
        ),
      );
      await page.screenshot({
        path: path.join(proofDir, `${width}x${height}.png`),
        fullPage: true,
      });
    }
  });
}
