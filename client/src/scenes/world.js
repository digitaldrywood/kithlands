import { gameAction } from '../api.js';
import { initAudio, playMusic, playSFX, toggleMute, isMuted } from '../systems/audio.js';
import { toggleMenu } from './world_menu.js';
import { toggleCodex } from './world_codex.js';
import { interactWithDoor, showWorldMap, showInteractPrompt, hideInteractPrompt } from './world_interact.js';

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
  10: 0x1B5E20, // forest (darker)
  11: 0x8D6E63, // hill
  12: 0xFFE082, // sand
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
  10: false, // forest
  11: false, // hill
  12: true,  // sand
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

    initAudio(this);
    playMusic('music_overworld');

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
    this.input.keyboard.on('keydown-M', () => toggleMenu(this));
    this.input.keyboard.on('keydown-H', () => toggleCodex(this));
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.codexOpen) toggleCodex(this);
      else if (this.menuOpen) toggleMenu(this);
    });
    this.codexOpen = false;
    this.codexGroup = null;

    // Enter/Space to interact with doors
    this.currentDoorSpawn = null;
    this.interactPrompt = null;
    this.input.keyboard.on('keydown-ENTER', () => interactWithDoor(this));
    this.input.keyboard.on('keydown-SPACE', () => interactWithDoor(this));

    // TAB for world map
    this.input.keyboard.on('keydown-TAB', (e) => { e.preventDefault(); showWorldMap(this); });

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

    // Minimap
    this.drawMinimap();

    // HUD buttons
    const muteBtn = this.add.text(620, 575, isMuted() ? '[unmute]' : '[mute]', {
      fontSize: '12px', color: '#666666', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(21).setInteractive({ useHandCursor: true });
    muteBtn.on('pointerdown', () => {
      const m = toggleMute();
      muteBtn.setText(m ? '[unmute]' : '[mute]');
    });

    const codexBtn = this.add.text(690, 575, '[H]elp', {
      fontSize: '12px', color: '#8888ff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(21).setInteractive({ useHandCursor: true });
    codexBtn.on('pointerdown', () => toggleCodex(this));

    const menuBtn = this.add.text(760, 575, '[M]enu', {
      fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(21).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerdown', () => toggleMenu(this));

    this.lastMoveTime = 0;
    this.moveCooldown = 150;

    console.log('[World] created, player at', this.playerX, this.playerY);
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
        showInteractPrompt(this, spawn);
      }
    } else if (this.currentDoorSpawn) {
      this.currentDoorSpawn = null;
      hideInteractPrompt(this);
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
    this.updateMinimap();
  }

  async triggerRandomEncounter() {
    this.animating = true;
    // Save position before transitioning to battle
    cachedPlayerX = this.playerX;
    cachedPlayerY = this.playerY;
    cachedPlayerDir = this.playerDir;
    playSFX('sfx_encounter');
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

  drawMinimap() {
    const mmW = 120, mmH = 90;
    const mmX = 670, mmY = 10;
    const scaleX = mmW / this.mapW;
    const scaleY = mmH / this.mapH;

    // Background
    this.add.rectangle(mmX + mmW / 2, mmY + mmH / 2, mmW + 4, mmH + 4, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(18);

    // Draw tiles at mini scale
    const mmGfx = this.add.graphics().setScrollFactor(0).setDepth(19);
    for (let y = 0; y < this.mapH; y += 2) {
      for (let x = 0; x < this.mapW; x += 2) {
        const tile = this.tileData[y][x];
        const color = TILE_COLORS[tile] || 0x000000;
        mmGfx.fillStyle(color, 0.8);
        mmGfx.fillRect(mmX + x * scaleX, mmY + y * scaleY, Math.max(1, scaleX * 2), Math.max(1, scaleY * 2));
      }
    }

    // Location markers
    for (const spawn of this.spawns) {
      if (spawn.kind === 'natural') continue;
      mmGfx.fillStyle(0xffffff, 1);
      mmGfx.fillRect(mmX + spawn.x * scaleX - 1, mmY + spawn.y * scaleY - 1, 3, 3);
    }

    // Player dot (updated each frame)
    this.minimapDot = this.add.circle(
      mmX + this.playerX * scaleX,
      mmY + this.playerY * scaleY,
      2, 0xff4444
    ).setScrollFactor(0).setDepth(20);

    this.mmX = mmX;
    this.mmY = mmY;
    this.mmScaleX = scaleX;
    this.mmScaleY = scaleY;
  }

  updateMinimap() {
    if (this.minimapDot && this.mmX != null) {
      this.minimapDot.setPosition(
        this.mmX + this.playerX * this.mmScaleX,
        this.mmY + this.playerY * this.mmScaleY
      );
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

    // Exit buttons
    const titleBtn = this.add.text(300, y + 70, '[ TITLE SCREEN ]', {
      fontSize: '18px', color: '#4488ff', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    titleBtn.on('pointerover', () => titleBtn.setColor('#88bbff'));
    titleBtn.on('pointerout', () => titleBtn.setColor('#4488ff'));
    titleBtn.on('pointerdown', () => this.scene.start('Title'));

    const newBtn = this.add.text(500, y + 70, '[ NEW GAME ]', {
      fontSize: '18px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    newBtn.on('pointerover', () => newBtn.setColor('#88ff88'));
    newBtn.on('pointerout', () => newBtn.setColor('#44ff44'));
    newBtn.on('pointerdown', () => this.scene.start('Title'));
  }
}
