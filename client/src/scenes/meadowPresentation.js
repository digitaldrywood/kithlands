import field from "../../../shared/field_presentation.json";
import { TILE_IDS } from "./tileConstants.js";

// Rendering-only: server tiles retain all collision and encounter semantics.
export function meadowGroundPlan(scene, plan, x, y) {
  const palette = field.meadow?.ground[plan.baseKey];
  if (!palette) return plan;
  const variant = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 8;
  const key = `meadow:${plan.baseKey}:${variant}`;
  if (!scene.textures.exists(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = palette[1 + (i % (palette.length - 1))];
      ctx.fillRect(
        (variant + i * 7) % 16,
        ((variant >>> 4) + i * 11) % 16,
        1,
        1,
      );
    }
    scene.textures.addCanvas(key, canvas);
  }
  const overlay =
    plan.overlay && field.meadow.ground[plan.overlay.key]
      ? {
          ...plan.overlay,
          key: meadowGroundPlan(
            scene,
            { baseKey: plan.overlay.key },
            plan.overlay.key === "tile_path" ? x : 0,
            plan.overlay.key === "tile_path" ? y : 0,
          ).baseKey,
          ...(plan.overlay.key === "tile_path"
            ? { edgeStyle: field.meadow.path_style, variant }
            : {}),
        }
      : plan.overlay;
  return { ...plan, baseKey: key, overlay };
}

export function drawMeadowDetails(scene, tileSize) {
  scene.meadowDetails?.forEach((object) => object.destroy());
  scene.meadowDetails = [];
  if (!scene.textures.exists(field.meadow.props.key)) return;
  const add = (x, y, frame, tree = false) => {
    const image = scene.add
      .image(
        (x + 0.5) * tileSize,
        (y + 1) * tileSize,
        field.meadow.props.key,
        frame,
      )
      .setOrigin(0.5, 1);
    image.setDepth(tree ? 10 + image.y / 10000 : 2);
    image.meadowCanopy = tree;
    scene.meadowDetails.push(image);
  };
  const center = scene.spawns.find((spawn) => spawn.tags?.includes("central"));
  if (center)
    for (const object of field.meadow.vignette.layers[0].objects) {
      const x = center.x + object.x / tileSize;
      const y = center.y + object.y / tileSize;
      if (scene.tileData[y]?.[x] === TILE_IDS.grass)
        add(
          x,
          y,
          object.properties.find((property) => property.name === "frame").value,
        );
    }
  for (let y = 0; y < scene.mapH; y++)
    for (let x = 0; x < scene.mapW; x++) {
      const tile = scene.tileData[y][x];
      const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if (
        tile === TILE_IDS.tree ||
        (tile === TILE_IDS.forest && hash % 13 === 0)
      ) {
        add(x, y, hash % 3 === 0 ? 1 : 0, true);
      } else if (
        (tile === TILE_IDS.grass || tile === TILE_IDS.darkGrass) &&
        hash % 31 === 0
      ) {
        add(x, y, 2 + (hash % 4));
      }
    }
}

export function updateMeadowDepth(scene) {
  if (!scene.player) return;
  scene.player.setDepth(10 + scene.player.y / 10000);
  scene.fieldShadow?.setPosition(scene.player.x, scene.player.y - 2);
  const view = scene.cameras.main.worldView;
  // Fade foreground leaves around nearby gathering sites as well as the
  // character. This is presentation only: no node or collision is moved.
  const nearbySites = (scene.gameState?.resources || []).filter(
    (node) =>
      !node.gathered &&
      Math.abs((node.x + 0.5) * 32 - scene.player.x) < 96 &&
      Math.abs((node.y + 0.95) * 32 - scene.player.y) < 96,
  );
  for (const object of scene.meadowDetails || []) {
    object.visible =
      object.x + 96 >= view.x &&
      object.x - 96 <= view.right &&
      object.y >= view.y &&
      object.y - 96 <= view.bottom;
    if (object.visible && object.meadowCanopy) {
      const behind =
        Math.abs(object.x - scene.player.x) < 38 &&
        object.y > scene.player.y &&
        object.y - scene.player.y < 80;
      const coversSite = nearbySites.some((node) => {
        const x = (node.x + 0.5) * 32;
        const y = (node.y + 0.95) * 32;
        return Math.abs(object.x - x) < 54 && object.y > y && object.y - y < 92;
      });
      object.setAlpha(coversSite ? 0.3 : behind ? 0.48 : 1);
    }
  }
}
