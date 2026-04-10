import { gameAction } from '../api.js';

const ENEMY_SPRITES = {
  'Slime': 'monster_slime',
  'Goblin': 'monster_goblin',
  'Wolf': 'monster_wolf',
  'Skeleton': 'monster_skeleton',
  'Dark Knight': 'monster_dark_knight',
};

const ENEMY_COLORS = {
  'Slime': 0x42A5F5,
  'Goblin': 0x66BB6A,
  'Wolf': 0x8D6E63,
  'Skeleton': 0xEEEEEE,
  'Dark Knight': 0x512DA8,
};

const CLASS_SPRITES = {
  'warrior': 'warrior',
  'cinder': 'cinder',
  'mender': 'mender',
  'rogue': 'rogue',
};

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.gameState = data.gameState;
    console.log('[Battle] init, phase:', this.gameState?.phase, 'enemies:', this.gameState?.enemies?.length);
  }

  create() {
    this.animating = false;
    const gs = this.gameState;

    // If not in combat, check for victory/defeat screens
    if (!gs || gs.phase !== 'combat') {
      if (gs?.phase === 'quest_complete' || gs?.phase === 'world') {
        // Show victory results then go to world
        this.showVictoryResults(gs);
        return;
      }
      console.log('[Battle] not in combat, going to World');
      this.scene.start('World', { gameState: gs });
      return;
    }

    if (!gs.enemies || gs.enemies.length === 0) {
      this.scene.start('World', { gameState: gs });
      return;
    }

    // Battle background - dark gradient
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);
    this.add.rectangle(400, 400, 800, 200, 0x111133);
    this.add.rectangle(400, 350, 800, 2, 0x222255);

    // Enemies (left side)
    const enemies = gs.enemies;
    const enemySpacing = Math.min(130, 450 / Math.max(enemies.length, 1));
    const enemyStartX = 80 + (450 - enemies.length * enemySpacing) / 2;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = enemyStartX + i * enemySpacing;
      const y = 250;
      const spriteKey = ENEMY_SPRITES[e.name];
      const baseSize = e.name === 'Dark Knight' ? 80 : 50;

      if (spriteKey && this.textures.exists(spriteKey)) {
        const s = this.add.image(x, y, spriteKey);
        const targetScale = baseSize / Math.max(s.width, s.height) * 2;
        s.setScale(targetScale);
      } else {
        const color = ENEMY_COLORS[e.name] || 0xFF5722;
        this.add.rectangle(x, y, baseSize, baseSize, color);
      }

      this.add.text(x, y - baseSize / 2 - 20, e.name, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);

      // HP bar
      const barW = 70;
      this.add.rectangle(x, y + baseSize / 2 + 12, barW, 8, 0x333333);
      const pct = Math.max(0, e.hp / e.max_hp);
      if (pct > 0) {
        const barColor = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x - barW / 2 * (1 - pct), y + baseSize / 2 + 12, barW * pct, 8, barColor);
      }
      this.add.text(x, y + baseSize / 2 + 26, `${e.hp}/${e.max_hp}`, {
        fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // Party (right side) with selection indicator
    const partyX = 560;
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const x = partyX;
      const y = 170 + i * 80;
      const alive = p.hp > 0;

      // Selection indicator - highlight active member
      const isActive = alive && i === this.getActivePartyIndex(gs);
      if (isActive) {
        this.add.rectangle(x - 5, y, 220, 70, 0x223366, 0.6).setOrigin(0, 0.5);
        this.add.triangle(x - 15, y, 0, -8, 0, 8, 10, 0, 0xffff44).setDepth(2);
      }

      // Sprite
      const classSprite = CLASS_SPRITES[p.class_id];
      if (classSprite && this.textures.exists(classSprite)) {
        const s = this.add.image(x + 15, y, classSprite);
        const targetScale = 50 / Math.max(s.width, s.height) * 2;
        s.setScale(targetScale);
        if (!alive) s.setTint(0x444444);
      } else {
        this.add.rectangle(x + 15, y, 35, 35, alive ? 0xFF5722 : 0x444444);
      }

      // Name and stats
      this.add.text(x + 45, y - 20, `${p.name}`, {
        fontSize: '12px', color: alive ? '#ffffff' : '#666666', fontFamily: 'monospace',
      });
      this.add.text(x + 45, y - 4, `${p.class_name} Lv${p.level}`, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      });

      // HP bar
      const barW = 90;
      const hpPct = Math.max(0, p.hp / p.max_hp);
      this.add.rectangle(x + 90 + barW / 2, y + 12, barW, 6, 0x333333);
      if (hpPct > 0) {
        const barColor = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x + 90 + barW * hpPct / 2, y + 12, barW * hpPct, 6, barColor);
      }
      this.add.text(x + 90 + barW + 5, y + 7, `${p.hp}/${p.max_hp}`, {
        fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
      });

      // Spells under name
      if (p.spells && p.spells.length > 0 && alive) {
        const spellStr = p.spells.map(s => `${s.name}(${s.charges})`).join(' ');
        this.add.text(x + 45, y + 20, spellStr, {
          fontSize: '8px', color: '#8888ff', fontFamily: 'monospace',
        });
      }
    }

    // Combat log
    this.add.rectangle(400, 490, 780, 70, 0x000000, 0.85);
    const log = gs.combat_log || [];
    for (let i = 0; i < Math.min(log.length, 3); i++) {
      this.add.text(20, 505 - i * 18, log[log.length - 1 - i], {
        fontSize: '11px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 760 },
      });
    }

    // Action buttons
    const hasSpells = gs.party.some(p => p.hp > 0 && p.spells?.length > 0 && p.spells.some(s => s.charges > 0));
    const buttons = [
      { label: 'ATTACK', type: 'attack', color: '#ff4444' },
    ];
    if (hasSpells) buttons.push({ label: 'SPELL', type: 'spell', color: '#8888ff' });
    if (gs.potions > 0) buttons.push({ label: `POTION (${gs.potions})`, type: 'item', color: '#44ff44' });
    buttons.push({ label: 'FLEE', type: 'flee', color: '#ffcc44' });

    const totalW = buttons.length * 150;
    const startX = 400 - totalW / 2 + 75;

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const x = startX + i * 150;

      const bg = this.add.rectangle(x, 560, 130, 34, 0x1a1a44)
        .setStrokeStyle(1, 0x444488)
        .setInteractive({ useHandCursor: true });

      this.add.text(x, 560, b.label, {
        fontSize: '13px', color: b.color, fontFamily: 'monospace',
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x2a2a66));
      bg.on('pointerout', () => bg.setFillStyle(0x1a1a44));
      bg.on('pointerdown', () => {
        if (this.animating) return;
        if (b.type === 'spell') {
          for (const p of gs.party) {
            if (p.spells) {
              for (const s of p.spells) {
                if (s.charges > 0) {
                  this.doAction({ type: 'spell', spell_id: s.id });
                  return;
                }
              }
            }
          }
        } else {
          this.doAction({ type: b.type });
        }
      });
    }
  }

  getActivePartyIndex(gs) {
    // First living party member is "active"
    for (let i = 0; i < gs.party.length; i++) {
      if (gs.party[i].hp > 0) return i;
    }
    return 0;
  }

  async doAction(action) {
    this.animating = true;
    console.log('[Battle] action:', action.type);

    if (action.type === 'attack') {
      this.cameras.main.shake(150, 0.008);
    }

    try {
      const result = await gameAction(this.gameState.id, action);
      console.log('[Battle] result phase:', result.phase, 'enemies:', result.enemies?.length);

      if (result.error) {
        console.error('[Battle] error:', result.error);
        this.animating = false;
        return;
      }

      this.gameState = result;

      this.time.delayedCall(400, () => {
        this.animating = false;
        if (this.gameState.phase !== 'combat') {
          // Show victory results before going to world
          this.showVictoryResults(this.gameState);
        } else {
          this.scene.restart({ gameState: this.gameState });
        }
      });
    } catch (e) {
      console.error('[Battle] action failed:', e);
      this.animating = false;
    }
  }

  showVictoryResults(gs) {
    this.children.removeAll(true);

    // Victory background
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);

    // Fanfare header
    const isDefeat = gs.phase === 'defeat';
    const title = isDefeat ? 'DEFEAT' : 'VICTORY!';
    const titleColor = isDefeat ? '#ff4444' : '#ffff44';

    this.add.text(400, 40, title, {
      fontSize: '36px', color: titleColor, fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (isDefeat) {
      this.add.text(400, 90, gs.message || 'Your party has fallen.', {
        fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.addContinueButton(gs);
      return;
    }

    // Show combat results
    const log = gs.combat_log || [];
    let y = 80;

    // XP and gold earned
    const xpLines = log.filter(l => l.includes('Victory') || l.includes('+'));
    for (const line of xpLines) {
      this.add.text(400, y, line, {
        fontSize: '13px', color: '#44ff44', fontFamily: 'monospace',
      }).setOrigin(0.5);
      y += 22;
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
          fontSize: '13px', color: '#ffcc44', fontFamily: 'monospace',
        }).setOrigin(0.5);
        y += 20;
      }
    }

    // Quest completion
    const questLines = log.filter(l => l.includes('Quest complete'));
    if (questLines.length > 0) {
      y += 15;
      for (const line of questLines) {
        this.add.text(400, y, line, {
          fontSize: '13px', color: '#44ccff', fontFamily: 'monospace',
        }).setOrigin(0.5);
        y += 20;
      }
    }

    // Party status
    y += 20;
    this.add.text(400, y, 'Party Status:', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    y += 25;

    for (const p of gs.party) {
      const hpColor = p.hp <= 0 ? '#666666' : p.hp < p.max_hp * 0.3 ? '#ff4444' : '#44ff44';
      this.add.text(250, y,
        `${p.name} (${p.class_name}) Lv.${p.level}  HP:${p.hp}/${p.max_hp}  XP:${p.xp}/${p.xp_next}`,
        { fontSize: '12px', color: hpColor, fontFamily: 'monospace' }
      );
      y += 20;
    }

    // Gold
    y += 10;
    this.add.text(400, y, `Gold: ${gs.gold}  |  Potions: ${gs.potions}`, {
      fontSize: '13px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.addContinueButton(gs);
  }

  addContinueButton(gs) {
    const btn = this.add.text(400, 550, '[ CONTINUE ]', {
      fontSize: '20px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#88ff88'));
    btn.on('pointerout', () => btn.setColor('#44ff44'));
    btn.on('pointerdown', () => {
      this.scene.start('World', { gameState: gs });
    });

    // Also continue on Enter/Space
    this.input.keyboard.on('keydown-ENTER', () => {
      this.scene.start('World', { gameState: gs });
    });
    this.input.keyboard.on('keydown-SPACE', () => {
      this.scene.start('World', { gameState: gs });
    });
  }
}
