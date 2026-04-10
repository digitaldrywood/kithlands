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

    if (!gs || gs.phase !== 'combat') {
      console.log('[Battle] not in combat phase, going to World. phase:', gs?.phase);
      this.scene.start('World', { gameState: gs });
      return;
    }

    if (!gs.enemies || gs.enemies.length === 0) {
      console.log('[Battle] no enemies, going to World');
      this.scene.start('World', { gameState: gs });
      return;
    }

    console.log('[Battle] rendering', gs.enemies.length, 'enemies');

    // Battle background
    this.add.rectangle(400, 300, 800, 600, 0x1A1A2E);
    this.add.rectangle(400, 420, 800, 4, 0x333366);

    // Enemies (left side)
    const enemies = gs.enemies;
    const enemyStartX = 150;
    const enemySpacing = Math.min(120, 400 / Math.max(enemies.length, 1));

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = enemyStartX + i * enemySpacing;
      const y = 300;
      const spriteKey = ENEMY_SPRITES[e.name];
      const size = e.name === 'Dark Knight' ? 60 : 40;

      if (spriteKey && this.textures.exists(spriteKey)) {
        const s = this.add.image(x, y, spriteKey);
        const targetScale = size / Math.max(s.width, s.height) * 2;
        s.setScale(targetScale);
      } else {
        const color = ENEMY_COLORS[e.name] || 0xFF5722;
        this.add.rectangle(x, y, size, size, color);
      }
      this.add.text(x, y - size / 2 - 18, e.name, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);

      // HP bar
      const barW = 60;
      this.add.rectangle(x, y + size / 2 + 12, barW, 8, 0x333333);
      const pct = Math.max(0, e.hp / e.max_hp);
      if (pct > 0) {
        const barColor = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x - barW / 2 * (1 - pct), y + size / 2 + 12, barW * pct, 8, barColor);
      }
      this.add.text(x, y + size / 2 + 26, `${e.hp}/${e.max_hp}`, {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    // Party (right side)
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const x = 550;
      const y = 200 + i * 70;
      const alive = p.hp > 0;

      const classSprite = CLASS_SPRITES[p.class_id];
      if (classSprite && this.textures.exists(classSprite) && alive) {
        const s = this.add.image(x, y, classSprite);
        const targetScale = 30 / Math.max(s.width, s.height) * 2;
        s.setScale(targetScale);
        if (!alive) s.setTint(0x444444);
      } else {
        this.add.rectangle(x, y, 30, 30, alive ? 0xFF5722 : 0x444444);
      }
      this.add.text(x + 30, y - 15, p.name, {
        fontSize: '12px', color: alive ? '#ffffff' : '#666666', fontFamily: 'monospace',
      });
      this.add.text(x + 30, y, `${p.class_name} Lv${p.level}`, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      });

      const barW = 100;
      const hpPct = Math.max(0, p.hp / p.max_hp);
      this.add.rectangle(x + 80 + barW / 2, y - 10, barW, 8, 0x333333);
      if (hpPct > 0) {
        const barColor = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(x + 80 + barW * hpPct / 2, y - 10, barW * hpPct, 8, barColor);
      }
      this.add.text(x + 80 + barW + 5, y - 15, `${p.hp}/${p.max_hp}`, {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      });

      if (p.spells && p.spells.length > 0) {
        const spellStr = p.spells.map(s => `${s.name}(${s.charges})`).join(' ');
        this.add.text(x + 30, y + 15, spellStr, {
          fontSize: '9px', color: '#8888ff', fontFamily: 'monospace',
        });
      }
    }

    // Combat log
    this.add.rectangle(400, 500, 780, 80, 0x000000, 0.8);
    const log = gs.combat_log || [];
    for (let i = 0; i < Math.min(log.length, 4); i++) {
      this.add.text(20, 520 - i * 16, log[log.length - 1 - i], {
        fontSize: '11px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 760 },
      });
    }

    // Action buttons
    const hasSpells = gs.party.some(p => p.spells?.length > 0 && p.spells.some(s => s.charges > 0));
    const buttons = [
      { label: 'ATTACK', type: 'attack', color: '#ff4444' },
    ];
    if (hasSpells) buttons.push({ label: 'SPELL', type: 'spell', color: '#8888ff' });
    if (gs.potions > 0) buttons.push({ label: `ITEM(${gs.potions})`, type: 'item', color: '#44ff44' });
    buttons.push({ label: 'FLEE', type: 'flee', color: '#ffcc44' });

    const totalW = buttons.length * 140;
    const startX = 400 - totalW / 2 + 70;

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const x = startX + i * 140;
      const bg = this.add.rectangle(x, 565, 120, 32, 0x222244).setInteractive({ useHandCursor: true });
      this.add.text(x, 565, b.label, {
        fontSize: '14px', color: b.color, fontFamily: 'monospace',
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setFillStyle(0x333366));
      bg.on('pointerout', () => bg.setFillStyle(0x222244));
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

  async doAction(action) {
    this.animating = true;
    console.log('[Battle] action:', action.type);

    if (action.type === 'attack') {
      this.cameras.main.shake(100, 0.005);
    }

    try {
      const result = await gameAction(this.gameState.id, action);
      console.log('[Battle] result phase:', result.phase, 'enemies:', result.enemies?.length, 'log:', result.combat_log);

      if (result.error) {
        console.error('[Battle] error:', result.error);
        this.animating = false;
        return;
      }

      this.gameState = result;

      this.time.delayedCall(400, () => {
        this.animating = false;
        if (this.gameState.phase !== 'combat') {
          console.log('[Battle] combat over, going to World. phase:', this.gameState.phase);
          this.scene.start('World', { gameState: this.gameState });
        } else {
          console.log('[Battle] continuing combat, restarting scene');
          this.scene.restart({ gameState: this.gameState });
        }
      });
    } catch (e) {
      console.error('[Battle] action failed:', e);
      this.animating = false;
    }
  }
}
