import Phaser from 'phaser';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 256,
  height: 240,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: {
    preload() {
      // Assets loaded here in future phases
    },
    create() {
      this.add.text(128, 100, 'KITHLANDS', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.add.text(128, 140, 'Your town. Your people. Your saga.', {
        fontSize: '8px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
    },
  },
};

new Phaser.Game(config);
