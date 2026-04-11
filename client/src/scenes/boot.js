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

    // Player directional sprites
    this.load.image("player_down", "/sprites/player_down.png");
    this.load.image("player_up", "/sprites/player_up.png");
    this.load.image("player_left", "/sprites/player_left.png");
    this.load.image("player_right", "/sprites/player_right.png");

    // Character sprites
    this.load.image("warrior", "/sprites/warrior.png");
    this.load.image("brawler", "/sprites/brawler.png");
    this.load.image("rogue", "/sprites/rogue.png");
    this.load.image("mender", "/sprites/mender.png");
    this.load.image("cinder", "/sprites/cinder.png");
    this.load.image("wayfarer", "/sprites/wayfarer.png");

    // Status effect icons
    this.load.image("icon_poison", "/sprites/ui/icon_poison.png");
    this.load.image("icon_sleep", "/sprites/ui/icon_sleep.png");
    this.load.image("icon_mute", "/sprites/ui/icon_mute.png");
    this.load.image("icon_paralyze", "/sprites/ui/icon_paralyze.png");
    this.load.image("icon_slow", "/sprites/ui/icon_slow.png");
    this.load.image("icon_confuse", "/sprites/ui/icon_confuse.png");

    // Monster sprites
    this.load.image("monster_slime", "/sprites/monsters/slime.png");
    this.load.image("monster_goblin", "/sprites/monsters/goblin.png");
    this.load.image("monster_wolf", "/sprites/monsters/wolf.png");
    this.load.image("monster_skeleton", "/sprites/monsters/skeleton.png");
    this.load.image("monster_dark_knight", "/sprites/monsters/dark_knight.png");

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

    // Interior tilesets
    this.load.image("tile_altar", "/tilesets/interiors/altar.png");
    this.load.image("tile_bed", "/tilesets/interiors/bed.png");
    this.load.image("tile_bookshelf", "/tilesets/interiors/bookshelf.png");
    this.load.image("tile_counter", "/tilesets/interiors/counter.png");
    this.load.image("tile_inn_floor", "/tilesets/interiors/inn_floor.png");
    this.load.image("tile_shop_floor", "/tilesets/interiors/shop_floor.png");
    this.load.image(
      "tile_temple_floor",
      "/tilesets/interiors/temple_floor.png",
    );
    this.load.image("tile_stone_wall", "/tilesets/interiors/stone_wall.png");
    this.load.image("tile_wooden_wall", "/tilesets/interiors/wooden_wall.png");

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

    // NPC sprites
    this.load.image("npc_priestess", "/sprites/npcs/priestess.png");
    this.load.image("npc_merchant", "/sprites/npcs/merchant.png");
    this.load.image("npc_innkeeper", "/sprites/npcs/innkeeper.png");
    this.load.image("npc_blacksmith", "/sprites/npcs/blacksmith.png");
    this.load.image("npc_guard", "/sprites/npcs/guard.png");
    this.load.image("npc_elder", "/sprites/npcs/elder.png");
  }

  create() {
    this.scene.start("Title");
  }
}
