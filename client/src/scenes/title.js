import { login, setToken } from '../api.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    const cx = 400;

    this.add.text(cx, 120, 'KITHLANDS', {
      fontSize: '48px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, 180, 'Your town. Your people. Your saga.', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Email input
    this.add.text(cx, 280, 'Enter your email to play:', {
      fontSize: '14px', color: '#cccccc', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Create a DOM element for email input
    const inputEl = document.createElement('input');
    inputEl.type = 'email';
    inputEl.placeholder = 'player@example.com';
    inputEl.style.cssText = 'font-size:18px;padding:8px 16px;width:300px;text-align:center;background:#222;color:#fff;border:2px solid #555;outline:none;font-family:monospace;';
    this.emailInput = this.add.dom(cx, 320, inputEl);

    // Start button
    const startBtn = this.add.text(cx, 400, '[ START ]', {
      fontSize: '24px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setColor('#88ff88'));
    startBtn.on('pointerout', () => startBtn.setColor('#44ff44'));
    startBtn.on('pointerdown', () => this.startGame(inputEl));

    this.input.keyboard.on('keydown-ENTER', () => this.startGame(inputEl));

    this.statusText = this.add.text(cx, 460, '', {
      fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  async startGame(inputEl) {
    const email = inputEl.value.trim();
    if (!email || !email.includes('@')) {
      this.statusText.setText('Please enter a valid email.');
      return;
    }

    this.statusText.setText('Connecting...').setColor('#aaaaaa');

    try {
      const result = await login(email);
      if (result.token) {
        setToken(result.token);
        this.scene.start('Wizard');
      } else {
        this.statusText.setText(result.error || 'Login failed.').setColor('#ff4444');
      }
    } catch (e) {
      this.statusText.setText('Server unreachable. Is `make run` running?').setColor('#ff4444');
    }
  }
}
