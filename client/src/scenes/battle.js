import { gameAction } from '../api.js';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.gameState = data.gameState;
  }

  create() {
    this.render();
  }

  render() {
    this.children.removeAll(true);
    const gs = this.gameState;

    // If combat ended, go back to world
    if (gs.phase !== 'combat') {
      this.scene.start('World', { gameState: gs });
      return;
    }

    // Battle header
    this.add.text(400, 15, 'BATTLE', {
      fontSize: '28px', color: '#ff4444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Enemies (top half)
    this.add.text(400, 55, 'ENEMIES', {
      fontSize: '14px', color: '#ff8888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    let y = 80;
    for (const enemy of gs.enemies || []) {
      const pct = enemy.hp / enemy.max_hp;
      const barWidth = 150;
      const barHeight = 12;
      const x = 400 - barWidth / 2;

      this.add.text(400, y, `${enemy.name}  HP: ${enemy.hp}/${enemy.max_hp}`, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);

      y += 22;

      // HP bar background
      this.add.rectangle(x + barWidth / 2, y, barWidth, barHeight, 0x333333).setOrigin(0.5);
      // HP bar fill
      const fillColor = pct > 0.5 ? 0xff4444 : pct > 0.25 ? 0xff8800 : 0xff0000;
      if (pct > 0) {
        this.add.rectangle(x + (barWidth * pct) / 2, y, barWidth * pct, barHeight, fillColor).setOrigin(0.5);
      }

      y += 22;
    }

    // Divider
    y = 200;
    this.add.line(0, 0, 50, y, 750, y, 0x444444).setOrigin(0);

    // Party (bottom half)
    y = 220;
    this.add.text(30, y, 'YOUR PARTY', {
      fontSize: '14px', color: '#44ff44', fontFamily: 'monospace',
    });
    y += 25;

    for (const pm of gs.party) {
      const hpColor = pm.hp <= 0 ? '#666666' : pm.hp < pm.max_hp * 0.3 ? '#ff4444' : '#44ff44';
      const statusStr = pm.status ? ` [${pm.status}]` : '';
      this.add.text(30, y, `${pm.name} (${pm.class_name}) Lv.${pm.level}`, {
        fontSize: '13px', color: pm.hp <= 0 ? '#666666' : '#ffffff', fontFamily: 'monospace',
      });
      this.add.text(350, y, `HP: ${pm.hp}/${pm.max_hp}${statusStr}`, {
        fontSize: '13px', color: hpColor, fontFamily: 'monospace',
      });

      // Show spells
      if (pm.spells && pm.spells.length > 0) {
        const spellStr = pm.spells.map(s => `${s.name}(${s.charges})`).join(' ');
        this.add.text(530, y, spellStr, {
          fontSize: '11px', color: '#8888ff', fontFamily: 'monospace',
        });
      }

      y += 20;
    }

    // Combat log
    y += 15;
    this.add.text(30, y, 'COMBAT LOG', {
      fontSize: '12px', color: '#ffff44', fontFamily: 'monospace',
    });
    y += 18;
    const log = gs.combat_log || [];
    for (const line of log.slice(-6)) {
      this.add.text(30, y, line, {
        fontSize: '11px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 740 },
      });
      y += 15;
    }

    // Action buttons
    const btnY = 530;
    const btnStyle = { fontSize: '18px', fontFamily: 'monospace' };
    const actions = [
      { label: 'ATTACK', type: 'attack', color: '#ff4444' },
      { label: 'SPELL', type: 'spell', color: '#8888ff' },
      { label: 'ITEM', type: 'item', color: '#44ff44' },
      { label: 'FLEE', type: 'flee', color: '#ffcc44' },
    ];

    // Check if any party member has spells
    const hasSpells = gs.party.some(p => p.spells && p.spells.length > 0 && p.spells.some(s => s.charges > 0));

    let btnX = 100;
    for (const act of actions) {
      if (act.type === 'spell' && !hasSpells) continue;
      if (act.type === 'item' && gs.potions <= 0) continue;

      const btn = this.add.text(btnX, btnY, `[ ${act.label} ]`, {
        ...btnStyle, color: act.color,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      const hoverColor = act.color.replace(/[0-9a-f]{2}/g, m => {
        const v = Math.min(255, parseInt(m, 16) + 0x33);
        return v.toString(16).padStart(2, '0');
      });

      btn.on('pointerover', () => btn.setColor(hoverColor));
      btn.on('pointerout', () => btn.setColor(act.color));
      btn.on('pointerdown', () => {
        if (act.type === 'spell') {
          this.showSpellMenu(gs);
        } else {
          this.doAction({ type: act.type });
        }
      });

      btnX += 180;
    }

    // Potions indicator
    this.add.text(700, btnY + 30, `Potions: ${gs.potions}`, {
      fontSize: '11px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  showSpellMenu(gs) {
    // Collect all castable spells
    const spells = [];
    for (const pm of gs.party) {
      if (pm.spells) {
        for (const s of pm.spells) {
          if (s.charges > 0) {
            spells.push(s);
          }
        }
      }
    }

    if (spells.length === 0) return;

    // Simple: cast first available damage spell
    const spell = spells[0];
    this.doAction({ type: 'spell', spell_id: spell.id });
  }

  async doAction(action) {
    try {
      const result = await gameAction(this.gameState.id, action);
      if (result.error) {
        console.error(result.error);
        return;
      }
      this.gameState = result;
      this.render();
    } catch (e) {
      console.error('Action failed:', e);
    }
  }
}
