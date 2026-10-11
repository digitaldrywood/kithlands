import { describe, expect, it, vi } from "vitest";
import { beginWalkStep } from "./walkPlayback.js";

function fixture() {
  const pending = [];
  const scene = {
    player: { x: 0, y: 0 },
    leaderClass: "cinder",
    playerDir: "right",
    time: {
      delayedCall: (_, callback) => {
        const timer = {
          callback,
          removed: false,
          remove() {
            this.removed = true;
          },
        };
        pending.push(timer);
        return timer;
      },
    },
  };
  return { scene, pending, setFrame: vi.fn() };
}
describe("distance-driven walk playback", () => {
  it("fits the Warrior's shorter stride to two tiles without changing other classes", () => {
    const { scene, setFrame } = fixture();
    scene.leaderClass = "warrior";
    beginWalkStep(scene, setFrame).update(0.5);
    expect(setFrame).toHaveBeenLastCalledWith(1);
    beginWalkStep(scene, setFrame).complete();
    expect(scene.walkPlayback.phase).toBeCloseTo(0.75);
  });
  it("preserves phase while a completed tile awaits server acknowledgement", () => {
    const { scene, pending, setFrame } = fixture();
    scene.animating = true;
    beginWalkStep(scene, setFrame).complete();
    pending.at(-1).callback();
    pending.at(-1).callback();
    expect(scene.walkPlayback.phase).toBeCloseTo(1 / 3);
    scene.animating = false;
    beginWalkStep(scene, setFrame).update(0.5);
    expect(setFrame).toHaveBeenLastCalledWith(3);
  });
  it("preserves the gait across tile boundaries without an idle flash", () => {
    const { scene, pending, setFrame } = fixture();
    for (let tile = 0; tile < 3; tile++) {
      const step = beginWalkStep(scene, setFrame);
      step.update(0.5);
      step.complete();
    }
    expect(setFrame.mock.calls.map(([frame]) => frame)).toEqual([
      0, 1, 2, 2, 3, 4, 4, 5, 0,
    ]);
    expect(pending.slice(0, -1).every((timer) => timer.removed)).toBe(true);
    pending.at(-1).callback();
    expect(scene.walkPlayback.phase).toBe(0);
  });
  it("shows idle while stationary without losing phase on a delayed next step", () => {
    const { scene, pending, setFrame } = fixture();
    const step = beginWalkStep(scene, setFrame);
    step.update(0.75);
    step.complete();
    pending.at(-1).callback();
    expect(setFrame).toHaveBeenLastCalledWith(0);
    beginWalkStep(scene, setFrame);
    expect(setFrame).toHaveBeenLastCalledWith(2);
  });
  it("resets phase on direction or sprite changes and cancels stale idle callbacks", () => {
    const { scene, pending, setFrame } = fixture();
    const step = beginWalkStep(scene, setFrame);
    step.complete();
    scene.playerDir = "up";
    beginWalkStep(scene, setFrame);
    expect(setFrame).toHaveBeenLastCalledWith(0);
    setFrame.mockClear();
    pending[0].callback();
    expect(setFrame).not.toHaveBeenCalled();
    scene.player = {};
    beginWalkStep(scene, setFrame);
    expect(setFrame).toHaveBeenLastCalledWith(0);
  });
});

it("uses the applied position even when tween progress has not advanced", () => {
  const { scene, setFrame } = fixture();
  const walk = beginWalkStep(scene, setFrame);
  scene.player.x = 24;
  walk.updatePosition();
  expect(setFrame).toHaveBeenLastCalledWith(1);
});
