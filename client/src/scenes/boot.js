export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Loading bar
    const cx = 400, cy = 300;
    const bar = this.add.rectangle(cx, cy, 400, 20, 0x222222);
    const fill = this.add.rectangle(cx - 198, cy, 4, 16, 0x44ff44);

    this.load.on('progress', (value) => {
      fill.width = 396 * value;
      fill.x = cx - 198 + fill.width / 2;
    });

    this.add.text(cx, cy - 40, 'KITHLANDS', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add.text(cx, cy + 30, 'Loading...', {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Player directional sprites
    this.load.image('player_down', '/sprites/player_down.png');
    this.load.image('player_up', '/sprites/player_up.png');
    this.load.image('player_left', '/sprites/player_left.png');
    this.load.image('player_right', '/sprites/player_right.png');

    // Character sprites
    this.load.image('warrior', '/sprites/warrior.png');
    this.load.image('cinder', '/sprites/cinder.png');
    this.load.image('mender', '/sprites/mender.png');
    this.load.image('rogue', '/sprites/rogue.png');

    // Monster sprites
    this.load.image('monster_slime', '/sprites/monsters/slime.png');
    this.load.image('monster_goblin', '/sprites/monsters/goblin.png');
    this.load.image('monster_wolf', '/sprites/monsters/wolf.png');
    this.load.image('monster_skeleton', '/sprites/monsters/skeleton.png');
    this.load.image('monster_dark_knight', '/sprites/monsters/dark_knight.png');
  }

  create() {
    this.scene.start('Title');
  }
}
