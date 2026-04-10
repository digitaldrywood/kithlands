import { login, setToken, newGame, listSaves, loadSave } from '../api.js';
import { initAudio, playMusic, playSFX } from '../systems/audio.js';
import { getEmail, setEmail, getLastWizard, setLastWizard } from '../systems/prefs.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    this.showMainMenu();
  }

  showMainMenu() {
    initAudio(this);
    playMusic('music_title');
    this.children.removeAll(true);
    // Remove DOM elements
    this.children.list
      .filter(c => c.type === 'DOMElement')
      .forEach(c => c.destroy());

    const cx = 400;

    this.add.text(cx, 80, 'KITHLANDS', {
      fontSize: '48px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, 140, 'Your town. Your people. Your saga.', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Email input
    this.add.text(cx, 210, 'Enter your email to play:', {
      fontSize: '14px', color: '#cccccc', fontFamily: 'monospace',
    }).setOrigin(0.5);

    const inputEl = document.createElement('input');
    inputEl.type = 'email';
    inputEl.placeholder = 'player@example.com';
    inputEl.value = getEmail(); // pre-fill from last session
    inputEl.style.cssText = 'font-size:16px;padding:6px 14px;width:280px;text-align:center;background:#222;color:#fff;border:2px solid #555;outline:none;font-family:monospace;';
    this.add.dom(cx, 245, inputEl);

    // Buttons
    this.makeButton(cx, 310, '[ NEW GAME ]', '#44ff44', () => this.startGame(inputEl, false));
    const lastWiz = getLastWizard();
    const quickLabel = lastWiz ? `[ QUICK START - ${lastWiz.town_name} ]` : '[ QUICK START - Cadott ]';
    this.makeButton(cx, 350, quickLabel, '#ffcc44', () => this.startGame(inputEl, true));
    this.makeButton(cx, 390, '[ LOAD GAME ]', '#4488ff', () => this.doLogin(inputEl, () => this.showLoadScreen()));
    this.makeButton(cx, 440, '[ PLAY NOW - skip login ]', '#888888', () => {
      inputEl.value = `test_${Date.now()}@kithlands.dev`;
      this.startGame(inputEl, true);
    });

    this.statusText = this.add.text(cx, 500, '', {
      fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
      wordWrap: { width: 600 },
    }).setOrigin(0.5);
  }

  makeButton(x, y, label, color, callback) {
    const btn = this.add.text(x, y, label, {
      fontSize: '16px', color, fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setAlpha(0.7));
    btn.on('pointerout', () => btn.setAlpha(1));
    btn.on('pointerdown', callback);
    return btn;
  }

  async doLogin(inputEl, callback) {
    const email = inputEl.value.trim();
    if (!email || !email.includes('@')) {
      this.statusText.setText('Please enter a valid email.').setColor('#ff4444');
      return;
    }
    this.statusText.setText('Connecting...').setColor('#aaaaaa');
    try {
      const result = await login(email);
      if (!result.token) {
        this.statusText.setText(result.error || 'Login failed.').setColor('#ff4444');
        return;
      }
      setToken(result.token);
      callback();
    } catch (e) {
      this.statusText.setText('Server unreachable. Run: make play').setColor('#ff4444');
    }
  }

  async showLoadScreen() {
    this.children.removeAll(true);
    this.children.list.filter(c => c.type === 'DOMElement').forEach(c => c.destroy());

    const cx = 400;
    this.add.text(cx, 50, 'LOAD GAME', {
      fontSize: '28px', color: '#4488ff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, 90, 'Loading saves...', {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    try {
      const result = await listSaves();
      const saves = result.saves || [];

      this.children.removeAll(true);

      this.add.text(cx, 40, 'LOAD GAME', {
        fontSize: '28px', color: '#4488ff', fontFamily: 'monospace',
      }).setOrigin(0.5);

      if (saves.length === 0) {
        this.add.text(cx, 200, 'No saved games found.', {
          fontSize: '14px', color: '#666666', fontFamily: 'monospace',
        }).setOrigin(0.5);
        this.add.text(cx, 240, 'Start a new game first, then save at an inn or temple.', {
          fontSize: '11px', color: '#888888', fontFamily: 'monospace',
        }).setOrigin(0.5);
      } else {
        // Separate manual and autosaves so autosaves never displace manual saves
        const manualSaves = saves.filter(sv => sv.save_type !== 'autosave');
        const autoSaves = saves.filter(sv => sv.save_type === 'autosave');

        let y = 80;

        // Manual saves section
        if (manualSaves.length > 0) {
          this.add.text(150, y, 'Manual Saves', {
            fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
          });
          y += 20;
          for (const sv of manualSaves.slice(0, 5)) {
            y = this.renderSaveRow(cx, y, sv, false);
          }
        }

        // Autosaves section
        if (autoSaves.length > 0) {
          y += 5;
          this.add.text(150, y, 'Autosaves', {
            fontSize: '12px', color: '#44ccff', fontFamily: 'monospace',
          });
          y += 20;
          for (const sv of autoSaves.slice(0, 3)) {
            y = this.renderSaveRow(cx, y, sv, true);
          }
        }
      }

      this.makeButton(cx, 540, '[ BACK ]', '#aaaaaa', () => this.showMainMenu());

    } catch (e) {
      console.error('[Title] load saves error:', e);
      this.add.text(cx, 200, 'Failed to load saves.', {
        fontSize: '14px', color: '#ff4444', fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.makeButton(cx, 540, '[ BACK ]', '#aaaaaa', () => this.showMainMenu());
    }
  }

  renderSaveRow(cx, y, sv, isAutosave) {
    const partyStr = sv.party ? sv.party.join(', ') : '';
    const dateStr = new Date(sv.updated_at).toLocaleDateString();
    const timeStr = sv.play_time > 0 ? `${Math.floor(sv.play_time / 60)}min` : '';

    const rowColor = isAutosave ? 0x0a1a2a : 0x112233;
    const strokeColor = isAutosave ? 0x225577 : 0x334466;
    const row = this.add.rectangle(cx, y + 15, 600, 50, rowColor)
      .setStrokeStyle(1, strokeColor).setInteractive({ useHandCursor: true });

    const nameColor = isAutosave ? '#44ccff' : '#ffffff';
    this.add.text(150, y, sv.name, {
      fontSize: '14px', color: nameColor, fontFamily: 'monospace',
    });

    const detailStr = `${partyStr}  |  ${sv.difficulty}  |  ${dateStr} ${timeStr}`;
    this.add.text(150, y + 18, detailStr, {
      fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
    });

    row.on('pointerover', () => row.setFillStyle(isAutosave ? 0x1a2a3a : 0x223355));
    row.on('pointerout', () => row.setFillStyle(rowColor));
    row.on('pointerdown', () => this.loadGameSave(sv.id));

    return y + 55;
  }

  async loadGameSave(saveId) {
    try {
      const result = await loadSave(saveId);
      if (result.error) {
        console.error('[Title] load error:', result.error);
        return;
      }
      console.log('[Title] save loaded, going to World');
      this.scene.start('World', { gameState: result });
    } catch (e) {
      console.error('[Title] load failed:', e);
    }
  }

  async startGame(inputEl, quick) {
    const email = inputEl.value.trim();
    if (!email || !email.includes('@')) {
      this.statusText.setText('Please enter a valid email.').setColor('#ff4444');
      return;
    }

    this.statusText.setText(quick ? 'Quick starting...' : 'Connecting...').setColor('#aaaaaa');

    try {
      const result = await login(email);
      if (!result.token) {
        this.statusText.setText(result.error || 'Login failed.').setColor('#ff4444');
        return;
      }
      setToken(result.token);
      setEmail(email); // remember email

      if (quick) {
        // Use last wizard data if available, otherwise Cadott defaults
        const last = getLastWizard();
        const gameData = last || {
          town_name: 'Cadott, WI',
          people: [
            { name: 'Bob', relation: 'friendly' },
            { name: 'Mrs Henderson', relation: 'neutral' },
            { name: 'Mayor Grimes', relation: 'rival' },
          ],
          places: ['The School', 'Creswood Corners', 'Fire Hall'],
          big_building: 'Town Hall',
          party: [
            { name: 'Hero', class_id: 'warrior' },
            { name: 'Sparks', class_id: 'cinder' },
          ],
          difficulty: 'normal',
        };
        console.log('[Title] quick start with', gameData.town_name);
        const gameResult = await newGame(gameData);

        if (gameResult.error) {
          this.statusText.setText(gameResult.error).setColor('#ff4444');
          return;
        }

        this.scene.start('World', { gameState: gameResult });
      } else {
        this.scene.start('Wizard');
      }
    } catch (e) {
      console.error('[Title] error:', e);
      this.statusText.setText('Server unreachable. Run: make play').setColor('#ff4444');
    }
  }
}
