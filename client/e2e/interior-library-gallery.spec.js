import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const run = Date.now();
const proof = new URL(`../tmp/interior-library-${run}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
const manifest = JSON.parse(
  readFileSync(
    new URL("../../shared/interior_library_manifest.json", import.meta.url),
  ),
);

for (const family of ["house", "inn", "shop", "temple"]) {
  test(`render every ${family} layout and reuse its art textures`, async ({
    page,
  }) => {
    // CI needs about four seconds per rendered floor; the largest family has 38.
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    const images = [];
    const expectedTextures = new Set();
    const entries = manifest.filter((entry) => entry.family === family);
    expect(entries).toHaveLength(25);
    for (const entry of entries) {
      const template = JSON.parse(
        readFileSync(
          new URL(`../../shared/interiors/${entry.id}.json`, import.meta.url),
        ),
      );
      for (const [floorIndex, floor] of template.floors.entries()) {
        const entrance = floor.entrance || floor.stairs[0];
        const playerStart = {
          x: entrance.x,
          y: entrance.y + (floor.entrance ? -1 : 1),
        };
        await page.evaluate(
          ({ template, floorIndex, playerStart }) => {
            const bridge = window.__kithlandsTest;
            bridge.startTownScene(
              {
                node_id: template.id,
                name: template.id,
                tags: [template.building_type],
                building_type: template.building_type,
                interior_template: template,
              },
              bridge.activeSceneKey(),
              { floorIndex, playerStart },
            );
          },
          { template, floorIndex, playerStart },
        );
        await page.evaluate(() =>
          window.__kithlandsTest.waitForSceneReady("Town"),
        );
        await expect
          .poll(() =>
            page.evaluate(
              () => window.__kithlandsTest.townSnapshot().floorIndex,
            ),
          )
          .toBe(floorIndex);
        await page.waitForTimeout(350);
        const snapshot = await page.evaluate(() => ({
          town: window.__kithlandsTest.townSnapshot(),
          size: window.__kithlandsTest.logicalGameSize("Town"),
        }));
        expect(snapshot.town.backgroundLoaded).toBe(true);
        expect(snapshot.town.templateId).toBe(template.id);
        const box = await page.locator("canvas").boundingBox();
        const scaleX = box.width / snapshot.size.width,
          scaleY = box.height / snapshot.size.height;
        const file = `${template.id}-floor-${floorIndex}.png`;
        await page.screenshot({
          path: new URL(file, proof).pathname,
          clip: {
            x: box.x + snapshot.town.offsetX * scaleX,
            y: box.y + snapshot.town.offsetY * scaleY,
            width: snapshot.town.roomW * 32 * scaleX,
            height: snapshot.town.roomH * 32 * scaleY,
          },
        });
        images.push({ file, label: `${template.id} · ${floorIndex + 1}` });
        expectedTextures.add(
          `interior_background:${floor.presentation.background_asset}`,
        );
        for (const prop of floor.presentation.props || [])
          expectedTextures.add(`interior_prop:${prop.asset}`);
        for (const asset of [
          floor.presentation.chest_closed_asset,
          floor.presentation.chest_open_asset,
        ])
          if (asset) expectedTextures.add(`interior_chest:${asset}`);
      }
    }
    expect(
      await page.evaluate(() =>
        window.__kithlandsTest.interiorTextureKeys().sort(),
      ),
    ).toEqual([...expectedTextures].sort());
    expect(errors).toEqual([]);
    await page.goto("about:blank");
    for (let offset = 0; offset < images.length; offset += 12) {
      const name = `${family}-gallery-${offset / 12 + 1}`;
      const figures = images
        .slice(offset, offset + 12)
        .map(
          ({ file, label }) =>
            `<figure><img src="data:image/png;base64,${readFileSync(new URL(file, proof)).toString("base64")}"><figcaption>${label}</figcaption></figure>`,
        )
        .join("");
      writeFileSync(
        new URL(`${name}.html`, proof),
        `<!doctype html><meta charset="utf-8"><title>${name}</title><style>body{margin:20px;background:#111923;color:#eee;font:13px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:5px 0}</style><h2>${family} — room review ${offset / 12 + 1}</h2><main>${figures}</main>`,
      );
      const html = readFileSync(new URL(`${name}.html`, proof), "utf8");
      await page.setContent(html);
      await page
        .locator("img")
        .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
      await page.screenshot({
        path: new URL(`${name}.png`, proof).pathname,
        fullPage: true,
      });
    }
  });
}
