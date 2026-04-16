import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(SPEC_DIR, "tmp");

mkdirSync(PROOF_DIR, { recursive: true });

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startQuickGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function sampleCanvasPixel(page, x, y) {
  return page.evaluate(
    ({ sx, sy }) => {
      const canvas = document.querySelector("canvas");
      if (!canvas) throw new Error("Game canvas not found");
      const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx2d) {
        return Array.from(ctx2d.getImageData(sx, sy, 1, 1).data);
      }

      const gl =
        canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ||
        canvas.getContext("webgl", { preserveDrawingBuffer: true });
      if (!gl) throw new Error("Canvas context unavailable");

      const pixel = new Uint8Array(4);
      gl.readPixels(
        sx,
        canvas.height - sy - 1,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      return Array.from(pixel);
    },
    { sx: x, sy: y },
  );
}

async function expectInteriorProof(page, spawn, expected) {
  await page.evaluate(
    (nextSpawn) => window.__kithlandsTest.startTownScene(nextSpawn),
    spawn,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Town"),
  );
  await page.waitForTimeout(200);

  const details = await page.evaluate(() =>
    window.__kithlandsTest.townSnapshot("Town"),
  );

  expect(details.buildingType).toBe(expected.buildingType);
  expect(details.roomW).toBeGreaterThanOrEqual(expected.roomWMin);
  expect(details.roomW).toBeLessThanOrEqual(expected.roomWMax);
  expect(details.roomH).toBeGreaterThanOrEqual(expected.roomHMin);
  expect(details.roomH).toBeLessThanOrEqual(expected.roomHMax);
  expect(details.offsetX).toBeGreaterThan(0);
  expect(details.offsetY).toBeGreaterThan(0);

  const cornerPixel = await sampleCanvasPixel(page, 5, 5);
  expect(cornerPixel).toEqual([0, 0, 0, 255]);

  await page.locator("canvas").screenshot({
    path: path.join(
      PROOF_DIR,
      `issue-178-${expected.buildingType}-${RUN_ID}.png`,
    ),
  });
}

test.describe("FF-style town interiors", () => {
  test("renders black-backed larger inn and shop interiors", async ({
    page,
  }) => {
    await startQuickGame(page);

    await expectInteriorProof(
      page,
      {
        node_id: "proof_inn",
        name: "Copper Kettle Inn",
        tags: ["rest"],
      },
      {
        buildingType: "inn",
        roomWMin: 18,
        roomWMax: 20,
        roomHMin: 12,
        roomHMax: 14,
      },
    );

    await expectInteriorProof(
      page,
      {
        node_id: "proof_shop",
        name: "Briar Goods",
        tags: ["shop"],
      },
      {
        buildingType: "shop",
        roomWMin: 14,
        roomWMax: 18,
        roomHMin: 10,
        roomHMax: 13,
      },
    );
  });
});
