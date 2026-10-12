import { describe, expect, it, vi } from "vitest";
import {
  battleElementStyle,
  battleCastOrigin,
  buildAttackMotionPath,
  cinematicActionKey,
  prefersReducedBattleMotion,
  shouldPlayMajorCinematic,
  spellTravelDuration,
} from "./battle_cinematics.js";

describe("battle cinematic motion", () => {
  it("registers spell emission to the rotated staff tip at actor scale", () => {
    const image = {
      visible: true,
      x: 20,
      y: -80,
      displayOriginX: 96,
      displayOriginY: 96,
      scaleX: 1,
      scaleY: 1,
      rotation: Math.PI / 2,
    };
    const actor = {
      x: 500,
      y: 200,
      sprite: {
        x: 500,
        y: 300,
        scaleX: 0.5,
        scaleY: 0.5,
        battleAttachmentLayers: [
          { emissionPoint: [96, 16], front: image, back: { visible: false } },
        ],
      },
    };
    expect(battleCastOrigin(actor)).toEqual({ x: 550, y: 260 });
    actor.sprite.battleCastSource = { x: 530, y: 210 };
    expect(battleCastOrigin(actor)).toEqual({ x: 530, y: 210 });
    expect(battleCastOrigin({ x: 80, y: 90 })).toEqual({ x: 80, y: 90 });
  });
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

  it("plays only major cinematics allowed by the player's repeat setting", () => {
    expect(shouldPlayMajorCinematic({ tier: "brisk", mode: "full" })).toBe(
      false,
    );
    expect(shouldPlayMajorCinematic({ tier: "major", mode: "full" })).toBe(
      true,
    );
    expect(shouldPlayMajorCinematic({ tier: "major", mode: "short" })).toBe(
      false,
    );
    expect(
      shouldPlayMajorCinematic({
        tier: "major",
        mode: "once",
        alreadySeen: true,
      }),
    ).toBe(false);
    expect(
      shouldPlayMajorCinematic({
        tier: "major",
        mode: "full",
        reducedMotion: true,
      }),
    ).toBe(false);
  });

  it("uses authoritative action ids for per-battle repeat suppression", () => {
    expect(
      cinematicActionKey({
        kind: "spell",
        action_id: "fireball",
        action_name: "Fireball",
      }),
    ).toBe("spell:fireball");
    expect(
      cinematicActionKey({ kind: "ability", action_name: "Backstab" }),
    ).toBe("ability:backstab");
  });
});
