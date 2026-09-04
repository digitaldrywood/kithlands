import {
  getBattleSpeed,
  setBattleSpeed,
  getLongCinematicMode,
  setLongCinematicMode,
  getMessageSpeed,
  setMessageSpeed,
  getWalkSpeed,
  setWalkSpeed,
} from "../systems/prefs.js";
const CINEMATIC_MODES = ["short", "once", "full"];

function getCinematicModeLevel() {
  return Math.max(1, CINEMATIC_MODES.indexOf(getLongCinematicMode()) + 1);
}

function setCinematicModeLevel(level) {
  setLongCinematicMode(CINEMATIC_MODES[level - 1] || "full");
}

export const OPTIONS_ROWS = [
  {
    key: "battle",
    label: "Battle speed",
    min: 1,
    max: 6,
    get: getBattleSpeed,
    set: setBattleSpeed,
  },
  {
    key: "message",
    label: "Message speed",
    min: 1,
    max: 6,
    get: getMessageSpeed,
    set: setMessageSpeed,
  },
  {
    key: "walk",
    label: "Walk speed",
    min: 1,
    max: 3,
    get: getWalkSpeed,
    set: setWalkSpeed,
  },
  {
    key: "cinematics",
    label: "Long cinematics",
    min: 1,
    max: 3,
    get: getCinematicModeLevel,
    set: setCinematicModeLevel,
    format: (value) => CINEMATIC_MODES[value - 1]?.toUpperCase() || "FULL",
  },
];

export function nudgeOption(row, delta) {
  const next = row.get() + delta;
  if (next < row.min || next > row.max) return;
  row.set(next);
}
