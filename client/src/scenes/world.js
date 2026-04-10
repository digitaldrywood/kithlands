import { gameAction } from '../api.js';

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

// Cache tilemap across scene restarts (it never changes during a game)
let cachedTileMap = null;

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

    const gs = this.gameState;

    // Handle non-world phases
    if (gs.phase === 'victory') {
      this.showEndScreen('VICTORY!', `${gs.location} is saved!`, '#ffff44', gs);
      return;
    }
    if (gs.phase === 'defeat') {
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
    this.playerX = tm.player_x;
    this.playerY = tm.player_y;
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

    // Player sprite (directional)
    this.playerDir = 'down';
    this.player = this.add.image(
      this.playerX * RENDERED_TILE + RENDERED_TILE / 2,
      this.playerY * RENDERED_TILE + RENDERED_TILE / 2,
      'player_down'
    ).setDepth(10).setScale(SCALE);

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.menuOpen = false;
    this.menuGroup = null;

    // M key opens menu
    this.input.keyboard.on('keydown-M', () => this.toggleMenu());
    this.input.keyboard.on('keydown-ESC', () => { if (this.menuOpen) this.toggleMenu(); });

    // Touch movement
    this.input.on('pointerdown', (pointer) => {
      if (this.animating) return;
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

    // Menu button in HUD
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

    // Background panel
    const bg = this.add.rectangle(400, 300, 500, 400, 0x000000, 0.9).setScrollFactor(0).setDepth(40);
    this.menuGroup.push(bg);

    const title = this.add.text(400, 120, 'PARTY MENU', {
      fontSize: '20px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.menuGroup.push(title);

    let y = 160;
    for (const p of gs.party) {
      const hpColor = p.hp < p.max_hp * 0.3 ? '#ff4444' : '#44ff44';
      const line = this.add.text(200, y,
        `${p.name} (${p.class_name}) Lv.${p.level}\n  HP: ${p.hp}/${p.max_hp}  STR:${p.str} AGI:${p.agi} INT:${p.int_stat}\n  XP: ${p.xp}/${p.xp_next}`,
        { fontSize: '12px', color: '#ffffff', fontFamily: 'monospace' }
      ).setScrollFactor(0).setDepth(41);
      this.menuGroup.push(line);

      if (p.spells && p.spells.length > 0) {
        const spells = this.add.text(200, y + 48,
          `  Spells: ${p.spells.map(s => `${s.name}(${s.charges})`).join(', ')}`,
          { fontSize: '11px', color: '#8888ff', fontFamily: 'monospace' }
        ).setScrollFactor(0).setDepth(41);
        this.menuGroup.push(spells);
        y += 70;
      } else {
        y += 55;
      }
    }

    // Gold and items
    const inv = this.add.text(200, y + 10,
      `Gold: ${gs.gold}  |  Potions: ${gs.potions}`,
      { fontSize: '13px', color: '#ffcc44', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(41);
    this.menuGroup.push(inv);

    // Use potion button
    if (gs.potions > 0) {
      const useBtn = this.add.text(400, y + 45, '[ USE POTION ]', {
        fontSize: '14px', color: '#44ff44', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
      useBtn.on('pointerover', () => useBtn.setColor('#88ff88'));
      useBtn.on('pointerout', () => useBtn.setColor('#44ff44'));
      useBtn.on('pointerdown', () => this.useOverworldPotion());
      this.menuGroup.push(useBtn);
    }

    // Close
    const closeBtn = this.add.text(400, 470, '[ CLOSE (M/ESC) ]', {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleMenu());
    this.menuGroup.push(closeBtn);
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
    if (this.animating) return;
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

    this.tweens.add({
      targets: this.player,
      x: nx * RENDERED_TILE + RENDERED_TILE / 2,
      y: ny * RENDERED_TILE + RENDERED_TILE / 2,
      duration: 100,
      ease: 'Linear',
    });

    this.stepCount++;

    // Door interaction
    if (tile === 5) {
      const spawn = this.spawns.find(s => Math.abs(s.x - nx) <= 1 && Math.abs(s.y - ny) <= 2);
      if (spawn) {
        this.showMessage(`Entered: ${spawn.name}`);
        this.time.delayedCall(1500, () => this.hideMessage());
      }
    }

    // Random encounter on grass/dark grass
    if ((tile === 0 || tile === 9) && this.stepCount > 6) {
      const chance = Math.min(10 + this.stepCount * 3, 50);
      if (Phaser.Math.Between(1, 100) <= chance) {
        this.stepCount = 0;
        this.triggerEncounter();
      }
    }

    this.updateHUD();
  }

  async triggerEncounter() {
    this.animating = true;
    console.log('[World] encounter triggered');

    this.cameras.main.flash(300, 255, 255, 255);

    this.time.delayedCall(400, async () => {
      try {
        const result = await gameAction(this.gameState.id, { type: 'advance' });
        this.gameState = result;
        console.log('[World] encounter result phase:', result.phase, 'enemies:', result.enemies?.length);

        if (result.phase === 'combat' && result.enemies?.length > 0) {
          this.scene.start('Battle', { gameState: result });
        } else {
          // No combat (quest advanced instead) -- show result and continue
          this.animating = false;
          this.updateHUD();
          this.updateQuestDisplay();
          if (result.message) {
            this.showMessage(result.message);
            this.time.delayedCall(3000, () => this.hideMessage());
          }
          if (result.phase === 'victory') {
            this.showEndScreen('VICTORY!', `${result.location} is saved!`, '#ffff44', result);
          }
        }
      } catch (e) {
        console.error('[World] encounter failed:', e);
        this.animating = false;
      }
    });
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
