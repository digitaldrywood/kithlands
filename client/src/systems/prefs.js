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
  const key = party.map((p) => `${p.name}:${p.class_id}`).join(",");
  const existing = history.find(
    (h) => h.map((p) => `${p.name}:${p.class_id}`).join(",") === key,
  );
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

export function clearPrefs() {
  prefs = {};
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    /* ignore */
  }
}
