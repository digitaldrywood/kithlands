import Phaser from "phaser";
import { BootScene } from "./scenes/boot.js";
import { TitleScene } from "./scenes/title.js";
import { WizardScene } from "./scenes/wizard.js";
import { WorldScene } from "./scenes/world.js";
import { BattleScene } from "./scenes/battle.js";
import { TownScene } from "./scenes/town.js";
import { SettlementScene } from "./scenes/settlement.js";
import "./styles/equipment-screen.css";

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#000000",
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
  scene: [
    BootScene,
    TitleScene,
    WizardScene,
    WorldScene,
    SettlementScene,
    BattleScene,
    TownScene,
  ],
};

const game = new Phaser.Game(config);

if (import.meta.env?.DEV) {
  import("./dev_test_bridge.js").then(({ installDevTestBridge }) => {
    installDevTestBridge(game);
  });
}
