// Central registry for monster sprites. boot.js preloads every key in
// MONSTER_SPRITE_LOAD; battle.js looks up texture keys via ENEMY_SPRITES
// keyed by monster display name (matches `name` in shared/monsters.json).

export const MONSTER_SPRITE_LOAD = [
  { key: "monster_slime", path: "/sprites/monsters/slime.png" },
  { key: "monster_goblin", path: "/sprites/monsters/goblin.png" },
  { key: "monster_wolf", path: "/sprites/monsters/wolf.png" },
  { key: "monster_skeleton", path: "/sprites/monsters/skeleton.png" },
  { key: "monster_dark_knight", path: "/sprites/monsters/dark_knight.png" },
  { key: "monster_rat", path: "/sprites/monsters/rat.png" },
  { key: "monster_bandit", path: "/sprites/monsters/bandit.png" },
  { key: "monster_troll", path: "/sprites/monsters/troll.png" },
  { key: "monster_demon", path: "/sprites/monsters/demon.png" },
  { key: "monster_wyvern", path: "/sprites/monsters/wyvern.png" },
  { key: "monster_golem", path: "/sprites/monsters/golem.png" },
  { key: "monster_ghost", path: "/sprites/monsters/ghost.png" },
  { key: "monster_snake", path: "/sprites/monsters/snake.png" },
  { key: "monster_dragon", path: "/sprites/monsters/dragon.png" },
  { key: "monster_lich", path: "/sprites/monsters/lich.png" },
  // Extra sprites on disk with no dedicated monster yet — preload so future
  // monster additions only need an ENEMY_SPRITES entry.
  { key: "monster_bat", path: "/sprites/monsters/bat.png" },
  { key: "monster_orc", path: "/sprites/monsters/orc.png" },
  { key: "monster_spider", path: "/sprites/monsters/spider.png" },
  { key: "monster_mill_bat", path: "/sprites/monsters/mill_bat.png" },
  { key: "monster_briar_spider", path: "/sprites/monsters/briar_spider.png" },
  { key: "monster_rust_beetle", path: "/sprites/monsters/rust_beetle.png" },
  { key: "monster_moss_slime", path: "/sprites/monsters/moss_slime.png" },
  { key: "monster_millroot_warden", path: "/sprites/monsters/millroot_warden.png" },
];

export const ENEMY_SPRITES = {
  Slime: "monster_slime",
  Goblin: "monster_goblin",
  Wolf: "monster_wolf",
  Skeleton: "monster_skeleton",
  "Dark Knight": "monster_dark_knight",
  "Giant Rat": "monster_rat",
  Bandit: "monster_bandit",
  "Armored Knight": "monster_troll",
  Gargoyle: "monster_demon",
  Wyvern: "monster_wyvern",
  "Iron Golem": "monster_golem",
  "Shadow Wraith": "monster_ghost",
  "War Hydra": "monster_snake",
  "Elder Dragon": "monster_dragon",
  "Siege Commander": "monster_lich",
  "Dragon Lord": "monster_dragon",
  "Trial Guardian": "monster_dark_knight",
  "Mill Bat": "monster_mill_bat",
  "Briar Spider": "monster_briar_spider",
  "Rust Beetle": "monster_rust_beetle",
  "Moss Slime": "monster_moss_slime",
  "Millroot Warden": "monster_millroot_warden",
};
