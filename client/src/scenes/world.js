import { gameAction } from '../api.js';

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
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
    const cx = 400;

    if (gs.phase === 'victory') {
      this.showVictory(gs);
      return;
    }
    if (gs.phase === 'defeat') {
      this.showDefeat(gs);
      return;
    }
    if (gs.phase === 'combat') {
      this.scene.start('Battle', { gameState: gs });
      return;
    }

    // Header
    this.add.text(cx, 20, gs.location || 'Kithlands', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Party status
    let y = 60;
    this.add.text(30, y, 'PARTY', { fontSize: '14px', color: '#ffff44', fontFamily: 'monospace' });
    y += 25;
    for (const pm of gs.party) {
      const hpColor = pm.hp < pm.max_hp * 0.3 ? '#ff4444' : '#44ff44';
      this.add.text(30, y, `${pm.name} (${pm.class_name}) Lv.${pm.level}`, {
        fontSize: '13px', color: '#ffffff', fontFamily: 'monospace',
      });
      this.add.text(350, y, `HP: ${pm.hp}/${pm.max_hp}`, {
        fontSize: '13px', color: hpColor, fontFamily: 'monospace',
      });
      this.add.text(500, y, `XP: ${pm.xp}/${pm.xp_next}`, {
        fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
      });
      y += 20;
    }

    // Gold and potions
    y += 10;
    this.add.text(30, y, `Gold: ${gs.gold}  Potions: ${gs.potions}`, {
      fontSize: '13px', color: '#ffcc44', fontFamily: 'monospace',
    });

    // Quest list
    y += 40;
    this.add.text(30, y, 'QUESTS', { fontSize: '14px', color: '#ffff44', fontFamily: 'monospace' });
    y += 25;
    for (let i = 0; i < gs.quests.length; i++) {
      const q = gs.quests[i];
      const marker = q.completed ? '[X]' : (i === gs.current_quest ? '>>>' : '[ ]');
      const color = q.completed ? '#666666' : (i === gs.current_quest ? '#44ff44' : '#aaaaaa');
      this.add.text(30, y, `${marker} ${q.name}`, {
        fontSize: '12px', color, fontFamily: 'monospace',
      });
      y += 18;
    }

    // Message
    if (gs.message) {
      y += 20;
      this.add.text(30, y, gs.message, {
        fontSize: '13px', color: '#44ccff', fontFamily: 'monospace',
        wordWrap: { width: 740 },
      });
    }

    // Combat log
    if (gs.combat_log && gs.combat_log.length > 0) {
      y += 40;
      this.add.text(30, y, 'LOG', { fontSize: '14px', color: '#ffff44', fontFamily: 'monospace' });
      y += 20;
      for (const line of gs.combat_log.slice(-8)) {
        this.add.text(30, y, line, {
          fontSize: '11px', color: '#cccccc', fontFamily: 'monospace',
          wordWrap: { width: 740 },
        });
        y += 16;
      }
    }

    // Action button
    const btnY = 550;
    const btnLabel = gs.phase === 'quest_complete' ? 'CONTINUE' : 'ADVANCE';
    const btn = this.add.text(cx, btnY, `[ ${btnLabel} ]`, {
      fontSize: '22px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#88ff88'));
    btn.on('pointerout', () => btn.setColor('#44ff44'));
    btn.on('pointerdown', () => this.doAction({ type: 'advance' }));
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

  showVictory(gs) {
    const cx = 400;
    this.add.text(cx, 100, 'VICTORY!', {
      fontSize: '48px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, 180, gs.message || `${gs.location} is saved!`, {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
      wordWrap: { width: 600 },
    }).setOrigin(0.5);

    let y = 250;
    this.add.text(cx, y, 'Final Party:', {
      fontSize: '16px', color: '#ffff44', fontFamily: 'monospace',
    }).setOrigin(0.5);
    y += 30;
    for (const pm of gs.party) {
      this.add.text(cx, y, `${pm.name} (${pm.class_name}) Lv.${pm.level}  HP:${pm.max_hp}  STR:${pm.str} AGI:${pm.agi} INT:${pm.int_stat}`, {
        fontSize: '13px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5);
      y += 22;
    }

    this.add.text(cx, y + 20, `Gold: ${gs.gold}`, {
      fontSize: '14px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  showDefeat(gs) {
    const cx = 400;
    this.add.text(cx, 200, 'DEFEAT', {
      fontSize: '48px', color: '#ff4444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, 280, gs.message || 'Your party has fallen.', {
      fontSize: '16px', color: '#cccccc', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }
}
