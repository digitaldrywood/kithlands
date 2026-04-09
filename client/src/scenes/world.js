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
const SCALE = 2; // render at 2x for visibility
const RENDERED_TILE = TILE_SIZE * SCALE;

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
    this.playerX = 0;
    this.playerY = 0;
    this.stepCount = 0;
    this.moving = false;
  }

  init(data) {
    this.gameState = data.gameState;
  }

  create() {
    const tm = this.gameState.tilemap;
    if (!tm) {
      // Fallback to old text UI if no tilemap
      this.scene.start('World_Legacy', { gameState: this.gameState });
      return;
    }

    this.tileData = tm.tiles;
    this.mapW = tm.width;
    this.mapH = tm.height;
    this.playerX = tm.player_x;
    this.playerY = tm.player_y;
    this.spawns = tm.spawns || [];

    // Set world bounds
    const worldW = this.mapW * RENDERED_TILE;
    const worldH = this.mapH * RENDERED_TILE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Draw tilemap
    this.tileGraphics = this.add.graphics();
    this.drawMap();

    // Draw location labels
    this.labelGroup = this.add.group();
    this.drawLabels();

    // Player sprite (colored rectangle for now)
    this.player = this.add.rectangle(
      this.playerX * RENDERED_TILE + RENDERED_TILE / 2,
      this.playerY * RENDERED_TILE + RENDERED_TILE / 2,
      RENDERED_TILE - 4,
      RENDERED_TILE - 4,
      0xFF5722
    );
    this.player.setDepth(10);

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // Touch/click movement
    this.input.on('pointerdown', (pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(worldPoint.x / RENDERED_TILE);
      const ty = Math.floor(worldPoint.y / RENDERED_TILE);
      const dx = tx - this.playerX;
      const dy = ty - this.playerY;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.tryMove(dx > 0 ? 1 : -1, 0);
      } else {
        this.tryMove(0, dy > 0 ? 1 : -1);
      }
    });

    // HUD
    this.hudBg = this.add.rectangle(400, 585, 800, 30, 0x000000, 0.7).setScrollFactor(0).setDepth(20);
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
      backgroundColor: '#000000cc',
      padding: { x: 12, y: 8 },
      wordWrap: { width: 500 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30).setVisible(false);

    // Move cooldown
    this.lastMoveTime = 0;
    this.moveCooldown = 150; // ms between moves
  }

  update(time) {
    if (this.gameState.phase === 'combat') {
      this.scene.start('Battle', { gameState: this.gameState });
      return;
    }
    if (this.gameState.phase === 'victory') {
      this.showMessage(`VICTORY!\n${this.gameState.location} is saved!`);
      return;
    }
    if (this.gameState.phase === 'defeat') {
      this.showMessage('DEFEAT\nYour party has fallen.');
      return;
    }

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

    // Animate movement
    this.tweens.add({
      targets: this.player,
      x: nx * RENDERED_TILE + RENDERED_TILE / 2,
      y: ny * RENDERED_TILE + RENDERED_TILE / 2,
      duration: 120,
      ease: 'Linear',
    });

    this.stepCount++;

    // Check if on a door/building
    if (tile === 5) { // door
      const spawn = this.spawns.find(s => {
        return Math.abs(s.x - nx) <= 1 && Math.abs(s.y - ny) <= 2;
      });
      if (spawn) {
        this.showMessage(`Entered: ${spawn.name}`);
        this.time.delayedCall(1500, () => this.hideMessage());
      }
    }

    // Random encounter on grass/dark grass (every 8-15 steps)
    if ((tile === 0 || tile === 9) && this.stepCount > 8) {
      const encounterChance = Math.min(15 + this.stepCount * 2, 60);
      if (Phaser.Math.Between(1, 100) <= encounterChance) {
        this.stepCount = 0;
        this.triggerEncounter();
      }
    }

    this.updateHUD();
  }

  async triggerEncounter() {
    // Flash screen
    this.cameras.main.flash(300, 255, 255, 255);

    this.time.delayedCall(400, async () => {
      try {
        const result = await gameAction(this.gameState.id, { type: 'advance' });
        if (result.error) {
          console.error(result.error);
          return;
        }
        this.gameState = result;
        if (this.gameState.phase === 'combat') {
          this.scene.start('Battle', { gameState: this.gameState });
        } else {
          this.updateHUD();
          this.updateQuestDisplay();
          // Show quest completion message
          if (this.gameState.message) {
            this.showMessage(this.gameState.message);
            this.time.delayedCall(3000, () => this.hideMessage());
          }
          // Check level ups in combat log
          if (this.gameState.combat_log) {
            for (const line of this.gameState.combat_log) {
              if (line.includes('leveled up')) {
                this.showMessage(line);
                this.time.delayedCall(3000, () => this.hideMessage());
              }
            }
          }
        }
      } catch (e) {
        console.error('Encounter failed:', e);
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

        // Add subtle grid lines
        this.tileGraphics.lineStyle(1, 0x00000022);
        this.tileGraphics.strokeRect(x * RENDERED_TILE, y * RENDERED_TILE, RENDERED_TILE, RENDERED_TILE);
      }
    }
  }

  drawLabels() {
    for (const spawn of this.spawns) {
      const label = this.add.text(
        spawn.x * RENDERED_TILE + RENDERED_TILE / 2,
        spawn.y * RENDERED_TILE - 8,
        spawn.name,
        {
          fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
          backgroundColor: '#00000088',
          padding: { x: 2, y: 1 },
        }
      ).setOrigin(0.5, 1).setDepth(5);
      this.labelGroup.add(label);
    }
  }

  updateHUD() {
    const gs = this.gameState;
    const parts = gs.party.map(p => {
      const hpPct = Math.round(p.hp / p.max_hp * 100);
      return `${p.name} Lv${p.level} ${p.hp}/${p.max_hp}HP`;
    });
    this.hudText.setText(`${parts.join('  |  ')}  |  Gold:${gs.gold}  Potions:${gs.potions}`);
  }

  updateQuestDisplay() {
    const gs = this.gameState;
    if (gs.current_quest < gs.quests.length) {
      const q = gs.quests[gs.current_quest];
      this.questText.setText(`Quest: ${q.name}`);
    } else {
      this.questText.setText('All quests complete!');
    }
  }

  showMessage(text) {
    this.messageText.setText(text).setVisible(true);
  }

  hideMessage() {
    this.messageText.setVisible(false);
  }
}
