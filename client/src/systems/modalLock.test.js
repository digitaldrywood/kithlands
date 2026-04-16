import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  activeWorldLocks,
  hasWorldLock,
  pauseWorldFor,
  resumeWorldFor,
  isWorldInputLocked,
  topWorldLock,
} from "./modalLock.js";

// Issue #133: modal overlays that sit on top of the World scene were leaking
// pointer / keyboard input through to the player, because not every overlay
// maintained a blocking flag. modalLock is the single authoritative
// reference-counted signal that input.js and world.js check.

describe("pauseWorldFor / resumeWorldFor", () => {
  let scene;
  let warnSpy;

  beforeEach(() => {
    scene = {};
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("a fresh scene is not locked", () => {
    expect(isWorldInputLocked(scene)).toBe(false);
  });

  it("pauseWorldFor locks the scene", () => {
    pauseWorldFor(scene, "party_menu");
    expect(isWorldInputLocked(scene)).toBe(true);
  });

  it("resumeWorldFor unlocks after the matching pause", () => {
    pauseWorldFor(scene, "party_menu");
    resumeWorldFor(scene, "party_menu");
    expect(isWorldInputLocked(scene)).toBe(false);
  });

  it("nested modals stay locked until all resume", () => {
    pauseWorldFor(scene, "party_menu");
    pauseWorldFor(scene, "character_detail");
    expect(activeWorldLocks(scene)).toEqual(["party_menu", "character_detail"]);
    expect(topWorldLock(scene)).toBe("character_detail");
    expect(hasWorldLock(scene, "party_menu")).toBe(true);
    resumeWorldFor(scene, "character_detail");
    expect(isWorldInputLocked(scene)).toBe(true);
    expect(topWorldLock(scene)).toBe("party_menu");
    resumeWorldFor(scene, "party_menu");
    expect(isWorldInputLocked(scene)).toBe(false);
    expect(topWorldLock(scene)).toBe(null);
  });

  it("closing nested modals in reverse or forward order both unlock", () => {
    pauseWorldFor(scene, "a");
    pauseWorldFor(scene, "b");
    resumeWorldFor(scene, "a");
    expect(isWorldInputLocked(scene)).toBe(true);
    resumeWorldFor(scene, "b");
    expect(isWorldInputLocked(scene)).toBe(false);
  });

  it("same-name pause twice then resume once unlocks (idempotent open)", () => {
    pauseWorldFor(scene, "party_menu");
    pauseWorldFor(scene, "party_menu");
    resumeWorldFor(scene, "party_menu");
    expect(isWorldInputLocked(scene)).toBe(false);
  });

  it("resumeWorldFor for an unknown name is a no-op (doesn't throw, doesn't unlock others)", () => {
    pauseWorldFor(scene, "party_menu");
    expect(() => resumeWorldFor(scene, "never_opened")).not.toThrow();
    expect(isWorldInputLocked(scene)).toBe(true);
  });

  it("resumeWorldFor on a fresh scene is a no-op", () => {
    expect(() => resumeWorldFor(scene, "party_menu")).not.toThrow();
    expect(isWorldInputLocked(scene)).toBe(false);
  });

  it("two scene objects track locks independently", () => {
    const sceneA = {};
    const sceneB = {};
    pauseWorldFor(sceneA, "party_menu");
    expect(isWorldInputLocked(sceneA)).toBe(true);
    expect(isWorldInputLocked(sceneB)).toBe(false);
  });
});

describe("isWorldInputLocked respects legacy flags", () => {
  it("returns true when scene.gameOver is set even without modal locks", () => {
    const scene = { gameOver: true };
    expect(isWorldInputLocked(scene)).toBe(true);
  });

  it("returns true when scene.animating is set even without modal locks", () => {
    const scene = { animating: true };
    expect(isWorldInputLocked(scene)).toBe(true);
  });

  it("returns false for a scene with all legacy flags cleared", () => {
    const scene = { gameOver: false, animating: false };
    expect(isWorldInputLocked(scene)).toBe(false);
  });
});
