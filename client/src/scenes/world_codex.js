import { toggleMenu } from "./world_menu.js";

const ENEMY_SPRITES = {
  Slime: "monster_slime",
  Goblin: "monster_goblin",
  Wolf: "monster_wolf",
  Skeleton: "monster_skeleton",
  "Dark Knight": "monster_dark_knight",
};

export function toggleCodex(scene) {
  if (scene.codexOpen) {
    if (scene.codexGroup) scene.codexGroup.forEach((c) => c.destroy());
    scene.codexGroup = null;
    scene.codexOpen = false;
    return;
  }
  if (scene.menuOpen) toggleMenu(scene); // close menu first

  scene.codexOpen = true;
  scene.codexGroup = [];
  const gs = scene.gameState;

  const bg = scene.add
    .rectangle(400, 300, 750, 520, 0x0a0a22, 0.95)
    .setStrokeStyle(2, 0x4444aa)
    .setScrollFactor(0)
    .setDepth(40)
    .setInteractive();
  scene.codexGroup.push(bg);

  scene.add
    .text(400, 55, "CODEX", {
      fontSize: "20px",
      color: "#8888ff",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41);

  // Tab state
  let activeTab = "bestiary";
  let tabContent = [];

  const renderTab = (tab) => {
    tabContent.forEach((c) => c.destroy());
    tabContent = [];
    activeTab = tab;

    const startY = 120;
    switch (tab) {
      case "bestiary": {
        tabContent.push(
          scene.add
            .text(400, startY, "Monsters Encountered", {
              fontSize: "14px",
              color: "#ff8888",
              fontFamily: "monospace",
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(42),
        );

        // Show all monsters from game data, mark discovered ones
        const monsters = ["slime", "goblin", "wolf", "skeleton", "dark_knight"];
        let y = startY + 30;
        for (const id of monsters) {
          // For now show all -- progressive discovery would check gs.discovered
          const names = {
            slime: "Slime",
            goblin: "Goblin",
            wolf: "Wolf",
            skeleton: "Skeleton",
            dark_knight: "Dark Knight",
          };
          const hp = {
            slime: 12,
            goblin: 20,
            wolf: 35,
            skeleton: 50,
            dark_knight: 300,
          };
          const weak = {
            slime: "Fire",
            goblin: "-",
            wolf: "Fire",
            skeleton: "Fire, Holy",
            dark_knight: "Holy",
          };
          const xp = {
            slime: 6,
            goblin: 12,
            wolf: 30,
            skeleton: 50,
            dark_knight: 500,
          };

          const discovered = true; // TODO: check gs.discovered when available
          const name = discovered ? names[id] || id : "???";
          const color = discovered ? "#ffffff" : "#444444";

          let line = `${name}`;
          if (discovered) {
            line += `  |  HP: ${hp[id]}  |  Weak: ${weak[id]}  |  XP: ${xp[id]}`;
          }

          tabContent.push(
            scene.add
              .text(100, y, line, {
                fontSize: "11px",
                color,
                fontFamily: "monospace",
              })
              .setScrollFactor(0)
              .setDepth(42),
          );

          // Monster sprite
          const spriteKey = ENEMY_SPRITES[names[id]];
          if (spriteKey && scene.textures.exists(spriteKey) && discovered) {
            const s = scene.add
              .image(70, y + 5, spriteKey)
              .setScale(32 / Math.max(scene.textures.get(spriteKey).getSourceImage().width, 1))
              .setScrollFactor(0)
              .setDepth(42);
            tabContent.push(s);
          }

          y += 28;
        }
        break;
      }

      case "equipment": {
        tabContent.push(
          scene.add
            .text(400, startY, "Equipment Guide", {
              fontSize: "14px",
              color: "#ffcc44",
              fontFamily: "monospace",
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(42),
        );

        const sections = [
          {
            title: "Weapons",
            items: [
              { name: "Wooden Club", pow: 5, tier: 1, who: "Warrior, Mender" },
              {
                name: "Short Sword",
                pow: 6,
                tier: 1,
                who: "Warrior, Wayfarer",
              },
              {
                name: "Rusty Dagger",
                pow: 4,
                tier: 1,
                who: "Rogue, Cinder, Wayfarer",
              },
              {
                name: "Iron Sword",
                pow: 12,
                tier: 2,
                who: "Warrior, Wayfarer",
              },
              {
                name: "Steel Sword",
                pow: 22,
                tier: 3,
                who: "Warrior, Wayfarer",
              },
              {
                name: "Arcane Staff",
                pow: 14,
                tier: 3,
                who: "Mender, Cinder, Wayfarer",
              },
            ],
          },
          {
            title: "Armor",
            items: [
              { name: "Cloth Robe", pow: 2, tier: 1, who: "All casters" },
              {
                name: "Leather Armor",
                pow: 5,
                tier: 1,
                who: "Warrior, Rogue, Wayfarer",
              },
              {
                name: "Chain Mail",
                pow: 12,
                tier: 2,
                who: "Warrior, Wayfarer",
              },
              { name: "Plate Mail", pow: 22, tier: 3, who: "Warrior only" },
            ],
          },
        ];

        let y = startY + 25;
        for (const sec of sections) {
          tabContent.push(
            scene.add
              .text(100, y, sec.title, {
                fontSize: "12px",
                color: "#ffcc44",
                fontFamily: "monospace",
              })
              .setScrollFactor(0)
              .setDepth(42),
          );
          y += 20;
          for (const item of sec.items) {
            tabContent.push(
              scene.add
                .text(
                  120,
                  y,
                  `T${item.tier} ${item.name} (${sec.title === "Armor" ? "Abs" : "Pow"}:${item.pow}) - ${item.who}`,
                  {
                    fontSize: "10px",
                    color: "#cccccc",
                    fontFamily: "monospace",
                  },
                )
                .setScrollFactor(0)
                .setDepth(42),
            );
            y += 16;
          }
          y += 8;
        }
        break;
      }

      case "spells": {
        tabContent.push(
          scene.add
            .text(400, startY, "Spellbook", {
              fontSize: "14px",
              color: "#8888ff",
              fontFamily: "monospace",
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(42),
        );

        const schools = [
          {
            name: "Black Magic (Cinder)",
            color: "#ff6666",
            spells: [
              {
                name: "Spark",
                lvl: 1,
                desc: "Fire dmg to one",
                how: "Starting spell",
              },
              {
                name: "Frost",
                lvl: 1,
                desc: "Ice dmg to one",
                how: "Buy at magic shop",
              },
              {
                name: "Sleep",
                lvl: 1,
                desc: "Put enemy to sleep",
                how: "Buy at magic shop",
              },
              {
                name: "Ember",
                lvl: 2,
                desc: "Fire dmg to all",
                how: "Buy at magic shop",
              },
              {
                name: "Chill",
                lvl: 2,
                desc: "Ice dmg to all",
                how: "Buy at magic shop",
              },
              {
                name: "Shock",
                lvl: 2,
                desc: "Lightning dmg to one",
                how: "Buy at magic shop",
              },
            ],
          },
          {
            name: "White Magic (Mender)",
            color: "#66ff66",
            spells: [
              {
                name: "Cure",
                lvl: 1,
                desc: "Heal one ally ~16 HP",
                how: "Starting spell",
              },
              {
                name: "Light",
                lvl: 1,
                desc: "Illuminate dungeons",
                how: "Buy at magic shop",
              },
              {
                name: "Bless",
                lvl: 1,
                desc: "+10% hit to ally",
                how: "Buy at magic shop",
              },
              {
                name: "Heal",
                lvl: 2,
                desc: "Heal all allies ~16 HP",
                how: "Buy at magic shop",
              },
              {
                name: "Mute",
                lvl: 2,
                desc: "Silence one enemy",
                how: "Buy at magic shop",
              },
              {
                name: "Cure Poison",
                lvl: 2,
                desc: "Remove poison",
                how: "Buy at magic shop",
              },
            ],
          },
        ];

        let y = startY + 25;
        for (const school of schools) {
          tabContent.push(
            scene.add
              .text(100, y, school.name, {
                fontSize: "12px",
                color: school.color,
                fontFamily: "monospace",
              })
              .setScrollFactor(0)
              .setDepth(42),
          );
          y += 20;
          for (const sp of school.spells) {
            tabContent.push(
              scene.add
                .text(
                  120,
                  y,
                  `L${sp.lvl} ${sp.name} - ${sp.desc}  [${sp.how}]`,
                  {
                    fontSize: "10px",
                    color: "#cccccc",
                    fontFamily: "monospace",
                  },
                )
                .setScrollFactor(0)
                .setDepth(42),
            );
            y += 15;
          }
          y += 8;
        }
        break;
      }
    }

    // Store in codexGroup for cleanup
    tabContent.forEach((c) => scene.codexGroup.push(c));
  };

  // Tab buttons
  const tabs = [
    { label: "Bestiary", key: "bestiary" },
    { label: "Equipment", key: "equipment" },
    { label: "Spells", key: "spells" },
  ];
  let tx = 250;
  for (const tab of tabs) {
    const btn = scene.add
      .text(tx, 85, `[ ${tab.label} ]`, {
        fontSize: "12px",
        color: tab.key === activeTab ? "#ffffff" : "#666666",
        fontFamily: "monospace",
      })
      .setScrollFactor(0)
      .setDepth(41)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerdown", () => renderTab(tab.key));
    scene.codexGroup.push(btn);
    tx += 170;
  }

  // Close button
  const closeBtn = scene.add
    .text(400, 545, "[ CLOSE (H/ESC) ]", {
      fontSize: "13px",
      color: "#aaaaaa",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(41)
    .setInteractive({ useHandCursor: true });
  closeBtn.on("pointerdown", () => toggleCodex(scene));
  scene.codexGroup.push(closeBtn);

  // Show first tab
  renderTab("bestiary");
}
