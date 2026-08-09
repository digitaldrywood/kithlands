import { describe, expect, it } from "vitest";

import {
  BATTLE_CHARACTER_CATALOG,
  battleBodyAssets,
  battleProfileFor,
  battleStateFor,
} from "./battleCharacters.js";

describe("shared battle character catalog", () => {
  it("covers every runtime identity and required state name", () => {
    expect(BATTLE_CHARACTER_CATALOG.classes.map(({ id }) => id)).toEqual([
      "warrior",
      "brawler",
      "rogue",
      "mender",
      "cinder",
      "wayfarer",
      "knight",
      "champion",
      "shadow",
      "sage",
      "pyromancer",
      "wanderer",
    ]);
    expect(BATTLE_CHARACTER_CATALOG.required_states).toHaveLength(8);
  });

  it("deduplicates shared atlases while preserving state lookup", () => {
    expect(battleBodyAssets()).toEqual([
      {
        key: "battle_warrior_sword_attack_body",
        path: "/sprites/battle/warrior/sword-attack-body.png",
        frameSize: 192,
      },
      {
        key: "battle_mender_staff_cast_body",
        path: "/sprites/battle/mender/staff-cast-body.png",
        frameSize: 192,
      },
    ]);
    expect(battleStateFor("mender", "cast_class_ability").frames).toHaveLength(
      6,
    );
    expect(battleProfileFor("cinder").status).toBe("production_pending");
  });
});
