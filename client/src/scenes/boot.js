import { MONSTER_SPRITE_LOAD } from "../data/monsterSprites.js";
import {
  RUNTIME_WALK_SHEET_CLASS_IDS,
  WALK_SHEET_CLASS_IDS,
  walkSheetFrameSize,
} from "./walkFrame.js";
import { registerGeneratedTerrainTextures } from "./terrainAutotile.js";
import { enumerateBackgrounds } from "./battleBackgrounds.js";
import {
  battleBodyAssets,
  battleWeaponAssets,
} from "../data/battleCharacters.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    // Loading bar
    const cx = 400,
      cy = 300;
    const bar = this.add.rectangle(cx, cy, 400, 20, 0x222222);
    const fill = this.add.rectangle(cx - 198, cy, 4, 16, 0x44ff44);

    this.load.on("progress", (value) => {
      fill.width = 396 * value;
      fill.x = cx - 198 + fill.width / 2;
    });

    this.add
      .text(cx, cy - 40, "KITHLANDS", {
        fontSize: "24px",
        color: "#ffffff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 30, "Loading...", {
        fontSize: "12px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Player directional sprites (idle pose, fallback when no class walk sheet)
    this.load.image("player_down", "/sprites/player_down.png");
    this.load.image("player_up", "/sprites/player_up.png");
    this.load.image("player_left", "/sprites/player_left.png");
    this.load.image("player_right", "/sprites/player_right.png");

    // Character sprites (base + promoted classes — must match CLASS_SPRITES
    // in battle.js and server's buildPartyMemberState sprite_id output)
    const CLASS_SPRITE_KEYS = WALK_SHEET_CLASS_IDS;
    for (const key of CLASS_SPRITE_KEYS) {
      this.load.image(key, `/sprites/${key}.png`);
    }

    // Per-class walk sprite sheets (#127/#140). These are generated from each
    // class portrait so all four movement directions preserve class identity.
    // Fallback player_{dir} sprites remain loaded for safety, but normal
    // movement should now use the class-specific walk sheet.
    const CLASSES_WITH_WALK_SHEETS = RUNTIME_WALK_SHEET_CLASS_IDS;
    for (const key of CLASSES_WITH_WALK_SHEETS) {
      const frameSize = walkSheetFrameSize(key);
      this.load.spritesheet(`${key}_walk`, `/sprites/walk/${key}_walk.png`, {
        frameWidth: frameSize,
        frameHeight: frameSize,
      });
    }

    // Authored battle bodies and equipment layers come from the shared
    // battle-character manifest. Bodies remain equipment-free; the server's
    // composition descriptor chooses the item visual at runtime.
    for (const asset of battleBodyAssets()) {
      this.load.spritesheet(asset.key, asset.path, {
        frameWidth: asset.frameSize,
        frameHeight: asset.frameSize,
      });
    }
    for (const asset of battleWeaponAssets()) {
      this.load.image(asset.key, asset.path);
    }

    // Status effect icons
    this.load.image("icon_poison", "/sprites/ui/icon_poison.png");
    this.load.image("icon_sleep", "/sprites/ui/icon_sleep.png");
    this.load.image("icon_mute", "/sprites/ui/icon_mute.png");
    this.load.image("icon_paralyze", "/sprites/ui/icon_paralyze.png");
    this.load.image("icon_slow", "/sprites/ui/icon_slow.png");
    this.load.image("icon_confuse", "/sprites/ui/icon_confuse.png");
    this.load.image("target_cursor", "/sprites/ui/target_cursor.png");
    for (const key of [
      "border_t",
      "border_b",
      "border_l",
      "border_r",
      "border_tl",
      "border_tr",
      "border_bl",
      "border_br",
      "border_fill",
    ]) {
      this.load.image(key, `/sprites/ui/${key}.png`);
    }

    // Monster sprites — see client/src/data/monsterSprites.js for the
    // single source of truth shared with battle.js ENEMY_SPRITES.
    for (const { key, path } of MONSTER_SPRITE_LOAD) {
      this.load.image(key, path);
    }

    // Music
    this.load.audio("music_title", "/audio/music/title.mp3");
    this.load.audio("music_overworld", "/audio/music/overworld.mp3");
    this.load.audio("music_battle", "/audio/music/battle.mp3");
    this.load.audio("music_boss", "/audio/music/boss.mp3");
    this.load.audio("music_victory", "/audio/music/victory.mp3");
    this.load.audio("music_defeat", "/audio/music/defeat.mp3");
    this.load.audio("music_levelup", "/audio/music/levelup.mp3");
    this.load.audio("music_inn", "/audio/music/inn.mp3");
    this.load.audio("music_shop", "/audio/music/shop.mp3");
    this.load.audio("music_quest", "/audio/music/quest.mp3");

    // SFX
    this.load.audio("sfx_slash", "/audio/sfx/slash.wav");
    this.load.audio("sfx_spell", "/audio/sfx/spell.wav");
    this.load.audio("sfx_fire", "/audio/sfx/fire.wav");
    this.load.audio("sfx_ice", "/audio/sfx/ice.wav");
    this.load.audio("sfx_lightning", "/audio/sfx/lightning.wav");
    this.load.audio("sfx_heal", "/audio/sfx/heal.wav");
    this.load.audio("sfx_crit", "/audio/sfx/crit.wav");
    this.load.audio("sfx_hit", "/audio/sfx/hit.wav");
    this.load.audio("sfx_party_hit", "/audio/sfx/party_hit.wav");
    this.load.audio("sfx_miss", "/audio/sfx/miss.wav");
    this.load.audio("sfx_death", "/audio/sfx/death.wav");
    this.load.audio("sfx_select", "/audio/sfx/select.wav");
    this.load.audio("sfx_cursor", "/audio/sfx/cursor.wav");
    this.load.audio("sfx_door", "/audio/sfx/door.wav");
    this.load.audio("sfx_treasure", "/audio/sfx/treasure.wav");
    this.load.audio("sfx_error", "/audio/sfx/error.wav");
    this.load.audio("sfx_encounter", "/audio/sfx/encounter.wav");
    this.load.audio("sfx_flee", "/audio/sfx/flee.wav");
    this.load.audio("sfx_save", "/audio/sfx/save.wav");
    this.load.audio("sfx_potion", "/audio/sfx/potion.wav");
    this.load.audio("sfx_equip", "/audio/sfx/equip.wav");

    this.load.image("object_chest_closed", "/sprites/objects/chest_closed.png");
    this.load.image("object_chest_open", "/sprites/objects/chest_open.png");
    this.load.image(
      "object_chest_sparkle",
      "/sprites/objects/chest_sparkle.png",
    );

    // Interior tilesets
    this.load.image("tile_altar", "/tilesets/interiors/altar.png");
    this.load.image("tile_bed", "/tilesets/interiors/bed.png");
    this.load.image("tile_bookshelf", "/tilesets/interiors/bookshelf.png");
    this.load.image("tile_candle", "/tilesets/interiors/candle.png");
    this.load.image("tile_chair", "/tilesets/interiors/chair.png");
    this.load.image("tile_counter", "/tilesets/interiors/counter.png");
    this.load.image("tile_crate", "/tilesets/interiors/crate.png");
    this.load.image("tile_desk", "/tilesets/interiors/desk.png");
    this.load.image("tile_door", "/tilesets/interiors/door.png");
    this.load.image("tile_fireplace", "/tilesets/interiors/fireplace.png");
    this.load.image("tile_house_floor", "/tilesets/interiors/house_floor.png");
    this.load.image(
      "tile_house_floor_b",
      "/tilesets/interiors/house_floor_b.png",
    );
    this.load.image(
      "tile_house_floor_c",
      "/tilesets/interiors/house_floor_c.png",
    );
    this.load.image(
      "tile_house_floor_d",
      "/tilesets/interiors/house_floor_d.png",
    );
    this.load.image("tile_house_wall", "/tilesets/interiors/house_wall.png");
    this.load.image(
      "tile_house_wall_b",
      "/tilesets/interiors/house_wall_b.png",
    );
    this.load.image(
      "tile_house_wall_c",
      "/tilesets/interiors/house_wall_c.png",
    );
    this.load.image("tile_inn_floor", "/tilesets/interiors/inn_floor.png");
    this.load.image("tile_inn_floor_b", "/tilesets/interiors/inn_floor_b.png");
    this.load.image("tile_inn_floor_c", "/tilesets/interiors/inn_floor_c.png");
    this.load.image("tile_inn_floor_d", "/tilesets/interiors/inn_floor_d.png");
    this.load.image("tile_inn_wall", "/tilesets/interiors/inn_wall.png");
    this.load.image("tile_inn_wall_b", "/tilesets/interiors/inn_wall_b.png");
    this.load.image("tile_inn_wall_c", "/tilesets/interiors/inn_wall_c.png");
    this.load.image("tile_lantern", "/tilesets/interiors/lantern.png");
    this.load.image("tile_locked_door", "/tilesets/interiors/locked_door.png");
    this.load.image("tile_pew", "/tilesets/interiors/pew.png");
    this.load.image("tile_rug_house", "/tilesets/interiors/rug_house.png");
    this.load.image("tile_rug_inn", "/tilesets/interiors/rug_inn.png");
    this.load.image("tile_rug_shop", "/tilesets/interiors/rug_shop.png");
    this.load.image("tile_rug_temple", "/tilesets/interiors/rug_temple.png");
    this.load.image("tile_shop_floor", "/tilesets/interiors/shop_floor.png");
    this.load.image(
      "tile_shop_floor_b",
      "/tilesets/interiors/shop_floor_b.png",
    );
    this.load.image(
      "tile_shop_floor_c",
      "/tilesets/interiors/shop_floor_c.png",
    );
    this.load.image(
      "tile_shop_floor_d",
      "/tilesets/interiors/shop_floor_d.png",
    );
    this.load.image("tile_shop_wall", "/tilesets/interiors/shop_wall.png");
    this.load.image("tile_shop_wall_b", "/tilesets/interiors/shop_wall_b.png");
    this.load.image("tile_shop_wall_c", "/tilesets/interiors/shop_wall_c.png");
    this.load.image(
      "tile_temple_floor",
      "/tilesets/interiors/temple_floor.png",
    );
    this.load.image(
      "tile_temple_floor_b",
      "/tilesets/interiors/temple_floor_b.png",
    );
    this.load.image(
      "tile_temple_floor_c",
      "/tilesets/interiors/temple_floor_c.png",
    );
    this.load.image(
      "tile_temple_floor_d",
      "/tilesets/interiors/temple_floor_d.png",
    );
    this.load.image("tile_temple_wall", "/tilesets/interiors/temple_wall.png");
    this.load.image(
      "tile_temple_wall_b",
      "/tilesets/interiors/temple_wall_b.png",
    );
    this.load.image(
      "tile_temple_wall_c",
      "/tilesets/interiors/temple_wall_c.png",
    );
    this.load.image("tile_statue", "/tilesets/interiors/statue.png");
    this.load.image("tile_stairs_down", "/tilesets/interiors/stairs_down.png");
    this.load.image("tile_stairs_up", "/tilesets/interiors/stairs_up.png");
    this.load.image("tile_table", "/tilesets/interiors/table.png");
    this.load.image("tile_window", "/tilesets/interiors/window.png");
    this.load.image("tile_secret_hint", "/tilesets/interiors/secret_hint.png");

    // Overworld terrain tilesets
    this.load.image("tile_grass", "/tilesets/grass.png");
    this.load.image("tile_path", "/tilesets/path.png");
    this.load.image("tile_water", "/tilesets/water.png");
    this.load.image("tile_tree", "/tilesets/tree.png");
    this.load.image("tile_rock", "/tilesets/rock.png");
    this.load.image("tile_bush", "/tilesets/bush.png");
    this.load.image("tile_dark_grass", "/tilesets/dark_grass.png");
    this.load.image("tile_forest", "/tilesets/forest.png");
    this.load.image("tile_hill", "/tilesets/hill.png");
    this.load.image("tile_sand", "/tilesets/sand.png");

    // Battle backgrounds (pre-rendered Gemini scenes, issue #258). Missing
    // files are expected until generate_battle_backgrounds.py has been run —
    // battle.js falls back to the procedural backdrop when the texture is
    // absent, and we swallow loaderror for these specific keys so the dev
    // console doesn't fill with 404s.
    // TODO(follow-up): 26 × ~700 KB backgrounds add ~17 MB to the Boot
    // preload payload. Consider moving these into a scene-level preload on
    // BattleScene (lazy-loaded on first battle) so the overworld boot is
    // lighter on slow connections.
    const bgKeys = new Set();
    for (const bg of enumerateBackgrounds()) {
      bgKeys.add(bg.key);
      this.load.image(bg.key, `/${bg.path}`);
    }
    this.load.on("loaderror", (file) => {
      if (file && bgKeys.has(file.key)) {
        // Expected: procedural fallback will handle it in battle.js.
        return;
      }
    });

    // NPC sprites
    this.load.image("npc_priestess", "/sprites/npcs/priestess.png");
    this.load.image("npc_merchant", "/sprites/npcs/merchant.png");
    this.load.image("npc_innkeeper", "/sprites/npcs/innkeeper.png");
    this.load.image("npc_blacksmith", "/sprites/npcs/blacksmith.png");
    this.load.image("npc_guard", "/sprites/npcs/guard.png");
    this.load.image("npc_elder", "/sprites/npcs/elder.png");
    this.load.image("npc_gossip", "/sprites/npcs/gossip.png");
    this.load.image("npc_quest_giver", "/sprites/npcs/quest_giver.png");
    this.load.image("npc_flavor_amber", "/sprites/npcs/flavor_amber.png");
    this.load.image("npc_flavor_bram", "/sprites/npcs/flavor_bram.png");
  }

  create() {
    registerGeneratedTerrainTextures(this);
    this.scene.start("Title");
  }
}
