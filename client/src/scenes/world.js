import { gameAction, getShop, buyItem, equipItem, learnSpell } from '../api.js';

const ENEMY_SPRITES = {
  'Slime': 'monster_slime', 'Goblin': 'monster_goblin', 'Wolf': 'monster_wolf',
  'Skeleton': 'monster_skeleton', 'Dark Knight': 'monster_dark_knight',
};

// Tile colors for programmatic rendering
const TILE_COLORS = {
  0: 0x4CAF50, // grass
  1: 0xD2B48C, // path
  2: 0x2196F3, // water
  3: 0x2E7D32, // tree
  4: 0x795548, // building
  5: 0xFFC107, // door
  6: 0xBCAAA4, // floor
  7: 0x9E9E9E, // rock
  8: 0x66BB6A, // bush
  9: 0x388E3C, // dark grass
};

const TILE_WALKABLE = {
  0: true,  // grass
  1: true,  // path
  2: false, // water
  3: false, // tree
  4: false, // building
  5: true,  // door
  6: true,  // floor
  7: false, // rock
  8: false, // bush
  9: true,  // dark grass
};

const TILE_SIZE = 16;
const SCALE = 2;
const RENDERED_TILE = TILE_SIZE * SCALE;

// Cache tilemap and player position across scene restarts
let cachedTileMap = null;
let cachedPlayerX = null;
let cachedPlayerY = null;
let cachedPlayerDir = 'down';

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  init(data) {
    this.gameState = data.gameState;
    // Cache tilemap from initial game creation
    if (this.gameState.tilemap) {
      cachedTileMap = this.gameState.tilemap;
    }
    console.log('[World] init, phase:', this.gameState?.phase, 'tilemap cached:', !!cachedTileMap);
  }

  create() {
    this.stepCount = 0;
    this.animating = false;
    this.gameOver = false;

    const gs = this.gameState;

    // Handle non-world phases
    if (gs.phase === 'victory') {
      this.gameOver = true;
      this.showEndScreen('VICTORY!', `${gs.location} is saved!`, '#ffff44', gs);
      return;
    }
    if (gs.phase === 'defeat') {
      this.gameOver = true;
      this.showEndScreen('DEFEAT', 'Your party has fallen.', '#ff4444', gs);
      return;
    }
    if (gs.phase === 'combat') {
      console.log('[World] redirecting to Battle');
      this.scene.start('Battle', { gameState: gs });
      return;
    }

    const tm = cachedTileMap;
    if (!tm) {
      console.error('[World] no tilemap available');
      this.add.text(400, 300, 'Error: no tilemap. Try restarting the game.', {
        fontSize: '14px', color: '#ff4444', fontFamily: 'monospace',
      }).setOrigin(0.5);
      return;
    }

    this.tileData = tm.tiles;
    this.mapW = tm.width;
    this.mapH = tm.height;
    // Restore cached position or use tilemap default
    this.playerX = cachedPlayerX !== null ? cachedPlayerX : tm.player_x;
    this.playerY = cachedPlayerY !== null ? cachedPlayerY : tm.player_y;
    this.spawns = tm.spawns || [];

    // World bounds
    const worldW = this.mapW * RENDERED_TILE;
    const worldH = this.mapH * RENDERED_TILE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Draw tilemap
    this.tileGraphics = this.add.graphics();
    this.drawMap();

    // Location labels
    this.drawLabels();

    // Player sprite (directional, restore cached direction)
    this.playerDir = cachedPlayerDir;
    this.player = this.add.image(
      this.playerX * RENDERED_TILE + RENDERED_TILE / 2,
      this.playerY * RENDERED_TILE + RENDERED_TILE / 2,
      `player_${this.playerDir}`
    ).setDepth(10).setScale(SCALE);

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.menuOpen = false;
    this.menuGroup = null;

    // M key opens menu, H opens codex
    this.input.keyboard.on('keydown-M', () => this.toggleMenu());
    this.input.keyboard.on('keydown-H', () => this.toggleCodex());
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.codexOpen) this.toggleCodex();
      else if (this.menuOpen) this.toggleMenu();
    });
    this.codexOpen = false;
    this.codexGroup = null;

    // Enter/Space to interact with doors
    this.currentDoorSpawn = null;
    this.interactPrompt = null;
    this.input.keyboard.on('keydown-ENTER', () => this.interactWithDoor());
    this.input.keyboard.on('keydown-SPACE', () => this.interactWithDoor());

    // Touch movement
    this.input.on('pointerdown', (pointer) => {
      if (this.animating || this.menuOpen || this.codexOpen || this.gameOver) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(worldPoint.x / RENDERED_TILE);
      const ty = Math.floor(worldPoint.y / RENDERED_TILE);
      const dx = tx - this.playerX;
      const dy = ty - this.playerY;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.tryMove(dx > 0 ? 1 : -1, 0);
      } else if (dy !== 0) {
        this.tryMove(0, dy > 0 ? 1 : -1);
      }
    });

    // HUD
    this.add.rectangle(400, 585, 800, 30, 0x000000, 0.8).setScrollFactor(0).setDepth(20);
    this.hudText = this.add.text(10, 575, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(21);
    this.updateHUD();

    // Quest indicator
    this.questText = this.add.text(10, 5, '', {
      fontSize: '11px', color: '#ffff44', fontFamily: 'monospace',
      backgroundColor: '#00000099',
      padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(21);
    this.updateQuestDisplay();

    // Message overlay
    this.messageText = this.add.text(400, 300, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#000000dd',
      padding: { x: 16, y: 12 },
      wordWrap: { width: 500 },
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30).setVisible(false);

    // Show any pending message from last action (quest complete, level up, etc.)
    if (gs.message) {
      this.showMessage(gs.message);
      this.time.delayedCall(3000, () => this.hideMessage());
    }
    if (gs.combat_log) {
      for (const line of gs.combat_log) {
        if (line.includes('leveled up') || line.includes('Victory') || line.includes('Quest complete')) {
          this.showMessage(line);
          this.time.delayedCall(3000, () => this.hideMessage());
        }
      }
    }

    // HUD buttons
    const codexBtn = this.add.text(690, 575, '[H]elp', {
      fontSize: '12px', color: '#8888ff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(21).setInteractive({ useHandCursor: true });
    codexBtn.on('pointerdown', () => this.toggleCodex());

    const menuBtn = this.add.text(760, 575, '[M]enu', {
      fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(21).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerdown', () => this.toggleMenu());

    this.lastMoveTime = 0;
    this.moveCooldown = 150;

    console.log('[World] created, player at', this.playerX, this.playerY);
  }

  toggleMenu() {
    if (this.menuOpen) {
      if (this.menuGroup) {
        this.menuGroup.forEach(c => c.destroy());
        this.menuGroup = null;
      }
      this.menuOpen = false;
      return;
    }

    this.menuOpen = true;
    this.menuGroup = [];
    const gs = this.gameState;

    // Background panel (wider for equipment) -- interactive to block clicks through to map
    const bg = this.add.rectangle(400, 300, 700, 500, 0x000000, 0.95)
      .setScrollFactor(0).setDepth(40).setInteractive();
    this.menuGroup.push(bg);

    const title = this.add.text(400, 65, 'PARTY MENU', {
      fontSize: '18px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.menuGroup.push(title);

    let y = 95;
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const eq = gs.equipment ? gs.equipment[i] : {};

      // Name and stats
      const line = this.add.text(80, y,
        `${p.name} (${p.class_name}) Lv.${p.level}  HP:${p.hp}/${p.max_hp}  STR:${p.str} AGI:${p.agi} INT:${p.int_stat}`,
        { fontSize: '11px', color: '#ffffff', fontFamily: 'monospace' }
      ).setScrollFactor(0).setDepth(41);
      this.menuGroup.push(line);

      // XP
      const xpLine = this.add.text(80, y + 16,
        `  XP: ${p.xp}/${p.xp_next}`,
        { fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace' }
      ).setScrollFactor(0).setDepth(41);
      this.menuGroup.push(xpLine);

      // Equipment
      const weaponName = eq.weapon_name || 'None';
      const armorName = eq.armor_name || 'None';
      const eqLine = this.add.text(80, y + 30,
        `  Weapon: ${weaponName}  |  Armor: ${armorName}`,
        { fontSize: '10px', color: '#ffcc44', fontFamily: 'monospace' }
      ).setScrollFactor(0).setDepth(41);
      this.menuGroup.push(eqLine);

      // Equip buttons
      const eqWpnBtn = this.add.text(540, y + 28, '[Equip Wpn]', {
        fontSize: '9px', color: '#44aaff', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
      eqWpnBtn.on('pointerdown', () => this.showEquipPicker(i, 'weapon'));
      this.menuGroup.push(eqWpnBtn);

      const eqArmBtn = this.add.text(630, y + 28, '[Equip Arm]', {
        fontSize: '9px', color: '#44aaff', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
      eqArmBtn.on('pointerdown', () => this.showEquipPicker(i, 'armor'));
      this.menuGroup.push(eqArmBtn);

      // Spells
      if (p.spells && p.spells.length > 0) {
        const spells = this.add.text(80, y + 44,
          `  Spells: ${p.spells.map(s => `${s.name}(${s.charges})`).join(', ')}`,
          { fontSize: '9px', color: '#8888ff', fontFamily: 'monospace' }
        ).setScrollFactor(0).setDepth(41);
        this.menuGroup.push(spells);
        y += 65;
      } else {
        y += 52;
      }
    }

    // Gold, potions, items
    y += 5;
    const inv = this.add.text(80, y,
      `Gold: ${gs.gold}  |  Potions: ${gs.potions}`,
      { fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(41);
    this.menuGroup.push(inv);

    // Other items
    if (gs.items && gs.items.length > 0) {
      y += 18;
      const itemStr = gs.items.map(i => `${i.name}(${i.count})`).join(', ');
      const itemLine = this.add.text(80, y, `Items: ${itemStr}`, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(41);
      this.menuGroup.push(itemLine);
    }

    // Use potion button
    if (gs.potions > 0) {
      const useBtn = this.add.text(400, y + 35, '[ USE POTION ]', {
        fontSize: '13px', color: '#44ff44', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
      useBtn.on('pointerover', () => useBtn.setColor('#88ff88'));
      useBtn.on('pointerout', () => useBtn.setColor('#44ff44'));
      useBtn.on('pointerdown', () => this.useOverworldPotion());
      this.menuGroup.push(useBtn);
    }

    // Close
    const closeBtn = this.add.text(400, 530, '[ CLOSE (M/ESC) ]', {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleMenu());
    this.menuGroup.push(closeBtn);
  }

  toggleCodex() {
    if (this.codexOpen) {
      if (this.codexGroup) this.codexGroup.forEach(c => c.destroy());
      this.codexGroup = null;
      this.codexOpen = false;
      return;
    }
    if (this.menuOpen) this.toggleMenu(); // close menu first

    this.codexOpen = true;
    this.codexGroup = [];
    const gs = this.gameState;

    const bg = this.add.rectangle(400, 300, 750, 520, 0x0a0a22, 0.95)
      .setStrokeStyle(2, 0x4444aa).setScrollFactor(0).setDepth(40).setInteractive();
    this.codexGroup.push(bg);

    this.add.text(400, 55, 'CODEX', {
      fontSize: '20px', color: '#8888ff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41);

    // Tab state
    let activeTab = 'bestiary';
    let tabContent = [];

    const renderTab = (tab) => {
      tabContent.forEach(c => c.destroy());
      tabContent = [];
      activeTab = tab;

      const startY = 120;
      switch (tab) {
        case 'bestiary': {
          tabContent.push(this.add.text(400, startY, 'Monsters Encountered', {
            fontSize: '14px', color: '#ff8888', fontFamily: 'monospace',
          }).setOrigin(0.5).setScrollFactor(0).setDepth(42));

          // Show all monsters from game data, mark discovered ones
          const monsters = ['slime', 'goblin', 'wolf', 'skeleton', 'dark_knight'];
          let y = startY + 30;
          for (const id of monsters) {
            // For now show all -- progressive discovery would check gs.discovered
            const names = { slime: 'Slime', goblin: 'Goblin', wolf: 'Wolf', skeleton: 'Skeleton', dark_knight: 'Dark Knight' };
            const hp = { slime: 12, goblin: 20, wolf: 35, skeleton: 50, dark_knight: 300 };
            const weak = { slime: 'Fire', goblin: '-', wolf: 'Fire', skeleton: 'Fire, Holy', dark_knight: 'Holy' };
            const xp = { slime: 6, goblin: 12, wolf: 30, skeleton: 50, dark_knight: 500 };

            const discovered = true; // TODO: check gs.discovered when available
            const name = discovered ? (names[id] || id) : '???';
            const color = discovered ? '#ffffff' : '#444444';

            let line = `${name}`;
            if (discovered) {
              line += `  |  HP: ${hp[id]}  |  Weak: ${weak[id]}  |  XP: ${xp[id]}`;
            }

            tabContent.push(this.add.text(100, y, line, {
              fontSize: '11px', color, fontFamily: 'monospace',
            }).setScrollFactor(0).setDepth(42));

            // Monster sprite
            const spriteKey = ENEMY_SPRITES[names[id]];
            if (spriteKey && this.textures.exists(spriteKey) && discovered) {
              const s = this.add.image(70, y + 5, spriteKey).setScale(0.5).setScrollFactor(0).setDepth(42);
              tabContent.push(s);
            }

            y += 28;
          }
          break;
        }

        case 'equipment': {
          tabContent.push(this.add.text(400, startY, 'Equipment Guide', {
            fontSize: '14px', color: '#ffcc44', fontFamily: 'monospace',
          }).setOrigin(0.5).setScrollFactor(0).setDepth(42));

          const sections = [
            { title: 'Weapons', items: [
              { name: 'Wooden Club', pow: 5, tier: 1, who: 'Warrior, Mender' },
              { name: 'Short Sword', pow: 6, tier: 1, who: 'Warrior, Wayfarer' },
              { name: 'Rusty Dagger', pow: 4, tier: 1, who: 'Rogue, Cinder, Wayfarer' },
              { name: 'Iron Sword', pow: 12, tier: 2, who: 'Warrior, Wayfarer' },
              { name: 'Steel Sword', pow: 22, tier: 3, who: 'Warrior, Wayfarer' },
              { name: 'Arcane Staff', pow: 14, tier: 3, who: 'Mender, Cinder, Wayfarer' },
            ]},
            { title: 'Armor', items: [
              { name: 'Cloth Robe', pow: 2, tier: 1, who: 'All casters' },
              { name: 'Leather Armor', pow: 5, tier: 1, who: 'Warrior, Rogue, Wayfarer' },
              { name: 'Chain Mail', pow: 12, tier: 2, who: 'Warrior, Wayfarer' },
              { name: 'Plate Mail', pow: 22, tier: 3, who: 'Warrior only' },
            ]},
          ];

          let y = startY + 25;
          for (const sec of sections) {
            tabContent.push(this.add.text(100, y, sec.title, {
              fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace',
            }).setScrollFactor(0).setDepth(42));
            y += 20;
            for (const item of sec.items) {
              tabContent.push(this.add.text(120, y,
                `T${item.tier} ${item.name} (${sec.title === 'Armor' ? 'Abs' : 'Pow'}:${item.pow}) - ${item.who}`,
                { fontSize: '10px', color: '#cccccc', fontFamily: 'monospace' }
              ).setScrollFactor(0).setDepth(42));
              y += 16;
            }
            y += 8;
          }
          break;
        }

        case 'spells': {
          tabContent.push(this.add.text(400, startY, 'Spellbook', {
            fontSize: '14px', color: '#8888ff', fontFamily: 'monospace',
          }).setOrigin(0.5).setScrollFactor(0).setDepth(42));

          const schools = [
            { name: 'Black Magic (Cinder)', color: '#ff6666', spells: [
              { name: 'Spark', lvl: 1, desc: 'Fire dmg to one', how: 'Starting spell' },
              { name: 'Frost', lvl: 1, desc: 'Ice dmg to one', how: 'Buy at magic shop' },
              { name: 'Sleep', lvl: 1, desc: 'Put enemy to sleep', how: 'Buy at magic shop' },
              { name: 'Ember', lvl: 2, desc: 'Fire dmg to all', how: 'Buy at magic shop' },
              { name: 'Chill', lvl: 2, desc: 'Ice dmg to all', how: 'Buy at magic shop' },
              { name: 'Shock', lvl: 2, desc: 'Lightning dmg to one', how: 'Buy at magic shop' },
            ]},
            { name: 'White Magic (Mender)', color: '#66ff66', spells: [
              { name: 'Cure', lvl: 1, desc: 'Heal one ally ~16 HP', how: 'Starting spell' },
              { name: 'Light', lvl: 1, desc: 'Illuminate dungeons', how: 'Buy at magic shop' },
              { name: 'Bless', lvl: 1, desc: '+10% hit to ally', how: 'Buy at magic shop' },
              { name: 'Heal', lvl: 2, desc: 'Heal all allies ~16 HP', how: 'Buy at magic shop' },
              { name: 'Mute', lvl: 2, desc: 'Silence one enemy', how: 'Buy at magic shop' },
              { name: 'Cure Poison', lvl: 2, desc: 'Remove poison', how: 'Buy at magic shop' },
            ]},
          ];

          let y = startY + 25;
          for (const school of schools) {
            tabContent.push(this.add.text(100, y, school.name, {
              fontSize: '12px', color: school.color, fontFamily: 'monospace',
            }).setScrollFactor(0).setDepth(42));
            y += 20;
            for (const sp of school.spells) {
              tabContent.push(this.add.text(120, y,
                `L${sp.lvl} ${sp.name} - ${sp.desc}  [${sp.how}]`,
                { fontSize: '10px', color: '#cccccc', fontFamily: 'monospace' }
              ).setScrollFactor(0).setDepth(42));
              y += 15;
            }
            y += 8;
          }
          break;
        }
      }

      // Store in codexGroup for cleanup
      tabContent.forEach(c => this.codexGroup.push(c));
    };

    // Tab buttons
    const tabs = [
      { label: 'Bestiary', key: 'bestiary' },
      { label: 'Equipment', key: 'equipment' },
      { label: 'Spells', key: 'spells' },
    ];
    let tx = 250;
    for (const tab of tabs) {
      const btn = this.add.text(tx, 85, `[ ${tab.label} ]`, {
        fontSize: '12px', color: tab.key === activeTab ? '#ffffff' : '#666666', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => renderTab(tab.key));
      this.codexGroup.push(btn);
      tx += 170;
    }

    // Close button
    const closeBtn = this.add.text(400, 545, '[ CLOSE (H/ESC) ]', {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleCodex());
    this.codexGroup.push(closeBtn);

    // Show first tab
    renderTab('bestiary');
  }

  async showEquipPicker(slot, type) {
    // Close menu first
    if (this.menuGroup) {
      this.menuGroup.forEach(c => c.destroy());
      this.menuGroup = null;
    }

    const gs = this.gameState;
    const overlay = [];

    // Find available items from inventory
    const prefix = type === 'weapon' ? 'wpn_' : 'arm_';
    const available = [];

    // Get items from game state inventory
    if (gs.items) {
      for (const item of gs.items) {
        if (item.id.startsWith(prefix)) {
          const realId = item.id.substring(prefix.length);
          available.push({ id: realId, name: item.name, count: item.count });
        }
      }
    }

    // Also check consumables for prefixed items
    // These come through as items in the state

    const bg = this.add.rectangle(400, 300, 400, 200 + available.length * 30, 0x111144, 0.95)
      .setStrokeStyle(2, 0x4444aa).setScrollFactor(0).setDepth(50);
    overlay.push(bg);

    const title = this.add.text(400, 220, `Equip ${type} for ${gs.party[slot].name}:`, {
      fontSize: '13px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    overlay.push(title);

    if (available.length === 0) {
      const none = this.add.text(400, 280, 'No items available.\nBuy gear at the General Store!', {
        fontSize: '12px', color: '#666666', fontFamily: 'monospace', align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
      overlay.push(none);
    } else {
      let y = 255;
      for (const item of available) {
        const row = this.add.text(400, y, `${item.name} (x${item.count})`, {
          fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
        row.on('pointerover', () => row.setColor('#ffffff'));
        row.on('pointerout', () => row.setColor('#aaaaff'));
        row.on('pointerdown', async () => {
          const result = await equipItem(gs.id, slot, item.id, type);
          if (!result.error) {
            this.gameState = result;
            this.showMessage(`Equipped: ${item.name}`);
            this.updateHUD();
            this.time.delayedCall(1000, () => this.hideMessage());
          }
          overlay.forEach(o => o.destroy());
          this.menuOpen = false;
        });
        overlay.push(row);
        y += 30;
      }
    }

    const closeBtn = this.add.text(400, 380 + available.length * 15, '[ CANCEL ]', {
      fontSize: '11px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      overlay.forEach(o => o.destroy());
      this.menuOpen = false;
    });
    overlay.push(closeBtn);
  }

  useOverworldPotion() {
    const gs = this.gameState;
    if (gs.potions <= 0) return;

    // Find most damaged living party member
    let target = null;
    for (const p of gs.party) {
      if (p.hp > 0 && p.hp < p.max_hp) {
        if (!target || p.hp < target.hp) target = p;
      }
    }
    if (!target) {
      this.showMessage('No one needs healing.');
      this.time.delayedCall(1500, () => this.hideMessage());
      return;
    }

    // Apply locally (server will validate on next action)
    target.hp = Math.min(target.max_hp, target.hp + 30);
    gs.potions--;
    this.showMessage(`${target.name} used a Potion. HP: ${target.hp}/${target.max_hp}`);
    this.time.delayedCall(1500, () => this.hideMessage());
    this.toggleMenu(); // close and reopen to refresh
    this.updateHUD();
  }

  update(time) {
    if (this.gameOver || this.animating || this.menuOpen || this.codexOpen) return;
    if (!this.hudText || !this.player) return; // scene destroyed
    if (time - this.lastMoveTime < this.moveCooldown) return;

    let dx = 0, dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) dx = 1;
    else if (this.cursors.up.isDown || this.wasd.W.isDown) dy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) dy = 1;

    if (dx !== 0 || dy !== 0) {
      this.tryMove(dx, dy);
      this.lastMoveTime = time;
    }
  }

  tryMove(dx, dy) {
    const nx = this.playerX + dx;
    const ny = this.playerY + dy;
    if (nx < 0 || nx >= this.mapW || ny < 0 || ny >= this.mapH) return;

    const tile = this.tileData[ny][nx];
    if (!TILE_WALKABLE[tile]) return;

    this.playerX = nx;
    this.playerY = ny;

    // Update facing direction
    let dir = this.playerDir;
    if (dx < 0) dir = 'left';
    else if (dx > 0) dir = 'right';
    else if (dy < 0) dir = 'up';
    else if (dy > 0) dir = 'down';
    if (dir !== this.playerDir) {
      this.playerDir = dir;
      this.player.setTexture(`player_${dir}`);
    }

    // Cache position for scene transitions
    cachedPlayerX = this.playerX;
    cachedPlayerY = this.playerY;
    cachedPlayerDir = this.playerDir;

    this.tweens.add({
      targets: this.player,
      x: nx * RENDERED_TILE + RENDERED_TILE / 2,
      y: ny * RENDERED_TILE + RENDERED_TILE / 2,
      duration: 100,
      ease: 'Linear',
    });

    this.stepCount++;

    // Door tile -- show prompt to enter
    if (tile === 5) {
      const spawn = this.spawns.find(s => Math.abs(s.x - nx) <= 1 && Math.abs(s.y - ny) <= 2);
      if (spawn) {
        this.currentDoorSpawn = spawn;
        this.showInteractPrompt(spawn);
      }
    } else if (this.currentDoorSpawn) {
      this.currentDoorSpawn = null;
      this.hideInteractPrompt();
    }

    // Random encounter on grass/dark grass
    if ((tile === 0 || tile === 9) && this.stepCount > 6) {
      const chance = Math.min(10 + this.stepCount * 3, 50);
      if (Phaser.Math.Between(1, 100) <= chance) {
        this.stepCount = 0;
        this.triggerRandomEncounter();
      }
    }

    this.updateHUD();
  }

  showInteractPrompt(spawn) {
    this.hideInteractPrompt();
    const tags = spawn.tags || [];
    let action = 'Enter';
    if (tags.includes('shop') || tags.includes('commerce')) action = 'Shop';
    else if (tags.includes('rest')) action = 'Rest';
    else if (tags.includes('temple') || tags.includes('revive')) action = 'Pray';

    this.interactPrompt = this.add.text(
      this.player.x,
      this.player.y - 30,
      `[ ENTER / SPACE ] ${action} at ${spawn.name}`,
      {
        fontSize: '10px', color: '#ffff44', fontFamily: 'monospace',
        backgroundColor: '#000000cc',
        padding: { x: 6, y: 3 },
      }
    ).setOrigin(0.5).setDepth(15);
  }

  hideInteractPrompt() {
    if (this.interactPrompt) {
      this.interactPrompt.destroy();
      this.interactPrompt = null;
    }
  }

  interactWithDoor() {
    if (this.animating || this.menuOpen || this.gameOver) return;
    const spawn = this.currentDoorSpawn;
    if (!spawn) return;

    this.hideInteractPrompt();
    this.currentDoorSpawn = null;

    const tags = spawn.tags || [];
    const isShop = tags.includes('shop') || tags.includes('commerce');
    const isInn = tags.includes('rest');
    const isTemple = tags.includes('temple') || tags.includes('revive');

    if (isShop) {
      this.openShop(spawn);
    } else if (isTemple) {
      const dead = this.gameState.party.filter(p => p.hp <= 0);
      if (dead.length > 0) {
        dead.forEach(p => { p.hp = 1; p.status = ''; });
        this.showMessage(`Temple of Light\n${dead.map(p => p.name).join(', ')} revived!`);
      } else {
        this.gameState.party.forEach(p => { p.hp = p.max_hp; });
        this.showMessage(`Temple of Light\nBlessings upon you. HP fully restored!`);
      }
      this.updateHUD();
      this.time.delayedCall(2000, () => this.hideMessage());
    } else if (isInn) {
      this.gameState.party.forEach(p => { if (p.hp > 0) p.hp = p.max_hp; });
      this.showMessage(`Rested at ${spawn.name}.\nHP and spells restored!`);
      this.updateHUD();
      this.time.delayedCall(2000, () => this.hideMessage());
    } else {
      this.showMessage(`Entered: ${spawn.name}`);
      this.time.delayedCall(1500, () => this.hideMessage());
    }

    // Quest advance when entering any building
    const gs = this.gameState;
    if (gs.current_quest < gs.quests.length) {
      this.triggerQuestAdvance(spawn.name);
    }
  }

  async openShop(spawn) {
    this.animating = true;
    const gs = this.gameState;

    let shopData;
    try {
      shopData = await getShop(gs.id, spawn.node_id);
    } catch (e) {
      console.error('[World] shop fetch failed:', e);
      this.animating = false;
      return;
    }

    const items = shopData.shop_items || [];
    if (items.length === 0) {
      this.showMessage(`${spawn.name} has nothing for sale.`);
      this.time.delayedCall(1500, () => { this.hideMessage(); this.animating = false; });
      return;
    }

    // Group items by type
    const weapons = items.filter(i => i.type === 'weapon');
    const armor = items.filter(i => i.type === 'armor');
    const consumables = items.filter(i => i.type === 'consumable');
    const spells = items.filter(i => i.type === 'spell');

    const overlay = [];
    const bg = this.add.rectangle(400, 300, 650, 500, 0x0a0a22, 0.95)
      .setStrokeStyle(2, 0x444488).setScrollFactor(0).setDepth(50).setInteractive();
    overlay.push(bg);

    const title = this.add.text(400, 70, `${spawn.name}`, {
      fontSize: '18px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    overlay.push(title);

    const goldText = this.add.text(400, 95, `Gold: ${gs.gold}`, {
      fontSize: '13px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    overlay.push(goldText);

    // Tabs
    let currentTab = 'weapons';
    const tabs = [
      { label: 'Weapons', key: 'weapons', items: weapons },
      { label: 'Armor', key: 'armor', items: armor },
      { label: 'Items', key: 'consumables', items: consumables },
      { label: 'Spells', key: 'spells', items: spells },
    ];

    let listGroup = [];

    const renderList = (tabItems, tabType) => {
      listGroup.forEach(o => o.destroy());
      listGroup = [];

      let y = 145;
      const displayItems = tabItems.slice(0, 10); // max 10 items visible

      for (const item of displayItems) {
        const affordable = gs.gold >= item.price;
        const color = affordable ? '#ffffff' : '#666666';

        let desc = `${item.name}`;
        if (item.power) desc += ` (Pow:${item.power})`;
        if (item.absorb) desc += ` (Abs:${item.absorb})`;
        if (item.classes) desc += ` [${item.classes}]`;
        desc += `  ${item.price}g`;

        const text = this.add.text(150, y, desc, {
          fontSize: '11px', color, fontFamily: 'monospace',
        }).setScrollFactor(0).setDepth(52);
        listGroup.push(text);

        if (affordable) {
          const buyBtn = this.add.text(620, y, '[BUY]', {
            fontSize: '11px', color: '#44ff44', fontFamily: 'monospace',
          }).setScrollFactor(0).setDepth(52).setInteractive({ useHandCursor: true });
          buyBtn.on('pointerover', () => buyBtn.setColor('#88ff88'));
          buyBtn.on('pointerout', () => buyBtn.setColor('#44ff44'));
          buyBtn.on('pointerdown', async () => {
            const result = await buyItem(gs.id, item.id, tabType === 'spells' ? 'consumable' : tabType === 'weapons' ? 'weapon' : tabType === 'armor' ? 'armor' : 'consumable');
            if (!result.error) {
              this.gameState = result;
              gs.gold = result.gold;
              goldText.setText(`Gold: ${result.gold}`);
              this.showMessage(`Bought: ${item.name}!`);
              this.updateHUD();
              this.time.delayedCall(1000, () => this.hideMessage());
              renderList(tabItems, tabType);
            }
          });
          listGroup.push(buyBtn);
        }

        y += 22;
      }

      if (displayItems.length === 0) {
        const empty = this.add.text(400, 200, 'Nothing in this category.', {
          fontSize: '12px', color: '#666666', fontFamily: 'monospace',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
        listGroup.push(empty);
      }
    };

    // Tab buttons
    let tabX = 180;
    for (const tab of tabs) {
      const isActive = tab.key === currentTab;
      const tabBtn = this.add.text(tabX, 118, tab.label, {
        fontSize: '12px', color: isActive ? '#ffffff' : '#666666', fontFamily: 'monospace',
        backgroundColor: isActive ? '#333366' : '#111133',
        padding: { x: 6, y: 2 },
      }).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
      tabBtn.on('pointerdown', () => {
        currentTab = tab.key;
        const type = tab.key === 'weapons' ? 'weapon' : tab.key === 'armor' ? 'armor' : 'consumable';
        renderList(tab.items, type);
        // Refresh tab colors (hacky but works for prototype)
      });
      overlay.push(tabBtn);
      tabX += 120;
    }

    // Close button
    const closeBtn = this.add.text(400, 530, '[ LEAVE SHOP (ESC) ]', {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      overlay.forEach(o => o.destroy());
      listGroup.forEach(o => o.destroy());
      this.animating = false;
    });
    overlay.push(closeBtn);

    // ESC to close
    const escHandler = this.input.keyboard.on('keydown-ESC', () => {
      overlay.forEach(o => o.destroy());
      listGroup.forEach(o => o.destroy());
      this.animating = false;
      this.input.keyboard.off('keydown-ESC', escHandler);
    });

    // Show first tab
    renderList(weapons, 'weapon');
  }

  async triggerRandomEncounter() {
    this.animating = true;
    // Save position before transitioning to battle
    cachedPlayerX = this.playerX;
    cachedPlayerY = this.playerY;
    cachedPlayerDir = this.playerDir;
    console.log('[World] random encounter triggered at', this.playerX, this.playerY);

    this.cameras.main.flash(300, 255, 255, 255);

    this.time.delayedCall(400, async () => {
      try {
        const result = await gameAction(this.gameState.id, { type: 'encounter' });
        this.gameState = result;

        if (result.phase === 'combat' && result.enemies?.length > 0) {
          this.scene.start('Battle', { gameState: result });
        } else {
          this.animating = false;
        }
      } catch (e) {
        console.error('[World] encounter failed:', e);
        this.animating = false;
      }
    });
  }

  async triggerQuestAdvance(locationName) {
    console.log('[World] quest advance at:', locationName);
    try {
      const result = await gameAction(this.gameState.id, { type: 'quest_advance' });
      this.gameState = result;
      this.updateHUD();
      this.updateQuestDisplay();

      if (result.message) {
        this.showMessage(result.message);
        this.time.delayedCall(3000, () => this.hideMessage());
      }
      if (result.phase === 'victory') {
        this.time.delayedCall(3000, () => {
          this.showEndScreen('VICTORY!', `${result.location} is saved!`, '#ffff44', result);
        });
      }
    } catch (e) {
      console.error('[World] quest advance failed:', e);
    }
  }

  drawMap() {
    this.tileGraphics.clear();
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const tile = this.tileData[y][x];
        const color = TILE_COLORS[tile] || 0x000000;
        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(x * RENDERED_TILE, y * RENDERED_TILE, RENDERED_TILE, RENDERED_TILE);
      }
    }
  }

  drawLabels() {
    for (const spawn of this.spawns) {
      this.add.text(
        spawn.x * RENDERED_TILE + RENDERED_TILE / 2,
        spawn.y * RENDERED_TILE - 10,
        spawn.name,
        {
          fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
          backgroundColor: '#00000099',
          padding: { x: 3, y: 1 },
        }
      ).setOrigin(0.5, 1).setDepth(5);
    }
  }

  updateHUD() {
    if (!this.hudText) return;
    const gs = this.gameState;
    const parts = gs.party.map(p => `${p.name} Lv${p.level} ${p.hp}/${p.max_hp}`);
    this.hudText.setText(`${parts.join(' | ')} | Gold:${gs.gold} Potions:${gs.potions}`);
  }

  updateQuestDisplay() {
    const gs = this.gameState;
    if (gs.current_quest < gs.quests.length) {
      this.questText.setText(`Quest: ${gs.quests[gs.current_quest].name}`);
    } else {
      this.questText.setText('All quests complete!');
    }
  }

  showMessage(text) {
    this.messageText.setText(text).setVisible(true);
  }

  hideMessage() {
    if (this.messageText) this.messageText.setVisible(false);
  }

  showEndScreen(title, subtitle, color, gs) {
    this.add.rectangle(400, 300, 800, 600, 0x111111);
    this.add.text(400, 120, title, {
      fontSize: '48px', color, fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add.text(400, 190, subtitle, {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    let y = 260;
    this.add.text(400, y, 'Final Party:', {
      fontSize: '16px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5);
    y += 30;
    for (const pm of gs.party) {
      this.add.text(400, y,
        `${pm.name} (${pm.class_name}) Lv.${pm.level}  HP:${pm.max_hp}  STR:${pm.str} AGI:${pm.agi} INT:${pm.int_stat}`,
        { fontSize: '13px', color: '#ffffff', fontFamily: 'monospace' }
      ).setOrigin(0.5);
      y += 22;
    }
    this.add.text(400, y + 20, `Gold: ${gs.gold}`, {
      fontSize: '14px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }
}
