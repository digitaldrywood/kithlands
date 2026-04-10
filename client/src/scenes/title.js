import { login, setToken, newGame } from '../api.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const cx = 400;

    this.add.text(cx, 100, 'KITHLANDS', {
      fontSize: '48px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, 160, 'Your town. Your people. Your saga.', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Email input
    this.add.text(cx, 240, 'Enter your email to play:', {
      fontSize: '14px', color: '#cccccc', fontFamily: 'monospace',
    }).setOrigin(0.5);

    const inputEl = document.createElement('input');
    inputEl.type = 'email';
    inputEl.placeholder = 'player@example.com';
    inputEl.style.cssText = 'font-size:18px;padding:8px 16px;width:300px;text-align:center;background:#222;color:#fff;border:2px solid #555;outline:none;font-family:monospace;';
    this.emailInput = this.add.dom(cx, 280, inputEl);

    // Start with wizard
    const startBtn = this.add.text(cx, 360, '[ NEW GAME ]', {
      fontSize: '22px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    startBtn.on('pointerover', () => startBtn.setColor('#88ff88'));
    startBtn.on('pointerout', () => startBtn.setColor('#44ff44'));
    startBtn.on('pointerdown', () => this.startGame(inputEl, false));

    // Quick start -- skip wizard, use Cadott defaults
    const quickBtn = this.add.text(cx, 410, '[ QUICK START - Cadott Defaults ]', {
      fontSize: '16px', color: '#ffcc44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    quickBtn.on('pointerover', () => quickBtn.setColor('#ffee88'));
    quickBtn.on('pointerout', () => quickBtn.setColor('#ffcc44'));
    quickBtn.on('pointerdown', () => this.startGame(inputEl, true));

    // Skip email entirely for testing
    const testBtn = this.add.text(cx, 460, '[ PLAY NOW - skip login ]', {
      fontSize: '14px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    testBtn.on('pointerover', () => testBtn.setColor('#aaaaaa'));
    testBtn.on('pointerout', () => testBtn.setColor('#888888'));
    testBtn.on('pointerdown', () => {
      inputEl.value = `test_${Date.now()}@kithlands.dev`;
      this.startGame(inputEl, true);
    });

    this.input.keyboard.on('keydown-ENTER', () => this.startGame(inputEl, false));

    this.statusText = this.add.text(cx, 510, '', {
      fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
      wordWrap: { width: 600 },
    }).setOrigin(0.5);
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

      if (quick) {
        // Skip wizard, create game with Cadott defaults
        console.log('[Title] quick start with Cadott defaults');
        const gameResult = await newGame({
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
        });

        if (gameResult.error) {
          this.statusText.setText(gameResult.error).setColor('#ff4444');
          return;
        }

        console.log('[Title] game created, going to World');
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
