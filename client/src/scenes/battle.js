import { gameAction } from '../api.js';

const ENEMY_SPRITES = {
  'Slime': 'monster_slime',
  'Goblin': 'monster_goblin',
  'Wolf': 'monster_wolf',
  'Skeleton': 'monster_skeleton',
  'Dark Knight': 'monster_dark_knight',
};

const ENEMY_COLORS = {
  'Slime': 0x42A5F5, 'Goblin': 0x66BB6A, 'Wolf': 0x8D6E63,
  'Skeleton': 0xEEEEEE, 'Dark Knight': 0x512DA8,
};

const CLASS_SPRITES = {
  'warrior': 'warrior', 'cinder': 'cinder', 'mender': 'mender', 'rogue': 'rogue',
};

const SPELL_COLORS = {
  'fire': 0xff4400, 'ice': 0x44aaff, 'lightning': 0xffff00, 'none': 0xffffff,
};

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.gameState = data.gameState;
    console.log('[Battle] init, phase:', this.gameState?.phase);
  }

  create() {
    this.animating = false;
    this.turnIndex = 0; // which party member is selecting
    this.pendingAction = null; // waiting for target selection
    this.enemySpriteMap = {}; // id -> sprite for animations

    const gs = this.gameState;

    if (!gs || gs.phase !== 'combat' || !gs.enemies?.length) {
      if (gs?.combat_log?.length > 0) {
        this.showVictoryResults(gs);
      } else {
        this.scene.start('World', { gameState: gs });
      }
      return;
    }

    // Background
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);
    this.add.rectangle(400, 400, 800, 200, 0x111133);

    // Enemies
    const enemies = gs.enemies;
    const spacing = Math.min(130, 450 / Math.max(enemies.length, 1));
    const startX = 80 + (450 - enemies.length * spacing) / 2;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = startX + i * spacing;
      const y = 250;
      const baseSize = e.name === 'Dark Knight' ? 80 : 50;

      // Sprite or rectangle
      const spriteKey = ENEMY_SPRITES[e.name];
      let sprite;
      if (spriteKey && this.textures.exists(spriteKey)) {
        sprite = this.add.image(x, y, spriteKey);
        const s = baseSize / Math.max(sprite.width, sprite.height) * 2;
        sprite.setScale(s);
      } else {
        sprite = this.add.rectangle(x, y, baseSize, baseSize, ENEMY_COLORS[e.name] || 0xFF5722);
      }
      sprite.setData('enemyId', e.id);
      this.enemySpriteMap[e.id] = sprite;

      // Make enemy clickable for targeting
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => this.selectTarget(e.id));
      sprite.on('pointerover', () => sprite.setAlpha(0.8));
      sprite.on('pointerout', () => sprite.setAlpha(1));

      // Name
      this.add.text(x, y - baseSize / 2 - 20, e.name, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);

      // HP bar
      const barW = 70;
      this.add.rectangle(x, y + baseSize / 2 + 12, barW, 8, 0x333333);
      const pct = Math.max(0, e.hp / e.max_hp);
      if (pct > 0) {
        const bc = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x - barW / 2 * (1 - pct), y + baseSize / 2 + 12, barW * pct, 8, bc);
      }
      this.add.text(x, y + baseSize / 2 + 26, `${e.hp}/${e.max_hp}`, {
        fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // "Click enemy to target" hint (shown when selecting)
    this.targetHint = this.add.text(300, 340, '', {
      fontSize: '11px', color: '#ffff44', fontFamily: 'monospace',
    }).setDepth(5);

    // Party
    this.partyIndicators = [];
    const partyX = 560;
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const x = partyX;
      const y = 170 + i * 80;
      const alive = p.hp > 0;

      // Turn indicator arrow
      const arrow = this.add.triangle(x - 15, y, 0, -8, 0, 8, 10, 0, 0xffff44)
        .setDepth(2)
        .setVisible(alive && i === this.turnIndex);
      this.partyIndicators.push(arrow);

      // Active highlight
      if (alive && i === this.turnIndex) {
        this.add.rectangle(x - 5, y, 220, 70, 0x223366, 0.5).setOrigin(0, 0.5);
      }

      // Sprite
      const cs = CLASS_SPRITES[p.class_id];
      if (cs && this.textures.exists(cs)) {
        const s = this.add.image(x + 15, y, cs);
        s.setScale(50 / Math.max(s.width, s.height) * 2);
        if (!alive) s.setTint(0x444444);
      } else {
        this.add.rectangle(x + 15, y, 35, 35, alive ? 0xFF5722 : 0x444444);
      }

      // Name/stats
      this.add.text(x + 45, y - 20, p.name, {
        fontSize: '12px', color: alive ? '#ffffff' : '#666666', fontFamily: 'monospace',
      });
      this.add.text(x + 45, y - 4, `${p.class_name} Lv${p.level}`, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      });

      // HP bar
      const barW = 90, hpPct = Math.max(0, p.hp / p.max_hp);
      this.add.rectangle(x + 90 + barW / 2, y + 12, barW, 6, 0x333333);
      if (hpPct > 0) {
        const bc = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x + 90 + barW * hpPct / 2, y + 12, barW * hpPct, 6, bc);
      }
      this.add.text(x + 90 + barW + 5, y + 7, `${p.hp}/${p.max_hp}`, {
        fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
      });

      if (p.spells?.length > 0 && alive) {
        const ss = p.spells.map(s => `${s.name}(${s.charges})`).join(' ');
        this.add.text(x + 45, y + 20, ss, {
          fontSize: '8px', color: '#8888ff', fontFamily: 'monospace',
        });
      }
    }

    // Combat log
    this.add.rectangle(400, 490, 780, 60, 0x000000, 0.85);
    const log = gs.combat_log || [];
    for (let i = 0; i < Math.min(log.length, 3); i++) {
      this.add.text(20, 500 - i * 16, log[log.length - 1 - i], {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 760 },
      });
    }

    // Action buttons
    this.renderActionButtons(gs);

    // Find first living member for turn indicator
    this.advanceTurn(gs);
  }

  advanceTurn(gs) {
    // Move indicator to current turn member
    for (let i = 0; i < this.partyIndicators.length; i++) {
      this.partyIndicators[i].setVisible(i === this.turnIndex);
    }
    const member = gs.party[this.turnIndex];
    if (member) {
      this.targetHint.setText(`${member.name}'s turn -- choose an action`);
    }
  }

  renderActionButtons(gs) {
    const member = gs.party[this.turnIndex];
    const hasSpells = member?.spells?.length > 0 && member.spells.some(s => s.charges > 0);

    const buttons = [{ label: 'ATTACK', type: 'attack', color: '#ff4444' }];
    if (hasSpells) buttons.push({ label: 'SPELL', type: 'spell', color: '#8888ff' });
    if (gs.potions > 0) buttons.push({ label: `POTION(${gs.potions})`, type: 'item', color: '#44ff44' });
    buttons.push({ label: 'FLEE', type: 'flee', color: '#ffcc44' });

    const totalW = buttons.length * 150;
    const sx = 400 - totalW / 2 + 75;

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const x = sx + i * 150;

      const bg = this.add.rectangle(x, 555, 130, 32, 0x1a1a44)
        .setStrokeStyle(1, 0x444488).setInteractive({ useHandCursor: true });

      this.add.text(x, 555, b.label, {
        fontSize: '13px', color: b.color, fontFamily: 'monospace',
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x2a2a66));
      bg.on('pointerout', () => bg.setFillStyle(0x1a1a44));
      bg.on('pointerdown', () => {
        if (this.animating) return;
        switch (b.type) {
          case 'attack':
            this.pendingAction = 'attack';
            this.targetHint.setText('Click an enemy to attack!').setColor('#ff4444');
            break;
          case 'spell':
            this.showSpellPicker(gs);
            break;
          case 'item':
            this.doAction({ type: 'item' });
            break;
          case 'flee':
            this.doAction({ type: 'flee' });
            break;
        }
      });
    }
  }

  selectTarget(enemyId) {
    if (this.animating) return;

    if (this.pendingAction === 'attack') {
      this.pendingAction = null;
      this.doAction({ type: 'attack', target_id: enemyId });
    } else if (this.pendingAction === 'spell') {
      this.pendingAction = null;
      this.doAction({ type: 'spell', spell_id: this.pendingSpellId, target_id: enemyId });
    }
  }

  showSpellPicker(gs) {
    const member = gs.party[this.turnIndex];
    if (!member?.spells) return;

    const spells = member.spells.filter(s => s.charges > 0);
    if (spells.length === 0) return;

    const overlay = [];
    const bg = this.add.rectangle(400, 380, 300, 40 + spells.length * 35, 0x111144, 0.95)
      .setStrokeStyle(2, 0x4444aa).setDepth(50);
    overlay.push(bg);

    const title = this.add.text(400, 365 - spells.length * 17, `${member.name}'s spells:`, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51);
    overlay.push(title);

    for (let i = 0; i < spells.length; i++) {
      const sp = spells[i];
      const y = 390 - spells.length * 17 + i * 35;

      const row = this.add.rectangle(400, y, 260, 28, 0x222255)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      overlay.push(row);

      const text = this.add.text(400, y, `${sp.name} (${sp.charges} charges)`, {
        fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      overlay.push(text);

      row.on('pointerover', () => { row.setFillStyle(0x3333aa); text.setColor('#ffffff'); });
      row.on('pointerout', () => { row.setFillStyle(0x222255); text.setColor('#aaaaff'); });
      row.on('pointerdown', () => {
        overlay.forEach(o => o.destroy());
        this.pendingAction = 'spell';
        this.pendingSpellId = sp.id;
        this.targetHint.setText(`Cast ${sp.name} -- click an enemy!`).setColor('#8888ff');
      });
    }

    const cancel = this.add.text(400, 400 - spells.length * 17 + spells.length * 35, '[ CANCEL ]', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => overlay.forEach(o => o.destroy()));
    overlay.push(cancel);
  }

  async doAction(action) {
    this.animating = true;
    this.targetHint.setText('');
    console.log('[Battle] action:', action.type, 'target:', action.target_id);

    // Visual effect BEFORE sending to server
    if (action.type === 'attack' && action.target_id != null) {
      await this.playAttackEffect(action.target_id);
    } else if (action.type === 'spell') {
      await this.playSpellEffect(action.target_id);
    }

    try {
      const result = await gameAction(this.gameState.id, action);
      if (result.error) {
        console.error('[Battle] error:', result.error);
        this.animating = false;
        return;
      }

      this.gameState = result;

      // Show damage numbers from combat log
      await this.playResultEffects(result);

      this.time.delayedCall(300, () => {
        this.animating = false;
        if (this.gameState.phase !== 'combat') {
          this.showVictoryResults(this.gameState);
        } else {
          // Advance turn indicator for next round
          this.turnIndex = 0;
          for (let i = 0; i < this.gameState.party.length; i++) {
            if (this.gameState.party[i].hp > 0) {
              this.turnIndex = i;
              break;
            }
          }
          this.scene.restart({ gameState: this.gameState });
        }
      });
    } catch (e) {
      console.error('[Battle] failed:', e);
      this.animating = false;
    }
  }

  playAttackEffect(targetId) {
    return new Promise(resolve => {
      const sprite = this.enemySpriteMap[targetId];
      if (!sprite) { resolve(); return; }

      // White slash line across enemy
      const x = sprite.x, y = sprite.y;
      const slash = this.add.graphics().setDepth(20);
      slash.lineStyle(3, 0xffffff, 1);
      slash.lineBetween(x - 25, y - 20, x + 25, y + 20);

      // Screen shake
      this.cameras.main.shake(120, 0.008);

      // Enemy flash red
      if (sprite.setTint) sprite.setTint(0xff4444);

      this.time.delayedCall(150, () => {
        slash.destroy();
        if (sprite.clearTint) sprite.clearTint();
        resolve();
      });
    });
  }

  playSpellEffect(targetId) {
    return new Promise(resolve => {
      const sprite = this.enemySpriteMap[targetId];

      // Screen-wide spell flash
      const flash = this.add.rectangle(400, 300, 800, 600, 0x4444ff, 0.3).setDepth(19);

      // Colored particles at target
      if (sprite) {
        const x = sprite.x, y = sprite.y;
        for (let i = 0; i < 8; i++) {
          const px = x + Phaser.Math.Between(-30, 30);
          const py = y + Phaser.Math.Between(-30, 30);
          const particle = this.add.circle(px, py, 4, 0x8888ff).setDepth(20);
          this.tweens.add({
            targets: particle, y: py - 30, alpha: 0,
            duration: 400, ease: 'Power2',
            onComplete: () => particle.destroy(),
          });
        }
      }

      this.time.delayedCall(300, () => {
        flash.destroy();
        resolve();
      });
    });
  }

  playResultEffects(result) {
    return new Promise(resolve => {
      const log = result.combat_log || [];
      let delay = 0;

      for (const line of log) {
        // Parse damage numbers and show floating text
        const dmgMatch = line.match(/for (\d+) damage/);
        const healMatch = line.match(/healed (\d+)/);

        if (dmgMatch) {
          const dmg = dmgMatch[1];
          this.time.delayedCall(delay, () => {
            // Show damage number floating up
            const numText = this.add.text(
              Phaser.Math.Between(300, 500),
              Phaser.Math.Between(200, 350),
              `-${dmg}`,
              { fontSize: '18px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold' }
            ).setOrigin(0.5).setDepth(25);

            this.tweens.add({
              targets: numText, y: numText.y - 40, alpha: 0,
              duration: 800, ease: 'Power2',
              onComplete: () => numText.destroy(),
            });
          });
          delay += 200;
        }

        if (healMatch) {
          const heal = healMatch[1];
          this.time.delayedCall(delay, () => {
            const numText = this.add.text(600, 250, `+${heal}`, {
              fontSize: '18px', color: '#44ff44', fontFamily: 'monospace', fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(25);

            this.tweens.add({
              targets: numText, y: numText.y - 40, alpha: 0,
              duration: 800, ease: 'Power2',
              onComplete: () => numText.destroy(),
            });
          });
          delay += 200;
        }
      }

      this.time.delayedCall(Math.max(delay, 200), resolve);
    });
  }

  showVictoryResults(gs) {
    this.children.removeAll(true);
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);

    const isDefeat = gs.phase === 'defeat';
    const title = isDefeat ? 'DEFEAT' : 'VICTORY!';
    const titleColor = isDefeat ? '#ff4444' : '#ffff44';

    this.add.text(400, 40, title, {
      fontSize: '36px', color: titleColor, fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (isDefeat) {
      this.add.text(400, 100, gs.message || 'Your party has fallen.', {
        fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.addContinueButton(gs);
      return;
    }

    const log = gs.combat_log || [];
    let y = 80;

    // XP/gold/items
    for (const line of log) {
      if (line.includes('Victory') || line.includes('Found:') || line.includes('+')) {
        this.add.text(400, y, line, {
          fontSize: '12px', color: '#44ff44', fontFamily: 'monospace',
        }).setOrigin(0.5);
        y += 20;
      }
    }

    // Level ups
    const levelUps = log.filter(l => l.includes('leveled up'));
    if (levelUps.length > 0) {
      y += 10;
      this.add.text(400, y, '-- LEVEL UP --', {
        fontSize: '16px', color: '#ffff44', fontFamily: 'monospace',
      }).setOrigin(0.5);
      y += 25;
      for (const line of levelUps) {
        this.add.text(400, y, line, {
          fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace',
        }).setOrigin(0.5);
        y += 20;
      }
    }

    // Quest completions
    for (const line of log.filter(l => l.includes('Quest complete'))) {
      y += 5;
      this.add.text(400, y, line, {
        fontSize: '12px', color: '#44ccff', fontFamily: 'monospace',
      }).setOrigin(0.5);
      y += 20;
    }

    // Party
    y += 15;
    this.add.text(400, y, 'Party:', { fontSize: '14px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);
    y += 22;
    for (const p of gs.party) {
      const c = p.hp <= 0 ? '#666666' : '#ffffff';
      this.add.text(400, y,
        `${p.name} (${p.class_name}) Lv${p.level}  HP:${p.hp}/${p.max_hp}  XP:${p.xp}/${p.xp_next}`,
        { fontSize: '11px', color: c, fontFamily: 'monospace' }
      ).setOrigin(0.5);
      y += 18;
    }

    y += 10;
    this.add.text(400, y, `Gold: ${gs.gold}  |  Potions: ${gs.potions}`, {
      fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.addContinueButton(gs);
  }

  addContinueButton(gs) {
    const btn = this.add.text(400, 545, '[ CONTINUE ]', {
      fontSize: '20px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#88ff88'));
    btn.on('pointerout', () => btn.setColor('#44ff44'));
    btn.on('pointerdown', () => this.scene.start('World', { gameState: gs }));

    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('World', { gameState: gs }));
    this.input.keyboard.on('keydown-SPACE', () => this.scene.start('World', { gameState: gs }));
  }
}
