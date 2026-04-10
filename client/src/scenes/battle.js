import { gameAction } from '../api.js';

const ENEMY_SPRITES = {
  'Slime': 'monster_slime', 'Goblin': 'monster_goblin', 'Wolf': 'monster_wolf',
  'Skeleton': 'monster_skeleton', 'Dark Knight': 'monster_dark_knight',
};
const ENEMY_COLORS = {
  'Slime': 0x42A5F5, 'Goblin': 0x66BB6A, 'Wolf': 0x8D6E63,
  'Skeleton': 0xEEEEEE, 'Dark Knight': 0x512DA8,
};
const CLASS_SPRITES = {
  'warrior': 'warrior', 'cinder': 'cinder', 'mender': 'mender', 'rogue': 'rogue',
};

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) { this.gameState = data.gameState; }

  create() {
    this.animating = false;
    this.enemySprites = {};
    this.partySprites = {};
    this.partyArrows = [];
    this.pendingAction = null;
    this.pendingSpellId = null;
    this.actionBtns = null;

    // Per-member action collection
    this.memberActions = []; // array of {slot, type, target_id, spell_id}
    this.currentMemberIdx = 0;
    this.livingMembers = [];

    const gs = this.gameState;
    if (!gs || gs.phase !== 'combat' || !gs.enemies?.length) {
      if (gs?.combat_log?.length) this.showVictoryResults(gs);
      else this.scene.start('World', { gameState: gs });
      return;
    }

    // Find living party members
    for (let i = 0; i < gs.party.length; i++) {
      if (gs.party[i].hp > 0) this.livingMembers.push(i);
    }
    this.currentMemberIdx = 0;

    // Background
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);
    this.add.rectangle(400, 400, 800, 200, 0x111133);

    this.drawEnemies(gs);
    this.drawParty(gs);
    this.drawLog(gs);

    this.promptText = this.add.text(400, 340, '', {
      fontSize: '11px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(5);

    // Show first member's turn
    this.showCurrentMemberTurn();
  }

  showCurrentMemberTurn() {
    const gs = this.gameState;
    if (this.currentMemberIdx >= this.livingMembers.length) {
      // All members have chosen -- send all actions to server
      this.submitAllActions();
      return;
    }

    const slot = this.livingMembers[this.currentMemberIdx];
    const member = gs.party[slot];

    // Move arrow to current member
    for (let i = 0; i < this.partyArrows.length; i++) {
      this.partyArrows[i].setVisible(i === slot);
    }

    this.promptText.setText(`${member.name}'s turn -- choose an action`).setColor('#ffff44');
    this.pendingAction = null;

    // Draw action buttons for this member
    this.drawActions(gs, slot);
  }

  drawEnemies(gs) {
    const enemies = gs.enemies;
    const spacing = Math.min(130, 450 / Math.max(enemies.length, 1));
    const sx = 80 + (450 - enemies.length * spacing) / 2;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = sx + i * spacing, y = 240;
      const sz = e.name === 'Dark Knight' ? 80 : 50;

      const key = ENEMY_SPRITES[e.name];
      let sprite;
      if (key && this.textures.exists(key)) {
        sprite = this.add.image(x, y, key);
        sprite.setScale(sz / Math.max(sprite.width, sprite.height) * 2);
      } else {
        sprite = this.add.rectangle(x, y, sz, sz, ENEMY_COLORS[e.name] || 0xFF5722);
      }
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => this.onEnemyClick(e.id));
      sprite.on('pointerover', () => {
        sprite.setAlpha(0.7);
        if (this.pendingAction) this.promptText.setText(`Target: ${e.name}`);
      });
      sprite.on('pointerout', () => sprite.setAlpha(1));
      this.enemySprites[e.id] = { sprite, x, y, name: e.name };

      this.add.text(x, y - sz / 2 - 18, e.name, {
        fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);

      const bw = 65, pct = Math.max(0, e.hp / e.max_hp);
      this.add.rectangle(x, y + sz / 2 + 10, bw, 7, 0x333333);
      if (pct > 0) {
        const bc = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x - bw / 2 * (1 - pct), y + sz / 2 + 10, bw * pct, 7, bc);
      }
      this.add.text(x, y + sz / 2 + 22, `${e.hp}/${e.max_hp}`, {
        fontSize: '8px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }
  }

  drawParty(gs) {
    const px = 560;
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const x = px, y = 160 + i * 85;
      const alive = p.hp > 0;

      const arrow = this.add.triangle(x - 18, y, 0, -8, 0, 8, 10, 0, 0xffff44)
        .setDepth(2).setVisible(false);
      this.partyArrows[i] = arrow;

      const cs = CLASS_SPRITES[p.class_id];
      let sprite;
      if (cs && this.textures.exists(cs)) {
        sprite = this.add.image(x + 15, y, cs);
        sprite.setScale(50 / Math.max(sprite.width, sprite.height) * 2);
        if (!alive) sprite.setTint(0x444444);
      } else {
        sprite = this.add.rectangle(x + 15, y, 35, 35, alive ? 0xFF5722 : 0x444444);
      }
      this.partySprites[p.name] = { sprite, arrow, x: x + 15, y, alive, slot: i };

      this.add.text(x + 45, y - 18, p.name, {
        fontSize: '11px', color: alive ? '#ffffff' : '#666666', fontFamily: 'monospace',
      });
      this.add.text(x + 45, y - 3, `${p.class_name} Lv${p.level}`, {
        fontSize: '9px', color: '#aaaaaa', fontFamily: 'monospace',
      });

      const bw = 85, hpPct = Math.max(0, p.hp / p.max_hp);
      this.add.rectangle(x + 90 + bw / 2, y + 13, bw, 6, 0x333333);
      if (hpPct > 0) {
        const bc = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x + 90 + bw * hpPct / 2, y + 13, bw * hpPct, 6, bc);
      }
      this.add.text(x + 90 + bw + 5, y + 8, `${p.hp}/${p.max_hp}`, {
        fontSize: '8px', color: '#cccccc', fontFamily: 'monospace',
      });

      if (p.spells?.length > 0 && alive) {
        this.add.text(x + 45, y + 22, p.spells.map(s => `${s.name}(${s.charges})`).join(' '), {
          fontSize: '7px', color: '#8888ff', fontFamily: 'monospace',
        });
      }
    }
  }

  drawLog(gs) {
    this.add.rectangle(400, 488, 780, 55, 0x000000, 0.85);
    const log = gs.combat_log || [];
    for (let i = 0; i < Math.min(log.length, 3); i++) {
      this.add.text(20, 498 - i * 16, log[log.length - 1 - i], {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 760 },
      });
    }
  }

  drawActions(gs, slot) {
    // Remove old buttons
    if (this.actionBtns) {
      this.actionBtns.forEach(o => o.destroy());
    }
    this.actionBtns = [];

    const member = gs.party[slot];
    const hasSpells = member.spells?.length > 0 && member.spells.some(s => s.charges > 0);

    const btns = [{ label: 'ATTACK', type: 'attack', color: '#ff4444' }];
    if (hasSpells) btns.push({ label: 'SPELL', type: 'spell', color: '#8888ff' });
    if (gs.potions > 0) btns.push({ label: `POTION(${gs.potions})`, type: 'item', color: '#44ff44' });
    btns.push({ label: 'FLEE', type: 'flee', color: '#ffcc44' });

    const tw = btns.length * 145, sx = 400 - tw / 2 + 72;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i], x = sx + i * 145;
      const bg = this.add.rectangle(x, 555, 125, 30, 0x1a1a44)
        .setStrokeStyle(1, 0x444488).setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, 555, b.label, {
        fontSize: '12px', color: b.color, fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.actionBtns.push(bg, txt);

      bg.on('pointerover', () => bg.setFillStyle(0x2a2a66));
      bg.on('pointerout', () => bg.setFillStyle(0x1a1a44));
      bg.on('pointerdown', () => {
        if (this.animating) return;
        if (b.type === 'attack') {
          this.pendingAction = 'attack';
          this.promptText.setText(`${member.name}: Click an enemy to attack!`).setColor('#ff4444');
        } else if (b.type === 'spell') {
          this.showSpellPicker(slot);
        } else if (b.type === 'item') {
          this.recordAction(slot, { slot, type: 'item', target_id: 0 });
        } else if (b.type === 'flee') {
          // Flee sends immediately (whole party flees)
          this.doFlee();
        }
      });
    }
  }

  onEnemyClick(enemyId) {
    if (this.animating) return;
    const slot = this.livingMembers[this.currentMemberIdx];

    if (this.pendingAction === 'attack') {
      this.pendingAction = null;
      this.recordAction(slot, { slot, type: 'attack', target_id: enemyId });
    } else if (this.pendingAction === 'spell') {
      this.pendingAction = null;
      this.recordAction(slot, { slot, type: 'spell', target_id: enemyId, spell_id: this.pendingSpellId });
    }
  }

  recordAction(slot, action) {
    const member = this.gameState.party[slot];
    const actionName = action.type === 'spell' ? 'casts spell' : action.type === 'item' ? 'uses potion' : 'attacks';
    this.promptText.setText(`${member.name} ${actionName}!`).setColor('#44ff44');

    this.memberActions.push(action);
    this.currentMemberIdx++;

    // Brief pause then show next member's turn
    this.time.delayedCall(400, () => this.showCurrentMemberTurn());
  }

  showSpellPicker(slot) {
    const gs = this.gameState;
    const member = gs.party[slot];
    if (!member?.spells) return;

    const spells = member.spells.filter(s => s.charges > 0);
    if (!spells.length) return;

    const ol = [];
    const h = 50 + spells.length * 32;
    const bg = this.add.rectangle(400, 380, 320, h, 0x111144, 0.95)
      .setStrokeStyle(2, 0x4444aa).setDepth(50).setInteractive();
    ol.push(bg);

    ol.push(this.add.text(400, 380 - h / 2 + 15, `${member.name}'s spells:`, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51));

    for (let i = 0; i < spells.length; i++) {
      const sp = spells[i];
      const y = 380 - h / 2 + 40 + i * 32;
      const row = this.add.rectangle(400, y, 280, 26, 0x222255)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      const txt = this.add.text(400, y, `${sp.name} (${sp.charges} charges)`, {
        fontSize: '11px', color: '#aaaaff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      ol.push(row, txt);

      row.on('pointerover', () => { row.setFillStyle(0x3333aa); txt.setColor('#ffffff'); });
      row.on('pointerout', () => { row.setFillStyle(0x222255); txt.setColor('#aaaaff'); });
      row.on('pointerdown', () => {
        ol.forEach(o => o.destroy());
        this.pendingAction = 'spell';
        this.pendingSpellId = sp.id;
        this.promptText.setText(`${member.name}: Cast ${sp.name} -- click a target!`).setColor('#8888ff');
      });
    }

    const cancel = this.add.text(400, 380 + h / 2 - 15, '[ CANCEL ]', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => ol.forEach(o => o.destroy()));
    ol.push(cancel);
  }

  async doFlee() {
    this.animating = true;
    this.promptText.setText('');
    const result = await gameAction(this.gameState.id, { type: 'flee' });
    this.gameState = result;
    this.time.delayedCall(300, () => {
      this.animating = false;
      if (result.phase !== 'combat') {
        this.scene.start('World', { gameState: result });
      } else {
        this.scene.restart({ gameState: result });
      }
    });
  }

  async submitAllActions() {
    this.animating = true;
    this.promptText.setText('Resolving combat...').setColor('#ffffff');

    try {
      const result = await gameAction(this.gameState.id, {
        type: 'combat_round',
        actions: this.memberActions,
      });

      if (result.error) {
        console.error('[Battle] error:', result.error);
        this.animating = false;
        return;
      }

      // Animate each line of the combat log
      const log = result.combat_log || [];
      await this.animateCombatLog(log);

      this.gameState = result;

      this.time.delayedCall(400, () => {
        this.animating = false;
        if (this.gameState.phase !== 'combat') {
          this.showVictoryResults(this.gameState);
        } else {
          this.scene.restart({ gameState: this.gameState });
        }
      });
    } catch (e) {
      console.error('[Battle] failed:', e);
      this.animating = false;
    }
  }

  async animateCombatLog(log) {
    for (const line of log) {
      const attackMatch = line.match(/^(.+?) attacks (.+?) for (\d+)/);
      const spellMatch = line.match(/^(.+?) casts (.+?) on (.+?) for (\d+)/);
      const defeatMatch = line.includes('DEFEATED');

      if (attackMatch) {
        const [, attacker, target, dmg] = attackMatch;

        // Move arrow to attacker
        const pe = this.partySprites[attacker];
        if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText.setText(`${attacker} attacks!`).setColor('#ff4444');
          await this.tweenP(pe.sprite, { x: pe.x - 20, duration: 80 });
          await this.tweenP(pe.sprite, { x: pe.x, duration: 80 });
        }

        // Hit effect on target
        const ee = Object.values(this.enemySprites).find(e => e.name === target);
        const pt = this.partySprites[target];
        if (ee) {
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch);
          if (ee.sprite.setTint) { ee.sprite.setTint(0xff4444); this.time.delayedCall(200, () => ee.sprite.clearTint?.()); }
        } else if (pt) {
          this.promptText.setText(`${attacker} attacks ${target}!`).setColor('#ff8800');
          await this.hitFx(pt.x, pt.y, dmg, true, false);
          if (pt.sprite.setTint) { pt.sprite.setTint(0xff4444); this.time.delayedCall(200, () => pt.sprite.clearTint?.()); }
          this.cameras.main.shake(80, 0.005);
        }
        await this.wait(200);

      } else if (spellMatch) {
        const [, caster, spell, target, dmg] = spellMatch;
        const pe = this.partySprites[caster];
        if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText.setText(`${caster} casts ${spell}!`).setColor('#8888ff');
        }

        const flash = this.add.rectangle(400, 300, 800, 600, 0x4444ff, 0.2).setDepth(19);
        this.time.delayedCall(200, () => flash.destroy());

        const ee = Object.values(this.enemySprites).find(e => e.name === target);
        if (ee) {
          for (let j = 0; j < 6; j++) {
            const px = ee.x + Phaser.Math.Between(-25, 25);
            const py = ee.y + Phaser.Math.Between(-25, 25);
            const p = this.add.circle(px, py, 4, 0x8888ff).setDepth(20);
            this.tweens.add({ targets: p, y: py - 30, alpha: 0, duration: 400, onComplete: () => p.destroy() });
          }
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch);
        }
        await this.wait(250);

      } else if (line.includes('Found:')) {
        this.promptText.setText(line).setColor('#44ff44');
        await this.wait(400);

      } else if (line.includes('healed')) {
        this.promptText.setText(line).setColor('#44ff44');
        const healMatch = line.match(/healed (\d+)/);
        if (healMatch) {
          const nt = this.add.text(600, 220, `+${healMatch[1]}`, {
            fontSize: '16px', color: '#44ff44', fontFamily: 'monospace', fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(25);
          this.tweens.add({ targets: nt, y: nt.y - 30, alpha: 0, duration: 700, onComplete: () => nt.destroy() });
        }
        await this.wait(300);
      }
    }
  }

  hitFx(x, y, dmg, isParty, defeated) {
    return new Promise(resolve => {
      const g = this.add.graphics().setDepth(20);
      g.lineStyle(3, isParty ? 0xff8800 : 0xffffff, 1);
      g.lineBetween(x - 20, y - 15, x + 20, y + 15);
      this.time.delayedCall(150, () => g.destroy());

      const color = isParty ? '#ff8800' : '#ff4444';
      const nt = this.add.text(x + Phaser.Math.Between(-10, 10), y - 10, `-${dmg}`, {
        fontSize: '16px', color, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(25);
      this.tweens.add({ targets: nt, y: nt.y - 35, alpha: 0, duration: 700, onComplete: () => nt.destroy() });

      if (defeated) {
        const dt = this.add.text(x, y + 20, 'DEFEATED!', {
          fontSize: '11px', color: '#ff4444', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(25);
        this.tweens.add({ targets: dt, alpha: 0, duration: 1000, delay: 300, onComplete: () => dt.destroy() });
      }

      this.time.delayedCall(150, resolve);
    });
  }

  tweenP(target, config) {
    return new Promise(resolve => this.tweens.add({ targets: target, ...config, onComplete: resolve }));
  }

  wait(ms) {
    return new Promise(resolve => this.time.delayedCall(ms, resolve));
  }

  showVictoryResults(gs) {
    this.children.removeAll(true);
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);

    const isDefeat = gs.phase === 'defeat';
    this.add.text(400, 40, isDefeat ? 'DEFEAT' : 'VICTORY!', {
      fontSize: '36px', color: isDefeat ? '#ff4444' : '#ffff44', fontFamily: 'monospace',
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
    for (const l of log) {
      if (l.includes('Victory') || l.includes('Found:') || l.startsWith('+')) {
        this.add.text(400, y, l, { fontSize: '12px', color: '#44ff44', fontFamily: 'monospace' }).setOrigin(0.5);
        y += 20;
      }
    }
    const lvlUps = log.filter(l => l.includes('leveled up'));
    if (lvlUps.length) {
      y += 8;
      this.add.text(400, y, '-- LEVEL UP --', { fontSize: '16px', color: '#ffff44', fontFamily: 'monospace' }).setOrigin(0.5);
      y += 22;
      for (const l of lvlUps) {
        this.add.text(400, y, l, { fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace' }).setOrigin(0.5);
        y += 20;
      }
    }
    for (const l of log.filter(l => l.includes('Quest complete'))) {
      y += 5;
      this.add.text(400, y, l, { fontSize: '12px', color: '#44ccff', fontFamily: 'monospace' }).setOrigin(0.5);
      y += 20;
    }

    y += 12;
    this.add.text(400, y, 'Party:', { fontSize: '13px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5);
    y += 20;
    for (const p of gs.party) {
      this.add.text(400, y,
        `${p.name} (${p.class_name}) Lv${p.level}  HP:${p.hp}/${p.max_hp}  XP:${p.xp}/${p.xp_next}`,
        { fontSize: '11px', color: p.hp <= 0 ? '#666666' : '#ffffff', fontFamily: 'monospace' }
      ).setOrigin(0.5);
      y += 18;
    }
    y += 8;
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
