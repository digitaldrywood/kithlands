import {
  walkSheetKey,
  walkFrameIndex,
  walkSpriteScale,
  WALK_FRAME_COUNT,
} from "./walkFrame.js";
import fieldPresentation from "../../../shared/field_presentation.json";

// A breadcrumb follows the route already traversed by the leader. It does not
// submit movement, own custody, grant collision immunity, or advance objectives.
export function followerPoint(points, distance) {
  while (points.length > 2 && points[1].distance <= distance) points.shift();
  const a = points[0],
    b = points[1] || a;
  const t = Math.max(
    0,
    Math.min(1, (distance - a.distance) / (b.distance - a.distance || 1)),
  );
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function installEscortFollower(scene, tileSize) {
  if (scene.escortFollowerInstalled) return;
  scene.escortFollowerInstalled = true;
  let follower = null;
  const clear = () => {
    follower?.sprite.destroy();
    follower?.shadow.destroy();
    follower?.label.destroy();
    follower = null;
    scene.escortFollower = null;
  };
  const update = () => {
    const q = scene.gameState?.quests?.[scene.gameState?.current_quest];
    const p = q?.objectives;
    if (!scene.player?.active || !p?.companion || q.completed) {
      clear();
      return;
    }
    const key = walkSheetKey(p.companion_sprite);
    if (!scene.textures.exists(key)) {
      clear();
      return;
    }
    if (
      !follower ||
      follower.player !== scene.player ||
      follower.quest !== q.id
    ) {
      clear();
      const grid = scene.tileData || scene.tiles;
      const behind = {
        down: [0, -1],
        up: [0, 1],
        left: [1, 0],
        right: [-1, 0],
      }[scene.playerDir] || [0, -1];
      const offset = [behind, [0, 1], [-1, 0], [1, 0], [0, -1]].find(
        ([dx, dy]) => {
          const x = scene.playerX + dx,
            y = scene.playerY + dy;
          return (
            Number.isInteger(grid?.[y]?.[x]) &&
            scene.canWalkTile(grid[y][x]) &&
            !(scene.npcs || []).some((n) => n.x === x && n.y === y)
          );
        },
      ) || [0, 0];
      const x = scene.player.x + offset[0] * tileSize,
        y = scene.player.y + offset[1] * tileSize;
      const length = Math.hypot(x - scene.player.x, y - scene.player.y);
      const sprite = scene.add
        .sprite(
          x,
          y,
          key,
          walkFrameIndex(scene.playerDir, 0, p.companion_sprite),
        )
        .setOrigin(0.5, 1)
        .setScale(walkSpriteScale(tileSize, p.companion_sprite));
      const shadow = scene.add.ellipse(x, y - 2, 23, 7, 0x24382c, 0.3);
      const label = scene.add
        .text(x, y - tileSize, p.companion, {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: "#fff2cc",
          backgroundColor: "#142131dd",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 1);
      follower = {
        sprite,
        shadow,
        label,
        player: scene.player,
        quest: q.id,
        points: [
          { x, y, distance: 0 },
          { x: scene.player.x, y: scene.player.y, distance: length },
        ],
        distance: length,
        phase: 0,
      };
      scene.escortFollower = follower;
    }
    const tail = follower.points.at(-1);
    const moved = Math.hypot(scene.player.x - tail.x, scene.player.y - tail.y);
    if (moved > 0.01) {
      follower.distance += moved;
      follower.points.push({
        x: scene.player.x,
        y: scene.player.y,
        distance: follower.distance,
      });
    }
    const point = followerPoint(
      follower.points,
      follower.distance - tileSize * 1.25,
    );
    const dx = point.x - follower.sprite.x,
      dy = point.y - follower.sprite.y;
    const travel = Math.hypot(dx, dy);
    let dir = scene.playerDir;
    if (travel > 0.01) {
      dir =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up";
      follower.phase +=
        travel /
        (tileSize *
          (fieldPresentation.walk_cycles[p.companion_sprite]?.tiles || 3));
    }
    follower.sprite
      .setPosition(point.x, point.y)
      .setFrame(
        walkFrameIndex(
          dir,
          travel > 0.01
            ? Math.floor(follower.phase * WALK_FRAME_COUNT) % WALK_FRAME_COUNT
            : 0,
          p.companion_sprite,
        ),
      );
    const depth =
      scene.sys.settings.key === "World"
        ? 10 + point.y / 10000
        : scene.player.depth + ((point.y - scene.player.y) * 20) / tileSize;
    follower.sprite.setDepth(depth);
    follower.shadow.setPosition(point.x, point.y - 2).setDepth(depth - 0.1);
    follower.label
      .setPosition(point.x, point.y - follower.sprite.displayHeight + 2)
      .setDepth(depth + 0.1)
      .setVisible(scene.sys.settings.key === "World");
  };
  scene.events.on("postupdate", update);
  scene.events.once("shutdown", () => {
    scene.events.off("postupdate", update);
    clear();
    scene.escortFollowerInstalled = false;
  });
}
