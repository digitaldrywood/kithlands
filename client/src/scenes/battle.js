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
    const hasItems = gs.potions > 0 || (gs.items && gs.items.some(i => i.id === 'phoenix_down'));
    if (hasItems) btns.push({ label: 'ITEMS', type: 'item', color: '#44ff44' });
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
          this.showItemPicker(slot);
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

  showItemPicker(slot) {
    const gs = this.gameState;
    const ol = [];

    // Available items
    const items = [];
    if (gs.potions > 0) items.push({ id: 'potion', name: `Potion (${gs.potions})`, type: 'heal' });
    const phoenix = gs.items?.find(i => i.id === 'phoenix_down');
    if (phoenix) items.push({ id: 'phoenix_down', name: `Phoenix Down (${phoenix.count})`, type: 'revive' });

    if (items.length === 0) return;

    const h = 50 + items.length * 35;
    const bg = this.add.rectangle(400, 380, 320, h, 0x112211, 0.95)
      .setStrokeStyle(2, 0x44aa44).setDepth(50).setInteractive();
    ol.push(bg);

    ol.push(this.add.text(400, 380 - h / 2 + 15, 'Choose an item:', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const y = 380 - h / 2 + 40 + i * 35;
      const row = this.add.rectangle(400, y, 280, 28, 0x224422)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      const txt = this.add.text(400, y, item.name, {
        fontSize: '11px', color: '#88ff88', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      ol.push(row, txt);

      row.on('pointerover', () => { row.setFillStyle(0x336633); txt.setColor('#ffffff'); });
      row.on('pointerout', () => { row.setFillStyle(0x224422); txt.setColor('#88ff88'); });
      row.on('pointerdown', () => {
        ol.forEach(o => o.destroy());
        this.showPartyTargetPicker(slot, item);
      });
    }

    const cancel = this.add.text(400, 380 + h / 2 - 12, '[ CANCEL ]', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => ol.forEach(o => o.destroy()));
    ol.push(cancel);
  }

  showPartyTargetPicker(slot, item) {
    const gs = this.gameState;
    const ol = [];

    // Filter targets based on item type
    const targets = [];
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      if (item.type === 'revive') {
        // Phoenix Down only on dead members
        if (p.hp <= 0) targets.push({ slot: i, ...p });
      } else {
        // Potions on living members
        if (p.hp > 0) targets.push({ slot: i, ...p });
      }
    }

    if (targets.length === 0) {
      this.promptText.setText('No valid targets!').setColor('#ff4444');
      return;
    }

    const h = 50 + targets.length * 40;
    const bg = this.add.rectangle(400, 350, 350, h, 0x112211, 0.95)
      .setStrokeStyle(2, 0x44aa44).setDepth(50).setInteractive();
    ol.push(bg);

    ol.push(this.add.text(400, 350 - h / 2 + 15, `Use ${item.name.split('(')[0].trim()} on:`, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51));

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const y = 350 - h / 2 + 45 + i * 40;
      const hpColor = t.hp <= 0 ? '#ff4444' : t.hp < t.max_hp * 0.5 ? '#ffaa44' : '#44ff44';
      const hpStr = t.hp <= 0 ? 'DEAD' : `${t.hp}/${t.max_hp} HP`;

      const row = this.add.rectangle(400, y, 300, 32, 0x224422)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      const txt = this.add.text(400, y, `${t.name} (${t.class_name}) - ${hpStr}`, {
        fontSize: '11px', color: hpColor, fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      ol.push(row, txt);

      row.on('pointerover', () => row.setFillStyle(0x336633));
      row.on('pointerout', () => row.setFillStyle(0x224422));
      row.on('pointerdown', () => {
        ol.forEach(o => o.destroy());
        this.recordAction(slot, {
          slot,
          type: item.id === 'phoenix_down' ? 'revive' : 'item',
          target_id: t.slot,
        });
      });
    }

    const cancel = this.add.text(400, 350 + h / 2 - 12, '[ CANCEL ]', {
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
      // Parse attack: "Hero attacks Goblin[102] for 24 damage"
      const attackMatch = line.match(/^(.+?) attacks (.+?)\[(\d+)\] for (\d+)/);
      // Parse spell: "Mage casts Spark on Goblin[102] for 11 damage"
      const spellMatch = line.match(/^(.+?) casts (.+?) on (.+?)\[?(\d*)\]? for (\d+)/);
      const defeatMatch = line.includes('DEFEATED');

      if (attackMatch) {
        const [, attacker, target, targetId, dmg] = attackMatch;

        // Move arrow to attacker
        const pe = this.partySprites[attacker];
        if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText.setText(`${attacker} attacks!`).setColor('#ff4444');
          await this.tweenP(pe.sprite, { x: pe.x - 20, duration: 80 });
          await this.tweenP(pe.sprite, { x: pe.x, duration: 80 });
        }

        // Hit effect on target -- use ID for correct sprite
        const ee = targetId ? this.enemySprites[parseInt(targetId)] : Object.values(this.enemySprites).find(e => e.name === target);
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
        const [, caster, spell, target, targetId, dmg] = spellMatch;
        const pe = this.partySprites[caster];
        if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText.setText(`${caster} casts ${spell}!`).setColor('#8888ff');
        }

        const flash = this.add.rectangle(400, 300, 800, 600, 0x4444ff, 0.2).setDepth(19);
        this.time.delayedCall(200, () => flash.destroy());

        const ee = targetId ? this.enemySprites[parseInt(targetId)] : Object.values(this.enemySprites).find(e => e.name === target);
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
    this.add.text(400, 30, isDefeat ? 'DEFEAT' : 'VICTORY!', {
      fontSize: '32px', color: isDefeat ? '#ff4444' : '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (isDefeat) {
      this.add.text(400, 80, gs.message || 'Your party has fallen.', {
        fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.addContinueButton(gs);
      return;
    }

    const log = gs.combat_log || [];

    // Rewards summary (gold, items)
    let y = 60;
    for (const l of log) {
      if (l.includes('Victory') || l.includes('Found:')) {
        this.add.text(400, y, l, { fontSize: '11px', color: '#44ff44', fontFamily: 'monospace' }).setOrigin(0.5);
        y += 16;
      }
    }

    // Quest completions
    for (const l of log.filter(l => l.includes('Quest complete'))) {
      this.add.text(400, y, l, { fontSize: '11px', color: '#44ccff', fontFamily: 'monospace' }).setOrigin(0.5);
      y += 16;
    }

    // Animated XP bars for each party member
    y += 15;
    const barW = 300;
    const xpBefore = gs.xp_before || [];

    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const alive = p.hp > 0;
      const prevXP = xpBefore[i] || 0;

      // Character sprite + name
      const cs = CLASS_SPRITES[p.class_id];
      if (cs && this.textures.exists(cs)) {
        const sprite = this.add.image(100, y + 20, cs);
        sprite.setScale(40 / Math.max(sprite.width, sprite.height) * 2);
        if (!alive) sprite.setTint(0x444444);
      }

      // Name and level
      this.add.text(140, y, `${p.name}`, {
        fontSize: '13px', color: alive ? '#ffffff' : '#666666', fontFamily: 'monospace',
      });
      const levelText = this.add.text(140, y + 16, `${p.class_name} Lv.${p.level}`, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      });

      // HP bar
      this.add.text(300, y, 'HP', { fontSize: '9px', color: '#888888', fontFamily: 'monospace' });
      this.add.rectangle(300 + barW / 2 + 15, y + 4, barW, 8, 0x333333);
      const hpPct = Math.max(0, p.hp / p.max_hp);
      if (hpPct > 0) {
        const hpColor = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(300 + 15 + barW * hpPct / 2, y + 4, barW * hpPct, 8, hpColor);
      }
      this.add.text(300 + barW + 20, y, `${p.hp}/${p.max_hp}`, {
        fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
      });

      // XP bar with animation
      this.add.text(300, y + 18, 'XP', { fontSize: '9px', color: '#888888', fontFamily: 'monospace' });
      const xpBarBg = this.add.rectangle(300 + barW / 2 + 15, y + 22, barW, 10, 0x222244);
      const xpPctStart = p.xp_next > 0 ? Math.min(1, prevXP / p.xp_next) : 0;
      const xpPctEnd = p.xp_next > 0 ? Math.min(1, p.xp / p.xp_next) : 0;

      const xpBarFill = this.add.rectangle(
        300 + 15, y + 22,
        1, 10, 0x4488ff
      ).setOrigin(0, 0.5);

      const xpText = this.add.text(300 + barW + 20, y + 17, `${prevXP}/${p.xp_next}`, {
        fontSize: '9px', color: '#8888ff', fontFamily: 'monospace',
      });

      // Animate the XP bar filling
      const delay = 500 + i * 800;
      this.tweens.add({
        targets: xpBarFill,
        width: barW * xpPctEnd,
        duration: 1200,
        delay,
        ease: 'Power2',
        onUpdate: () => {
          // Update XP text as bar fills
          const progress = xpBarFill.width / barW;
          const currentXP = Math.floor(prevXP + (p.xp - prevXP) * (progress / xpPctEnd || 0));
          xpText.setText(`${Math.min(currentXP, p.xp)}/${p.xp_next}`);
        },
      });

      // Check for level up -- flash effect
      const leveledUp = log.some(l => l.includes(`${p.name} leveled up`));
      if (leveledUp) {
        this.time.delayedCall(delay + 1300, () => {
          // Flash
          const flash = this.add.rectangle(400, y + 20, 700, 50, 0xffff44, 0.3);
          this.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });

          // Level up text
          const lvlText = this.add.text(650, y + 12, 'LEVEL UP!', {
            fontSize: '14px', color: '#ffff44', fontFamily: 'monospace', fontStyle: 'bold',
          }).setOrigin(0.5).setAlpha(0);
          this.tweens.add({ targets: lvlText, alpha: 1, duration: 300 });

          // Update level display
          levelText.setText(`${p.class_name} Lv.${p.level}`).setColor('#ffff44');
        });
      }

      // Stats row
      this.add.text(140, y + 35,
        `STR:${p.str}  AGI:${p.agi}  INT:${p.int_stat}`,
        { fontSize: '8px', color: '#888888', fontFamily: 'monospace' }
      );

      y += 65;
    }

    // Gold and items
    y += 5;
    this.add.text(400, y, `Gold: ${gs.gold}  |  Potions: ${gs.potions}`, {
      fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Items found
    if (gs.items && gs.items.length > 0) {
      y += 18;
      const itemStr = gs.items.map(i => `${i.name}(${i.count})`).join(', ');
      this.add.text(400, y, `Items: ${itemStr}`, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // Delay continue button to let animations play
    this.time.delayedCall(500 + gs.party.length * 800 + 1000, () => {
      this.addContinueButton(gs);
    });
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
