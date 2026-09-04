const BASE_URL = "/api";

let authToken = null;

export function setToken(token) {
  authToken = token;
}

function headers() {
  const h = { "Content-Type": "application/json" };
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

async function apiCall(method, path, body) {
  const url = `${BASE_URL}${path}`;
  console.log(`[API] ${method} ${path}`, body || "");

  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();

  if (data.error) {
    console.error(`[API] ${path} error:`, data.error);
  } else {
    console.log(`[API] ${path} ok`, data.phase || "");
  }

  return data;
}

export async function login(email) {
  return apiCall("POST", "/auth/login", { email });
}

export async function getClasses() {
  return apiCall("GET", "/data/classes");
}

export async function getMonsters() {
  return apiCall("GET", "/data/monsters");
}

export async function getItems() {
  return apiCall("GET", "/data/items");
}

// Dev-only feature-trigger API (registered only when KITHLANDS_DEBUG=1 on
// the server). The client debug panel uses these to reproduce specific
// game states deterministically; they should never be called from a
// production build.
export async function debugCreateShowcase() {
  return apiCall("POST", "/debug/showcase", {});
}

export async function debugForceEncounterStart(gameId, start) {
  return apiCall("POST", `/debug/game/${gameId}/force-encounter-start`, {
    start,
  });
}

export async function debugForceEncounter(gameId, monsterIds, level) {
  return apiCall("POST", `/debug/game/${gameId}/force-encounter`, {
    monster_ids: monsterIds,
    level,
  });
}

export async function debugForceVictory(gameId) {
  return apiCall("POST", `/debug/game/${gameId}/force-victory`, {});
}

export async function debugGiveItem(gameId, itemId, qty) {
  return apiCall("POST", `/debug/game/${gameId}/give-item`, {
    item_id: itemId,
    qty,
  });
}

export async function debugSetGold(gameId, gold) {
  return apiCall("POST", `/debug/game/${gameId}/set-gold`, {
    gold,
  });
}

export async function debugHealParty(gameId) {
  return apiCall("POST", `/debug/game/${gameId}/heal-party`, {});
}

export async function debugSetPartyVitals(gameId, updates) {
  return apiCall("POST", `/debug/game/${gameId}/set-party-vitals`, {
    updates,
  });
}

export async function debugSetPartyLevels(gameId, updates) {
  return apiCall("POST", `/debug/game/${gameId}/set-party-levels`, {
    updates,
  });
}

export async function debugWarpQuest(gameId, questIdx) {
  return apiCall("POST", `/debug/game/${gameId}/warp-quest`, {
    quest_idx: questIdx,
  });
}

export async function newGame(data) {
  return apiCall("POST", "/game/new", data);
}

export async function getGame(id) {
  return apiCall("GET", `/game/${id}`);
}

export async function gameAction(gameId, action) {
  return apiCall("POST", `/game/${gameId}/action`, action);
}

export async function dungeonAction(gameId, action) {
  return apiCall("POST", `/game/${gameId}/dungeon`, action);
}

export async function transitionLocation(
  gameId,
  transitionId,
  worldNodeId = "",
) {
  return apiCall("POST", `/game/${gameId}/transition`, {
    transition_id: transitionId,
    world_node_id: worldNodeId,
  });
}

export async function promoteParty(gameId, accept) {
  return apiCall("POST", `/game/${gameId}/promote`, { accept });
}

export async function healthCheck() {
  return apiCall("GET", "/health");
}

export async function getShop(gameId, nodeId) {
  return apiCall("GET", `/game/${gameId}/shop/${nodeId}`);
}

export async function buyItem(gameId, itemId, type) {
  return apiCall("POST", `/game/${gameId}/buy`, { item_id: itemId, type });
}

export async function equipItem(
  gameId,
  slot,
  itemId,
  type,
  equipmentSlot = "",
) {
  return apiCall("POST", `/game/${gameId}/equip`, {
    slot,
    item_id: itemId,
    type,
    equipment_slot: equipmentSlot,
  });
}

export async function unequipItem(gameId, slot, equipmentSlot) {
  return apiCall("POST", `/game/${gameId}/unequip`, {
    slot,
    equipment_slot: equipmentSlot,
  });
}

export async function previewEquipment(
  gameId,
  slot,
  equipmentSlot,
  itemId,
  type,
) {
  return apiCall("POST", `/game/${gameId}/equipment/preview`, {
    slot,
    equipment_slot: equipmentSlot,
    item_id: itemId,
    type,
  });
}

export async function recommendEquipment(gameId, slot, goal = "balanced") {
  return apiCall("POST", `/game/${gameId}/equipment/recommend`, { slot, goal });
}

export async function applyRecommendedEquipment(
  gameId,
  slot,
  goal = "balanced",
) {
  return apiCall("POST", `/game/${gameId}/equipment/recommend/apply`, {
    slot,
    goal,
  });
}

export async function socketGem(gameId, instanceId, socket, gemId) {
  return apiCall("POST", `/game/${gameId}/socket`, {
    instance_id: instanceId,
    socket,
    gem_id: gemId,
  });
}

export async function craftGem(gameId, recipeId) {
  return apiCall("POST", `/game/${gameId}/craft`, {
    recipe_id: recipeId,
  });
}

export async function updatePartyFormation(gameId, updates, reorder = null) {
  const body = { updates };
  if (Array.isArray(reorder) && reorder.length > 0) {
    body.reorder = reorder;
  }
  return apiCall("POST", `/game/${gameId}/formation`, body);
}

export async function learnSpell(gameId, charName, spellId) {
  return apiCall("POST", `/game/${gameId}/learn`, {
    char_name: charName,
    spell_id: spellId,
  });
}

export async function restAtTown(gameId, nodeId, tags) {
  return apiCall("POST", `/game/${gameId}/town/rest`, {
    node_id: nodeId,
    tags,
  });
}

export async function collectHiddenItem(gameId, nodeId, itemKey, tags) {
  return apiCall("POST", `/game/${gameId}/town/collect`, {
    node_id: nodeId,
    item_key: itemKey,
    tags,
  });
}

export async function openChest(gameId, nodeId, chestId) {
  return apiCall("POST", `/game/${gameId}/chest/open`, {
    node_id: nodeId,
    chest_id: chestId,
  });
}

export async function claimChest(gameId, nodeId, chestId) {
  return apiCall("POST", `/game/${gameId}/chest/claim`, {
    node_id: nodeId,
    chest_id: chestId,
  });
}

export async function geocode(query) {
  return apiCall("POST", "/geocode", { query });
}

export async function osmPreview(lat, lng, radiusMiles) {
  return apiCall("POST", "/osm/preview", {
    lat,
    lng,
    radius_miles: radiusMiles,
  });
}

export async function saveGame(gameId, name) {
  return apiCall("POST", `/game/${gameId}/save`, { name });
}

export async function listSaves() {
  return apiCall("GET", "/saves");
}

export async function loadSave(saveId) {
  return apiCall("POST", `/saves/${saveId}/load`);
}

export async function deleteSave(saveId) {
  return apiCall("DELETE", `/saves/${saveId}`);
}

export async function getNpcDialogue(gameId, nodeId) {
  return apiCall("GET", `/game/${gameId}/npc/${nodeId}/talk`);
}

export async function interactWithNpc(gameId, nodeId) {
  return apiCall("POST", `/game/${gameId}/npc/${nodeId}/talk`, {});
}

export async function autosaveGame(gameId, triggerEvent) {
  return apiCall("POST", `/game/${gameId}/autosave`, {
    trigger_event: triggerEvent,
  });
}
