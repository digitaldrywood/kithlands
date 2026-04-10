import Phaser from "phaser";
import { BootScene } from "./scenes/boot.js";
import { TitleScene } from "./scenes/title.js";
import { WizardScene } from "./scenes/wizard.js";
import { WorldScene } from "./scenes/world.js";
import { BattleScene } from "./scenes/battle.js";

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#111111",
  input: {
    activePointers: 2,
  },
  dom: {
    createContainer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, WizardScene, WorldScene, BattleScene],
};

new Phaser.Game(config);
