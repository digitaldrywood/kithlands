import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { startWalkMotion } from "./walkMotion.js";
afterEach(() => vi.restoreAllMocks());
it("moves on the first rendered update without tween startup frames and lands exactly", () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const scene = {
    events: new EventEmitter(),
    tweens: { timeScale: 1 },
    player: {
      x: 80,
      y: 96,
      setPosition(x, y) {
        this.x = x;
        this.y = y;
      },
    },
  };
  const walk = { updatePosition: vi.fn() };
  const done = vi.fn();
  startWalkMotion(scene, { x: 112, y: 96 }, 120, walk, done);
  now = 30;
  scene.events.emit("update", 0, 16.6);
  expect(scene.player.x).toBe(88);
  now = 80;
  scene.events.emit("update", 0, 16.6);
  expect(scene.player.x).toBeCloseTo(101.3333);
  now = 150;
  scene.events.emit("update", 0, 16.6);
  expect(scene.player.x).toBe(112);
  expect(done).toHaveBeenCalledOnce();
  expect(walk.updatePosition).toHaveBeenCalledTimes(3);
  expect(scene.events.listenerCount("update")).toBe(0);
});
it("honors audit slow motion and removes callbacks on scene shutdown", () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const scene = {
    events: new EventEmitter(),
    tweens: { timeScale: 0.25 },
    player: {
      x: 0,
      y: 0,
      setPosition(x, y) {
        this.x = x;
        this.y = y;
      },
    },
  };
  const done = vi.fn();
  startWalkMotion(
    scene,
    { x: 32, y: 0 },
    160,
    { updatePosition: vi.fn() },
    done,
  );
  now = 160;
  scene.events.emit("update");
  expect(scene.player.x).toBe(8);
  scene.events.emit("shutdown");
  now = 1000;
  scene.events.emit("update");
  expect(scene.player.x).toBe(8);
  expect(done).not.toHaveBeenCalled();
});
