/**
 * User preferences stored in localStorage.
 * Remembers wizard choices for faster repeat plays.
 */

const STORAGE_KEY = "kithlands_prefs";

let prefs = null;

function load() {
  if (prefs) return prefs;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    prefs = saved ? JSON.parse(saved) : {};
  } catch (e) {
    prefs = {};
  }
  return prefs;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    /* ignore */
  }
}

export function getPref(key, fallback = "") {
  return load()[key] ?? fallback;
}

export function setPref(key, value) {
  load();
  prefs[key] = value;
  save();
}

export function getEmail() {
  return getPref("email", "");
}

export function setEmail(email) {
  setPref("email", email);
}

export function getLastWizard() {
  return getPref("last_wizard", null);
}

export function setLastWizard(data) {
  setPref("last_wizard", data);
}

export function getPartyHistory() {
  return getPref("party_history", []);
}

export function addPartyToHistory(party) {
  const history = getPartyHistory();
  // Add if not duplicate
  const key = partySignature(party);
  const existing = history.find((h) => partySignature(h) === key);
  if (!existing) {
    history.unshift(party);
    if (history.length > 5) history.pop(); // keep last 5
    setPref("party_history", history);
  }
}

export function getNPCHistory() {
  return getPref("npc_history", []);
}

export function addNPCsToHistory(npcs) {
  const history = getNPCHistory();
  const key = npcs.map((n) => n.name).join(",");
  const existing = history.find((h) => h.map((n) => n.name).join(",") === key);
  if (!existing) {
    history.unshift(npcs);
    if (history.length > 5) history.pop();
    setPref("npc_history", history);
  }
}

export function getAutosaveEnabled() {
  return getPref("autosave_enabled", true);
}

export function setAutosaveEnabled(enabled) {
  setPref("autosave_enabled", enabled);
}

export function getAutosaveInterval() {
  return getPref("autosave_interval", 300000); // default 5 minutes
}

export function setAutosaveInterval(ms) {
  setPref("autosave_interval", ms);
}

// Speed settings — FF-style battle/message/walk (issue #129).
// Default values map to the current hard-coded pacing so shipping this
// feature does not regress existing play: battle 3 = 1.0×, walk 2 = 100ms.
// Message 3 is a moderate typewriter (current behavior flashes log lines
// too fast to read, which is the whole reason this feature exists).

function clampInt(v, lo, hi, fallback) {
  const n = Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(lo, Math.min(hi, n));
}

export function getBattleSpeed() {
  return clampInt(getPref("battleSpeed", 3), 1, 6, 3);
}

export function setBattleSpeed(n) {
  setPref("battleSpeed", clampInt(n, 1, 6, 3));
}

export function getMessageSpeed() {
  return clampInt(getPref("messageSpeed", 3), 1, 6, 3);
}

export function setMessageSpeed(n) {
  setPref("messageSpeed", clampInt(n, 1, 6, 3));
}

export function getWalkSpeed() {
  return clampInt(getPref("walkSpeed", 2), 1, 3, 2);
}

export function setWalkSpeed(n) {
  setPref("walkSpeed", clampInt(n, 1, 3, 2));
}

// 1 = fastest, 6 = slowest. Setting 3 = 1.0× (current pacing).
const BATTLE_SPEED_MUL = [null, 0.33, 0.66, 1.0, 1.5, 2.25, 3.0];
export function battleSpeedMul() {
  return BATTLE_SPEED_MUL[getBattleSpeed()] ?? 1.0;
}

// ms per character for combat-log typewriter. 6 = 0ms = instant.
const MESSAGE_CHAR_MS = [null, 80, 50, 30, 15, 6, 0];
export function messageCharMs() {
  return MESSAGE_CHAR_MS[getMessageSpeed()] ?? 30;
}

// Walk tween duration per tile-step. 2 = 100ms (current).
const WALK_STEP_MS = [null, 200, 100, 50];
export function walkStepMs() {
  return WALK_STEP_MS[getWalkSpeed()] ?? 100;
}

export function clearPrefs() {
  prefs = {};
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    /* ignore */
  }
}
