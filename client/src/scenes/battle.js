import { gameAction } from '../api.js';
import { initAudio, playMusic, playSFX, stopMusic } from '../systems/audio.js';

const ENEMY_SPRITES = {
  'Slime': 'monster_slime', 'Goblin': 'monster_goblin', 'Wolf': 'monster_wolf',
  'Skeleton': 'monster_skeleton', 'Dark Knight': 'monster_dark_knight',
};
const ENEMY_COLORS = {
  'Slime': 0x42A5F5, 'Goblin': 0x66BB6A, 'Wolf': 0x8D6E63,
  'Skeleton': 0xEEEEEE, 'Dark Knight': 0x512DA8,
};
const STATUS_ICONS = {
  'poison': 'icon_poison', 'sleep': 'icon_sleep',
  'silence': 'icon_mute', 'stone': 'icon_paralyze',
};
const ELEMENT_COLORS = {
  'fire': 0xff4444, 'ice': 0x44aaff, 'lightning': 0xffff44,
  'holy': 0xffffff, 'dark': 0x8844aa,
};
const ELEMENT_FLASH = {
  'fire': 0xff2200, 'ice': 0x2266ff, 'lightning': 0xffee00,
  'holy': 0xffffcc, 'dark': 0x442266,
};
const ELEMENT_SFX = {
  'fire': 'sfx_fire', 'ice': 'sfx_ice', 'lightning': 'sfx_lightning',
};
const CLASS_SPRITES = {
  'warrior': 'warrior', 'cinder': 'cinder', 'mender': 'mender', 'rogue': 'rogue',
  'brawler': 'brawler', 'wayfarer': 'wayfarer',
  // Promoted classes
  'knight': 'knight', 'pyromancer': 'pyromancer', 'sage': 'sage',
  'shadow': 'shadow', 'champion': 'champion', 'wanderer': 'wanderer',
};

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) { this.gameState = data.gameState; }

  create() {
    // Clear previous keyboard listeners to prevent duplicates on scene restart
    this.input.keyboard.removeAllListeners();

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

    // Keyboard targeting state
    this.targetingMode = false;
    this.selectedTargetIdx = 0;
    this.livingEnemies = [];
    this.enemyNumbers = [];
    this.targetHighlight = null;
    this.targetHighlightTween = null;
    this.pickerOverlay = null;
    this.pickerItems = [];

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

    initAudio(this);

    // Play battle music (boss if size=boss, normal otherwise)
    const isBoss = gs.enemies.some(e => e.size === 'boss');
    playMusic(isBoss ? 'music_boss' : 'music_battle');

    // Background
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);
    this.add.rectangle(400, 400, 800, 200, 0x111133);

    this.drawEnemies(gs);
    this.drawParty(gs);
    this.drawLog(gs);

    this.promptText = this.add.text(400, 340, '', {
      fontSize: '11px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(5);

    this.setupKeyboard();

    // Boss intro animation
    if (isBoss) {
      this.animating = true;
      const boss = gs.enemies.find(e => e.size === 'boss');
      const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.8).setDepth(30);
      this.cameras.main.shake(200, 0.01);
      const bossText = this.add.text(400, 260, boss.name, {
        fontSize: '28px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(31).setScale(0.5).setAlpha(0);
      this.tweens.add({ targets: bossText, scaleX: 1, scaleY: 1, alpha: 1, duration: 400, ease: 'Back.easeOut' });
      this.tweens.add({ targets: overlay, alpha: 0, duration: 600, delay: 600, onComplete: () => overlay.destroy() });
      this.tweens.add({ targets: bossText, alpha: 0, duration: 300, delay: 800, onComplete: () => bossText.destroy() });
      this.time.delayedCall(1000, () => {
        this.animating = false;
        this.showCurrentMemberTurn();
      });
    } else {
      this.showCurrentMemberTurn();
    }
  }

  setupKeyboard() {
    // Action hotkeys (A/S/I/F)
    this.input.keyboard.on('keydown-A', () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      const slot = this.livingMembers[this.currentMemberIdx];
      const member = this.gameState.party[slot];
      this.pendingAction = 'attack';
      this.enterTargetingMode();
      this.promptText.setText(`${member.name}: Select a target to attack!`).setColor('#ff4444');
    });

    this.input.keyboard.on('keydown-S', () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      const slot = this.livingMembers[this.currentMemberIdx];
      this.showSpellPicker(slot);
    });

    this.input.keyboard.on('keydown-I', () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      const slot = this.livingMembers[this.currentMemberIdx];
      this.showItemPicker(slot);
    });

    this.input.keyboard.on('keydown-B', () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      const slot = this.livingMembers[this.currentMemberIdx];
      this.showAbilityPicker(slot);
    });

    this.input.keyboard.on('keydown-F', () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      this.doFlee();
    });

    // Number keys 1-9 for target/picker selection
    const numKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    for (let n = 0; n < numKeys.length; n++) {
      this.input.keyboard.on(`keydown-${numKeys[n]}`, () => {
        if (this.animating) return;
        if (this.pickerOverlay && this.pickerItems.length > 0) {
          if (n < this.pickerItems.length) {
            this.pickerItems[n].action();
          }
          return;
        }
        if (this.targetingMode) {
          // Match the displayed number (1-based position in full enemy list)
          const enemies = this.gameState.enemies;
          if (n < enemies.length && enemies[n].hp > 0) {
            this.exitTargetingMode();
            this.onEnemyClick(enemies[n].id);
          }
          return;
        }
      });
    }

    // Arrow keys to cycle targets
    this.input.keyboard.on('keydown-LEFT', () => {
      if (!this.targetingMode || this.livingEnemies.length === 0) return;
      this.selectedTargetIdx = (this.selectedTargetIdx - 1 + this.livingEnemies.length) % this.livingEnemies.length;
      this.updateTargetHighlight();
    });

    this.input.keyboard.on('keydown-RIGHT', () => {
      if (!this.targetingMode || this.livingEnemies.length === 0) return;
      this.selectedTargetIdx = (this.selectedTargetIdx + 1) % this.livingEnemies.length;
      this.updateTargetHighlight();
    });

    // Enter to confirm target
    this.input.keyboard.on('keydown-ENTER', () => {
      if (this.targetingMode && this.livingEnemies.length > 0) {
        const enemy = this.livingEnemies[this.selectedTargetIdx];
        this.exitTargetingMode();
        this.onEnemyClick(enemy.id);
      }
    });

    // Escape to cancel
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.pickerOverlay) {
        this.closePicker();
        return;
      }
      if (this.targetingMode) {
        this.exitTargetingMode();
        this.pendingAction = null;
        const slot = this.livingMembers[this.currentMemberIdx];
        const member = this.gameState.party[slot];
        this.promptText.setText(`${member.name}'s turn -- choose an action`).setColor('#ffff44');
        return;
      }
    });
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
    this.enemyNumbers = [];

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

      // Number indicator for keyboard targeting
      const numText = this.add.text(x, y + sz / 2 + 1, `${i + 1}`, {
        fontSize: '10px', color: '#ffff44', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(10).setAlpha(0.3);
      this.enemyNumbers.push({ text: numText, enemyId: e.id });

      const bw = 65, pct = Math.max(0, e.hp / e.max_hp);
      this.add.rectangle(x, y + sz / 2 + 10, bw, 7, 0x333333);
      if (pct > 0) {
        const bc = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x - bw / 2 * (1 - pct), y + sz / 2 + 10, bw * pct, 7, bc);
      }
      this.add.text(x, y + sz / 2 + 22, `${e.hp}/${e.max_hp}`, {
        fontSize: '8px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5);

      // Status effect icon
      if (e.status && STATUS_ICONS[e.status]) {
        const iconKey = STATUS_ICONS[e.status];
        if (this.textures.exists(iconKey)) {
          const icon = this.add.image(x + sz / 2 + 2, y - sz / 2 - 2, iconKey).setDepth(10);
          icon.setScale(16 / Math.max(icon.width, icon.height));
        }
      }
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

      const cs = CLASS_SPRITES[p.sprite_id || p.class_id];
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

      // Status effect icon
      if (p.status && STATUS_ICONS[p.status]) {
        const iconKey = STATUS_ICONS[p.status];
        if (this.textures.exists(iconKey)) {
          const icon = this.add.image(x + 35, y - 20, iconKey).setDepth(10);
          icon.setScale(16 / Math.max(icon.width, icon.height));
        }
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
    const hasAbilities = member.abilities?.length > 0;

    const btns = [{ label: '[A]TTACK', type: 'attack', color: '#ff4444' }];
    if (hasSpells) btns.push({ label: '[S]PELL', type: 'spell', color: '#8888ff' });
    if (hasAbilities) btns.push({ label: '[B]ABILITY', type: 'ability', color: '#ff88ff' });
    const hasItems = gs.potions > 0 || (gs.items && gs.items.some(i => i.id === 'phoenix_down'));
    if (hasItems) btns.push({ label: '[I]TEMS', type: 'item', color: '#44ff44' });
    btns.push({ label: '[F]LEE', type: 'flee', color: '#ffcc44' });

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
          this.enterTargetingMode();
          this.promptText.setText(`${member.name}: Select a target to attack!`).setColor('#ff4444');
        } else if (b.type === 'spell') {
          this.showSpellPicker(slot);
        } else if (b.type === 'ability') {
          this.showAbilityPicker(slot);
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
    if (this.targetingMode) this.exitTargetingMode();
    const slot = this.livingMembers[this.currentMemberIdx];

    if (this.pendingAction === 'attack') {
      this.pendingAction = null;
      this.recordAction(slot, { slot, type: 'attack', target_id: enemyId });
    } else if (this.pendingAction === 'spell') {
      this.pendingAction = null;
      this.recordAction(slot, { slot, type: 'spell', target_id: enemyId, spell_id: this.pendingSpellId });
    } else if (this.pendingAction === 'ability') {
      this.pendingAction = null;
      this.recordAction(slot, { slot, type: 'ability', target_id: enemyId, ability_id: this.pendingAbilityId });
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

  enterTargetingMode() {
    this.targetingMode = true;
    this.livingEnemies = this.gameState.enemies.filter(e => e.hp > 0);
    this.selectedTargetIdx = 0;

    // Brighten number indicators
    for (const en of this.enemyNumbers) {
      const isLiving = this.livingEnemies.some(e => e.id === en.enemyId);
      en.text.setAlpha(isLiving ? 1.0 : 0.1);
    }

    this.updateTargetHighlight();
  }

  exitTargetingMode() {
    this.targetingMode = false;
    this.livingEnemies = [];

    // Dim number indicators
    for (const en of this.enemyNumbers) {
      en.text.setAlpha(0.3);
    }

    // Remove highlight
    if (this.targetHighlightTween) {
      this.targetHighlightTween.stop();
      this.targetHighlightTween = null;
    }
    if (this.targetHighlight) {
      this.targetHighlight.destroy();
      this.targetHighlight = null;
    }
  }

  updateTargetHighlight() {
    if (!this.targetingMode || this.livingEnemies.length === 0) return;

    const enemy = this.livingEnemies[this.selectedTargetIdx];
    const es = this.enemySprites[enemy.id];
    if (!es) return;

    // Remove old highlight
    if (this.targetHighlightTween) {
      this.targetHighlightTween.stop();
      this.targetHighlightTween = null;
    }
    if (this.targetHighlight) {
      this.targetHighlight.destroy();
    }

    // Create pulsing highlight around selected enemy
    const sz = enemy.name === 'Dark Knight' ? 90 : 60;
    this.targetHighlight = this.add.rectangle(es.x, es.y, sz, sz)
      .setStrokeStyle(2, 0xffff44).setFillStyle(0xffff44, 0.1).setDepth(9);

    this.targetHighlightTween = this.tweens.add({
      targets: this.targetHighlight,
      alpha: { from: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Show the position number from the full enemy list (matches displayed number)
    const fullIdx = this.gameState.enemies.findIndex(e => e.id === enemy.id);
    this.promptText.setText(`Target: ${enemy.name} [${fullIdx + 1}]`);
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

    this.pickerItems = [];
    for (let i = 0; i < spells.length; i++) {
      const sp = spells[i];
      const y = 380 - h / 2 + 40 + i * 32;
      const row = this.add.rectangle(400, y, 280, 26, 0x222255)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      const txt = this.add.text(400, y, `${i + 1}. ${sp.name} (${sp.charges} charges)`, {
        fontSize: '11px', color: '#aaaaff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      ol.push(row, txt);

      const selectSpell = () => {
        this.closePicker();
        this.pendingAction = 'spell';
        this.pendingSpellId = sp.id;
        this.enterTargetingMode();
        this.promptText.setText(`${member.name}: Cast ${sp.name} -- select a target!`).setColor('#8888ff');
      };

      this.pickerItems.push({ action: selectSpell });

      row.on('pointerover', () => { row.setFillStyle(0x3333aa); txt.setColor('#ffffff'); });
      row.on('pointerout', () => { row.setFillStyle(0x222255); txt.setColor('#aaaaff'); });
      row.on('pointerdown', selectSpell);
    }

    const cancel = this.add.text(400, 380 + h / 2 - 15, '[ CANCEL / ESC ]', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => this.closePicker());
    ol.push(cancel);

    this.pickerOverlay = ol;
  }

  showAbilityPicker(slot) {
    const gs = this.gameState;
    const member = gs.party[slot];
    const abilities = member?.abilities || [];
    if (abilities.length === 0) return;

    // Metadata for labels and whether the ability needs a target.
    const meta = {
      focus:    { label: 'Focus',    desc: 'Self: boost next attacks',       targeted: false },
      counter:  { label: 'Counter',  desc: 'Self: counter-attack when hit',  targeted: false },
      inspire:  { label: 'Inspire',  desc: 'Party: buff all allies',         targeted: false },
      backstab: { label: 'Backstab', desc: 'Enemy: 3x damage strike',        targeted: true  },
      steal:    { label: 'Steal',    desc: 'Enemy: steal an item',           targeted: true  },
    };

    const ol = [];
    const h = 60 + abilities.length * 36;
    const bg = this.add.rectangle(400, 370, 360, h, 0x331144, 0.95)
      .setStrokeStyle(2, 0xaa44aa).setDepth(50).setInteractive();
    ol.push(bg);

    ol.push(this.add.text(400, 370 - h / 2 + 16, `${member.name}'s abilities:`, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51));

    this.pickerItems = [];
    for (let i = 0; i < abilities.length; i++) {
      const id = abilities[i];
      const m = meta[id] || { label: id, desc: '', targeted: true };
      const y = 370 - h / 2 + 46 + i * 36;
      const row = this.add.rectangle(400, y, 320, 30, 0x442255)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      const txt = this.add.text(400, y, `${i + 1}. ${m.label} - ${m.desc}`, {
        fontSize: '11px', color: '#ffaaff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      ol.push(row, txt);

      const selectAbility = () => {
        this.closePicker();
        this.pendingAbilityId = id;
        if (m.targeted) {
          this.pendingAction = 'ability';
          this.enterTargetingMode();
          this.promptText.setText(`${member.name}: ${m.label} -- select a target!`).setColor('#ff88ff');
        } else {
          // Self/party target: send action immediately with target_id=0.
          this.recordAction(slot, { slot, type: 'ability', target_id: 0, ability_id: id });
        }
      };

      this.pickerItems.push({ action: selectAbility });

      row.on('pointerover', () => { row.setFillStyle(0x663377); txt.setColor('#ffffff'); });
      row.on('pointerout',  () => { row.setFillStyle(0x442255); txt.setColor('#ffaaff'); });
      row.on('pointerdown', selectAbility);
    }

    const cancel = this.add.text(400, 370 + h / 2 - 15, '[ CANCEL / ESC ]', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => this.closePicker());
    ol.push(cancel);

    this.pickerOverlay = ol;
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

    this.pickerItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const y = 380 - h / 2 + 40 + i * 35;
      const row = this.add.rectangle(400, y, 280, 28, 0x224422)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      const txt = this.add.text(400, y, `${i + 1}. ${item.name}`, {
        fontSize: '11px', color: '#88ff88', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      ol.push(row, txt);

      const selectItem = () => {
        this.closePicker();
        this.showPartyTargetPicker(slot, item);
      };

      this.pickerItems.push({ action: selectItem });

      row.on('pointerover', () => { row.setFillStyle(0x336633); txt.setColor('#ffffff'); });
      row.on('pointerout', () => { row.setFillStyle(0x224422); txt.setColor('#88ff88'); });
      row.on('pointerdown', selectItem);
    }

    const cancel = this.add.text(400, 380 + h / 2 - 12, '[ CANCEL / ESC ]', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => this.closePicker());
    ol.push(cancel);

    this.pickerOverlay = ol;
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

    this.pickerItems = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const y = 350 - h / 2 + 45 + i * 40;
      const hpColor = t.hp <= 0 ? '#ff4444' : t.hp < t.max_hp * 0.5 ? '#ffaa44' : '#44ff44';
      const hpStr = t.hp <= 0 ? 'DEAD' : `${t.hp}/${t.max_hp} HP`;

      const row = this.add.rectangle(400, y, 300, 32, 0x224422)
        .setInteractive({ useHandCursor: true }).setDepth(51);
      const txt = this.add.text(400, y, `${i + 1}. ${t.name} (${t.class_name}) - ${hpStr}`, {
        fontSize: '11px', color: hpColor, fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(52);
      ol.push(row, txt);

      const selectTarget = () => {
        this.closePicker();
        this.recordAction(slot, {
          slot,
          type: item.id === 'phoenix_down' ? 'revive' : 'item',
          target_id: t.slot,
        });
      };

      this.pickerItems.push({ action: selectTarget });

      row.on('pointerover', () => row.setFillStyle(0x336633));
      row.on('pointerout', () => row.setFillStyle(0x224422));
      row.on('pointerdown', selectTarget);
    }

    const cancel = this.add.text(400, 350 + h / 2 - 12, '[ CANCEL / ESC ]', {
      fontSize: '10px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51).setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => this.closePicker());
    ol.push(cancel);

    this.pickerOverlay = ol;
  }

  closePicker() {
    if (this.pickerOverlay) {
      this.pickerOverlay.forEach(o => o.destroy());
      this.pickerOverlay = null;
    }
    this.pickerItems = [];
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

      // Animate each line of the combat log with structured action data
      const log = result.combat_log || [];
      const actions = result.combat_actions || [];
      await this.animateCombatLog(log, actions);

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

  async animateCombatLog(log, actions) {
    for (let i = 0; i < log.length; i++) {
      const line = log[i];
      const action = actions[i] || {};

      // Parse attack: "Hero attacks Goblin[102] for 24 damage"
      const attackMatch = line.match(/^(.+?) attacks (.+?)\[(\d+)\] for (\d+)/);
      // Parse spell: "Mage casts Spark on Goblin[102] for 11 damage"
      const spellMatch = line.match(/^(.+?) casts (.+?) on (.+?)\[?(\d*)\]? for (\d+)/);
      // Parse counter/backstab with damage
      const counterMatch = line.match(/^(.+?) (counter-attacks|backstabs) (.+?)(?:\[(\d+)\])? for (\d+)/);
      const defeatMatch = line.includes('DEFEATED');

      if (action.kind === 'attack' || (attackMatch && action.kind !== 'spell')) {
        const attacker = action.actor_name || (attackMatch && attackMatch[1]);
        const targetId = action.target_id || (attackMatch && parseInt(attackMatch[3]));
        const dmg = action.damage || (attackMatch && parseInt(attackMatch[4]));
        const dmgType = action.damage_type || 'physical';

        // Party member lunge toward target
        const pe = this.partySprites[attacker];
        const ee = this.enemySprites[targetId];
        if (pe && ee) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText.setText(`${attacker} attacks!`).setColor('#ff4444');
          // Lunge toward enemy position
          const dx = ee.x - pe.x, dy = ee.y - pe.y;
          const lungeX = pe.x + dx * 0.4, lungeY = pe.y + dy * 0.4;
          await this.tweenP(pe.sprite, { x: lungeX, y: lungeY, duration: 150, ease: 'Power2' });
          await this.tweenP(pe.sprite, { x: pe.x, y: pe.y, duration: 100, ease: 'Power1' });
        } else if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText.setText(`${attacker} attacks!`).setColor('#ff4444');
          await this.tweenP(pe.sprite, { x: pe.x - 30, duration: 150 });
          await this.tweenP(pe.sprite, { x: pe.x, duration: 100 });
        }

        // Hit effect on target
        playSFX('sfx_slash');
        const pt = this.partySprites[attackMatch?.[2]];
        if (ee) {
          playSFX(defeatMatch ? 'sfx_death' : 'sfx_hit');
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch, dmgType);
          if (ee.sprite.setTint) { ee.sprite.setTint(0xff4444); this.time.delayedCall(200, () => ee.sprite.clearTint?.()); }
          // Enemy death animation
          if (defeatMatch) await this.enemyDeathFx(ee);
        } else if (pt) {
          const atkName = attackMatch?.[1] || attacker;
          const tgtName = attackMatch?.[2] || '';
          this.promptText.setText(`${atkName} attacks ${tgtName}!`).setColor('#ff8800');
          playSFX('sfx_party_hit');
          await this.hitFx(pt.x, pt.y, dmg, true, false, dmgType);
          if (pt.sprite.setTint) { pt.sprite.setTint(0xff4444); this.time.delayedCall(200, () => pt.sprite.clearTint?.()); }
          this.cameras.main.shake(80, 0.005);
        }
        await this.wait(200);

      } else if (action.kind === 'counter' || counterMatch) {
        const actorName = action.actor_name || (counterMatch && counterMatch[1]);
        const targetId = action.target_id || (counterMatch && parseInt(counterMatch[4]));
        const dmg = action.damage || (counterMatch && parseInt(counterMatch[5]));
        const dmgType = action.damage_type || 'physical';
        this.promptText.setText(line).setColor('#ff8800');
        playSFX('sfx_slash');
        const ee = this.enemySprites[targetId];
        if (ee) {
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch, dmgType);
          if (defeatMatch) await this.enemyDeathFx(ee);
        }
        await this.wait(200);

      } else if (action.kind === 'spell' || spellMatch) {
        const caster = action.actor_name || (spellMatch && spellMatch[1]);
        const spellName = action.spell_name || (spellMatch && spellMatch[2]);
        const targetId = action.target_id || (spellMatch && parseInt(spellMatch[4]));
        const dmg = action.damage || (spellMatch && parseInt(spellMatch[5]));
        const element = action.element || 'none';
        const dmgType = action.damage_type || 'magical';

        const pe = this.partySprites[caster];
        if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText.setText(`${caster} casts ${spellName}!`).setColor('#8888ff');
        }

        // Element-specific SFX and flash
        const sfx = ELEMENT_SFX[element] || 'sfx_spell';
        playSFX(sfx);
        const flashColor = ELEMENT_FLASH[element] || 0x4444ff;
        const flash = this.add.rectangle(400, 300, 800, 600, flashColor, 0.2).setDepth(19);
        this.time.delayedCall(200, () => flash.destroy());

        // Check for multi-target: group consecutive entries with same caster + spell
        const targets = [{ targetId, dmg, defeated: defeatMatch }];
        while (i + 1 < log.length) {
          const nextAction = actions[i + 1] || {};
          if (nextAction.kind === 'spell' && nextAction.actor_name === caster && nextAction.spell_name === spellName) {
            i++;
            targets.push({
              targetId: nextAction.target_id,
              dmg: nextAction.damage,
              defeated: log[i].includes('DEFEATED'),
            });
          } else {
            break;
          }
        }

        // Animate each target with stagger
        const particleColor = ELEMENT_COLORS[element] || 0x8888ff;
        for (let t = 0; t < targets.length; t++) {
          const tgt = targets[t];
          const ee = this.enemySprites[tgt.targetId];
          if (ee) {
            for (let j = 0; j < 6; j++) {
              const px = ee.x + Phaser.Math.Between(-25, 25);
              const py = ee.y + Phaser.Math.Between(-25, 25);
              const p = this.add.circle(px, py, 4, particleColor).setDepth(20);
              this.tweens.add({ targets: p, y: py - 30, alpha: 0, duration: 400, onComplete: () => p.destroy() });
            }
            await this.hitFx(ee.x, ee.y, tgt.dmg, false, tgt.defeated, dmgType);
            if (tgt.defeated) await this.enemyDeathFx(ee);
          }
          if (t < targets.length - 1) await this.wait(200);
        }
        await this.wait(250);

      } else if (action.kind === 'heal' || line.includes('healed')) {
        this.promptText.setText(line).setColor('#44ff44');
        const healMatch = line.match(/healed (\d+)/);
        if (healMatch) {
          playSFX('sfx_heal');
          const nt = this.add.text(600, 220, `+${healMatch[1]}`, {
            fontSize: '16px', color: '#44ff44', fontFamily: 'monospace', fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(25);
          this.tweens.add({ targets: nt, y: nt.y - 30, alpha: 0, duration: 700, onComplete: () => nt.destroy() });
        }
        await this.wait(300);

      } else if (line.includes('Found:')) {
        this.promptText.setText(line).setColor('#44ff44');
        await this.wait(400);

      } else if (action.kind === 'ability') {
        this.promptText.setText(line).setColor('#ff88ff');
        // Backstab with damage gets hit effect
        if (action.damage > 0) {
          playSFX('sfx_slash');
          const ee = this.enemySprites[action.target_id];
          if (ee) {
            await this.hitFx(ee.x, ee.y, action.damage, false, defeatMatch, action.damage_type || 'physical');
            if (defeatMatch) await this.enemyDeathFx(ee);
          }
        }
        await this.wait(300);
      }
    }
  }

  hitFx(x, y, dmg, isParty, defeated, damageType) {
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

      // Damage type indicator
      if (damageType && !isParty) {
        const dtLabel = damageType === 'magical' ? 'MAG' : 'PHY';
        const dtColor = damageType === 'magical' ? '#bb88ff' : '#ffffff';
        const dt2 = this.add.text(x + Phaser.Math.Between(-10, 10), y - 26, dtLabel, {
          fontSize: '8px', color: dtColor, fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(25);
        this.tweens.add({ targets: dt2, y: dt2.y - 20, alpha: 0, duration: 600, onComplete: () => dt2.destroy() });
      }

      if (defeated) {
        const dt = this.add.text(x, y + 20, 'DEFEATED!', {
          fontSize: '11px', color: '#ff4444', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(25);
        this.tweens.add({ targets: dt, alpha: 0, duration: 1000, delay: 300, onComplete: () => dt.destroy() });
      }

      this.time.delayedCall(150, resolve);
    });
  }

  enemyDeathFx(ee) {
    return new Promise(resolve => {
      if (!ee || !ee.sprite) { resolve(); return; }
      this.tweens.add({
        targets: ee.sprite,
        alpha: 0, scaleY: 0.3, y: ee.y + 20,
        duration: 500, ease: 'Power2',
        onComplete: () => {
          ee.sprite.setVisible(false);
          resolve();
        },
      });
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
    stopMusic();
    playMusic(isDefeat ? 'music_defeat' : 'music_victory', false);

    this.add.text(400, 30, isDefeat ? 'DEFEAT' : 'VICTORY!', {
      fontSize: '32px', color: isDefeat ? '#ff4444' : '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (isDefeat) {
      this.add.text(400, 100, gs.message || 'Your party has fallen.', {
        fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5);

      // Defeat options
      const loadBtn = this.add.text(400, 300, '[ LOAD LAST SAVE ]', {
        fontSize: '18px', color: '#4488ff', fontFamily: 'monospace',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      loadBtn.on('pointerover', () => loadBtn.setColor('#88bbff'));
      loadBtn.on('pointerout', () => loadBtn.setColor('#4488ff'));
      loadBtn.on('pointerdown', () => this.scene.start('Title'));

      const titleBtn = this.add.text(400, 360, '[ TITLE SCREEN ]', {
        fontSize: '18px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      titleBtn.on('pointerover', () => titleBtn.setColor('#cccccc'));
      titleBtn.on('pointerout', () => titleBtn.setColor('#aaaaaa'));
      titleBtn.on('pointerdown', () => this.scene.start('Title'));

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
      const cs = CLASS_SPRITES[p.sprite_id || p.class_id];
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

      // Check for level up -- flash effect (capture y in closure)
      const leveledUp = log.some(l => l.includes(`${p.name} leveled up`));
      if (leveledUp) {
        const memberY = y; // capture current y for this member
        this.time.delayedCall(delay + 1300, () => {
          // Flash on THIS member's row
          const flash = this.add.rectangle(400, memberY + 20, 700, 50, 0xffff44, 0.3);
          this.tweens.add({ targets: flash, alpha: 0, duration: 600, onComplete: () => flash.destroy() });

          // Level up text next to this member
          const lvlUpText = this.add.text(650, memberY + 12, 'LEVEL UP!', {
            fontSize: '14px', color: '#ffff44', fontFamily: 'monospace', fontStyle: 'bold',
          }).setOrigin(0.5).setAlpha(0);
          this.tweens.add({ targets: lvlUpText, alpha: 1, duration: 300 });

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
