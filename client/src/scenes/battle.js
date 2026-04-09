import { gameAction } from '../api.js';

const ENEMY_COLORS = {
  'Slime': 0x42A5F5,
  'Goblin': 0x66BB6A,
  'Wolf': 0x8D6E63,
  'Skeleton': 0xEEEEEE,
  'Dark Knight': 0x512DA8,
};

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
    this.animating = false;
  }

  init(data) {
    this.gameState = data.gameState;
  }

  create() {
    // Battle background
    this.add.rectangle(400, 300, 800, 600, 0x1A1A2E);

    // Ground line
    this.add.rectangle(400, 420, 800, 4, 0x333366);

    // Draw enemies (left side)
    this.enemySprites = [];
    const enemies = this.gameState.enemies || [];
    const enemyStartX = 150;
    const enemySpacing = 120;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = enemyStartX + i * enemySpacing;
      const y = 300;
      const color = ENEMY_COLORS[e.name] || 0xFF5722;

      // Enemy body (larger rectangle for bosses)
      const size = e.name === 'Dark Knight' ? 60 : 40;
      const sprite = this.add.rectangle(x, y, size, size, color);
      sprite.setData('id', e.id);

      // Enemy name
      this.add.text(x, y - size/2 - 18, e.name, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);

      // HP bar
      const barW = 60;
      const barBg = this.add.rectangle(x, y + size/2 + 12, barW, 8, 0x333333);
      const pct = e.hp / e.max_hp;
      const barColor = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;
      const barFill = this.add.rectangle(x - barW/2 * (1-pct), y + size/2 + 12, barW * pct, 8, barColor);

      // HP text
      this.add.text(x, y + size/2 + 26, `${e.hp}/${e.max_hp}`, {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.enemySprites.push(sprite);
    }

    // Draw party (right side)
    const partyStartX = 550;
    const partySpacing = 70;

    for (let i = 0; i < this.gameState.party.length; i++) {
      const p = this.gameState.party[i];
      const x = partyStartX;
      const y = 200 + i * partySpacing;

      // Party member sprite
      const color = p.hp <= 0 ? 0x444444 : 0xFF5722;
      this.add.rectangle(x, y, 30, 30, color);

      // Name and class
      this.add.text(x + 30, y - 15, `${p.name}`, {
        fontSize: '12px', color: p.hp <= 0 ? '#666666' : '#ffffff', fontFamily: 'monospace',
      });
      this.add.text(x + 30, y, `${p.class_name} Lv${p.level}`, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
      });

      // HP bar
      const barW = 100;
      const hpPct = p.hp / p.max_hp;
      const barColor = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
      this.add.rectangle(x + 80 + barW/2, y - 10, barW, 8, 0x333333);
      if (hpPct > 0) {
        this.add.rectangle(x + 80 + barW * hpPct / 2, y - 10, barW * hpPct, 8, barColor);
      }
      this.add.text(x + 80 + barW + 5, y - 15, `${p.hp}/${p.max_hp}`, {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      });

      // Spells
      if (p.spells && p.spells.length > 0) {
        const spellStr = p.spells.map(s => `${s.name}(${s.charges})`).join(' ');
        this.add.text(x + 30, y + 15, spellStr, {
          fontSize: '9px', color: '#8888ff', fontFamily: 'monospace',
        });
      }
    }

    // Combat log (bottom)
    const logY = 460;
    this.add.rectangle(400, logY + 40, 780, 100, 0x000000, 0.8);
    const log = this.gameState.combat_log || [];
    for (let i = 0; i < Math.min(log.length, 5); i++) {
      const line = log[log.length - 1 - i];
      this.add.text(20, logY + 70 - i * 16, line, {
        fontSize: '11px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 760 },
      });
    }

    // Action buttons
    const btnY = 560;
    const gs = this.gameState;
    const hasSpells = gs.party.some(p => p.spells && p.spells.length > 0 && p.spells.some(s => s.charges > 0));

    const buttons = [];
    buttons.push({ label: 'ATTACK', type: 'attack', color: '#ff4444' });
    if (hasSpells) buttons.push({ label: 'SPELL', type: 'spell', color: '#8888ff' });
    if (gs.potions > 0) buttons.push({ label: `ITEM(${gs.potions})`, type: 'item', color: '#44ff44' });
    buttons.push({ label: 'FLEE', type: 'flee', color: '#ffcc44' });

    const totalWidth = buttons.length * 140;
    const startX = 400 - totalWidth / 2 + 70;

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const x = startX + i * 140;

      const bg = this.add.rectangle(x, btnY, 120, 32, 0x222244);
      bg.setInteractive({ useHandCursor: true });

      const text = this.add.text(x, btnY, b.label, {
        fontSize: '14px', color: b.color, fontFamily: 'monospace',
      }).setOrigin(0.5);

      bg.on('pointerover', () => { bg.setFillStyle(0x333366); });
      bg.on('pointerout', () => { bg.setFillStyle(0x222244); });
      bg.on('pointerdown', () => {
        if (this.animating) return;
        if (b.type === 'spell') {
          // Cast first available spell
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

    // Flash effect on attack
    if (action.type === 'attack') {
      this.cameras.main.shake(100, 0.005);
    }

    try {
      const result = await gameAction(this.gameState.id, action);
      if (result.error) {
        console.error(result.error);
        this.animating = false;
        return;
      }

      this.gameState = result;

      // Brief delay for dramatic effect
      this.time.delayedCall(300, () => {
        this.animating = false;
        if (this.gameState.phase !== 'combat') {
          this.scene.start('World', { gameState: this.gameState });
        } else {
          this.scene.restart({ gameState: this.gameState });
        }
      });
    } catch (e) {
      console.error('Action failed:', e);
      this.animating = false;
    }
  }
}
