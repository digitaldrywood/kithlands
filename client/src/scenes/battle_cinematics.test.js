import { describe, expect, it, vi } from "vitest";
import {
  battleElementStyle,
  buildAttackMotionPath,
  prefersReducedBattleMotion,
  spellTravelDuration,
} from "./battle_cinematics.js";

describe("battle cinematic motion", () => {
  it("moves either side close enough to make the attacker unmistakable", () => {
    const hero = { x: 540, y: 220, width: 72 };
    const monster = { x: 160, y: 230, width: 58 };

    const heroPath = buildAttackMotionPath(hero, monster);
    const monsterPath = buildAttackMotionPath(monster, hero);

    expect(heroPath.anticipation.x).toBeGreaterThan(hero.x);
    expect(heroPath.strike.x).toBeLessThan(hero.x - 200);
    expect(heroPath.apex.y).toBeLessThan(hero.y);
    expect(monsterPath.anticipation.x).toBeLessThan(monster.x);
    expect(monsterPath.strike.x).toBeGreaterThan(monster.x + 200);
  });

  it("keeps reduced-motion attacks local while retaining directional meaning", () => {
    const path = buildAttackMotionPath(
      { x: 540, y: 220, width: 72 },
      { x: 160, y: 230, width: 58 },
      true,
    );

    expect(path.anticipation).toEqual(path.origin);
    expect(Math.abs(path.strike.x - path.origin.x)).toBeLessThanOrEqual(14);
    expect(path.apex.y).toBeGreaterThanOrEqual(219);
  });

  it("maps elements to readable two-tone effects and scales projectile time", () => {
    expect(battleElementStyle("fire")).toMatchObject({ core: 0xff7a45 });
    expect(battleElementStyle("unknown")).toEqual(battleElementStyle("none"));
    expect(
      spellTravelDuration({ x: 0, y: 0 }, { x: 600, y: 0 }),
    ).toBeGreaterThan(spellTravelDuration({ x: 0, y: 0 }, { x: 100, y: 0 }));
  });

  it("honors the operating-system reduced-motion preference", () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn(() => ({ matches: true }));
    expect(prefersReducedBattleMotion()).toBe(true);
    globalThis.matchMedia = original;
  });
});
