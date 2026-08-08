import {
  applyRecommendedEquipment,
  equipItem,
  recommendEquipment,
  unequipItem,
} from "../api.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { showGemWorkshop } from "./gem_workshop.js";

const LOCK_NAME = "equipment_screen";
const CORE_STATS = ["str", "agi", "int", "vit", "lck"];
const STAT_ORDER = [
  "power",
  "absorb",
  "str",
  "agi",
  "int",
  "vit",
  "lck",
  "hit_pct",
  "crit_pct",
  "magic_defense",
  "evade_penalty",
];
const STAT_LABELS = {
  power: "Power",
  absorb: "Absorb",
  str: "Strength",
  agi: "Agility",
  int: "Intellect",
  vit: "Vitality",
  lck: "Luck",
  hit_pct: "Hit",
  crit_pct: "Crit",
  magic_defense: "Magic Defense",
  evade_penalty: "Evade",
};
const SLOT_GLYPHS = {
  main_hand: "W",
  off_hand: "O",
  head: "H",
  shoulders: "S",
  body: "B",
  hands: "G",
  waist: "▰",
  legs: "L",
  feet: "F",
  amulet: "A",
  ring_1: "R1",
  ring_2: "R2",
};

export function showEquipmentScreen(scene, partyIndex = 0, options = {}) {
  if (scene.equipmentScreenState) {
    closeEquipmentScreen(scene, { callOnClose: false });
  }
  const party = activePartySlots(scene?.gameState?.party);
  if (!party.includes(partyIndex)) partyIndex = party[0];
  if (partyIndex == null) return;

  const root = document.createElement("section");
  root.className = "kith-equipment-screen";
  if (window.innerWidth < 600 || window.innerHeight < 650) {
    root.classList.add("is-compact");
  }
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "equipment-screen-title");
  root.tabIndex = -1;

  pauseWorldFor(scene, LOCK_NAME);
  const host = document.querySelector("#game-ui") || document.body;
  host.append(root);
  const dom = { destroy: () => root.remove() };
  const state = {
    scene,
    root,
    dom,
    partyIndex,
    selectedSlotID: options.selectedSlotID || "",
    selectedCandidateKey: "",
    goal: options.goal || "balanced",
    recommendation: null,
    busy: false,
    status: "",
    statusTone: "",
    onClose: options.onClose,
    previousFocus: document.activeElement,
  };
  state.resizeHandler = () =>
    root.classList.toggle(
      "is-compact",
      window.innerWidth < 600 || window.innerHeight < 650,
    );
  window.addEventListener("resize", state.resizeHandler);
  scene.equipmentScreenState = state;

  root.addEventListener("keydown", (event) =>
    handleOverlayKeydown(state, event),
  );
  renderEquipmentScreen(state);
  requestAnimationFrame(() => focusSelectedSlot(state));
}

export function closeEquipmentScreen(scene, { callOnClose = true } = {}) {
  const state = scene?.equipmentScreenState;
  if (!state) return;
  scene.equipmentScreenState = null;
  window.removeEventListener("resize", state.resizeHandler);
  state.dom?.destroy();
  resumeWorldFor(scene, LOCK_NAME);
  if (state.previousFocus?.isConnected) state.previousFocus.focus();
  if (callOnClose) state.onClose?.();
}

export function buildEquipmentScreenModel(gameState, partyIndex) {
  const member = gameState?.party?.[partyIndex] || null;
  const equipment = gameState?.equipment?.[partyIndex] || {};
  const slots = Array.isArray(equipment.loadout) ? equipment.loadout : [];
  return {
    member,
    equipment,
    slots,
    gearTotals: normalizeStats(equipment.bonuses),
  };
}

export function buildEquipmentCandidates(gameState, partyIndex, slotID) {
  const model = buildEquipmentScreenModel(gameState, partyIndex);
  const slot = model.slots.find((entry) => entry.id === slotID);
  if (!slot || !model.member) return [];
  const currentKey = itemKey(slot.item);
  const seen = new Set();
  const candidates = [];

  const add = (item, source = null) => {
    if (!isEquipmentItem(item)) return;
    const key = itemKey(item);
    if (!key || key === currentKey || seen.has(key)) return;
    const category = itemCategory(item);
    if (!slot.accepts?.includes(category)) return;
    seen.add(key);
    const disabledReason = equipmentDisabledReason(item, model.member, slot);
    candidates.push({
      key,
      item,
      source,
      disabledReason,
      compatible: disabledReason === "",
    });
  };

  for (const item of gameState?.items || []) add(item);
  for (
    let memberIndex = 0;
    memberIndex < (gameState?.equipment || []).length;
    memberIndex += 1
  ) {
    for (const wornSlot of gameState.equipment?.[memberIndex]?.loadout || []) {
      if (!wornSlot.item?.instance_id) continue;
      add(wornSlot.item, {
        partyIndex: memberIndex,
        slotID: wornSlot.id,
        slotName: wornSlot.name,
        characterName:
          gameState.party?.[memberIndex]?.name || `Hero ${memberIndex + 1}`,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
    const scoreDelta = simpleItemScore(b.item) - simpleItemScore(a.item);
    if (scoreDelta !== 0) return scoreDelta;
    return String(a.item.name || "").localeCompare(String(b.item.name || ""));
  });
  return candidates;
}

export function buildEquipmentComparison(
  gameState,
  partyIndex,
  slotID,
  candidate,
) {
  const model = buildEquipmentScreenModel(gameState, partyIndex);
  const slot = model.slots.find((entry) => entry.id === slotID);
  const current = slot?.item || null;
  const before = normalizeStats(model.gearTotals);
  const after = {};
  const candidateKey = itemKey(candidate);

  for (const loadoutSlot of model.slots) {
    let item = loadoutSlot.item;
    if (loadoutSlot.id === slotID) item = candidate || null;
    else if (candidateKey && itemKey(item) === candidateKey) item = null;
    addStats(after, itemStats(item));
  }

  const deltas = statDeltas(before, after);
  return {
    current,
    candidate: candidate || null,
    before,
    after,
    deltas,
    character: characterImpact(model.member, before, after),
  };
}

export function itemStats(item) {
  const stats = normalizeStats(item?.stats);
  if (item?.power != null && stats.power == null)
    stats.power = Number(item.power) || 0;
  if (item?.absorb != null && stats.absorb == null)
    stats.absorb = Number(item.absorb) || 0;
  return stats;
}

function renderEquipmentScreen(state) {
  const { scene, root } = state;
  const model = buildEquipmentScreenModel(scene.gameState, state.partyIndex);
  if (!model.member) {
    closeEquipmentScreen(scene);
    return;
  }
  if (!model.slots.some((slot) => slot.id === state.selectedSlotID)) {
    state.selectedSlotID =
      model.slots.find((slot) => slot.item)?.id || model.slots[0]?.id || "";
  }
  const selectedSlot = model.slots.find(
    (slot) => slot.id === state.selectedSlotID,
  );
  const candidates = buildEquipmentCandidates(
    scene.gameState,
    state.partyIndex,
    state.selectedSlotID,
  );
  if (
    !candidates.some(
      (candidate) => candidate.key === state.selectedCandidateKey,
    )
  ) {
    state.selectedCandidateKey = "";
  }
  const selectedCandidate = candidates.find(
    (candidate) => candidate.key === state.selectedCandidateKey,
  );
  const comparison = buildEquipmentComparison(
    scene.gameState,
    state.partyIndex,
    state.selectedSlotID,
    selectedCandidate?.item,
  );

  root.replaceChildren();
  root.append(
    renderHeader(state, model),
    renderMain(state, model, selectedSlot, candidates, selectedCandidate),
    renderComparison(state, model, selectedSlot, selectedCandidate, comparison),
    renderStatus(state),
  );
  if (state.recommendation) root.append(renderRecommendation(state));
}

function renderHeader(state, model) {
  const header = element("header", "equipment-header");
  const party = activePartySlots(state.scene.gameState?.party);
  const position = Math.max(0, party.indexOf(state.partyIndex));
  const previous = button(
    "‹",
    "equipment-nav",
    () => cycleParty(state, -1),
    "Previous character",
  );
  const next = button(
    "›",
    "equipment-nav",
    () => cycleParty(state, 1),
    "Next character",
  );
  const identity = element("div", "equipment-identity");
  const title = element("h1", "", "Equipment");
  title.id = "equipment-screen-title";
  identity.append(
    title,
    element("p", "equipment-character", model.member.name),
    element(
      "p",
      "equipment-character-meta",
      `${model.member.class_name} · Level ${model.member.level} · ${position + 1}/${party.length}`,
    ),
  );

  const goal = document.createElement("select");
  goal.className = "equipment-goal";
  goal.setAttribute("aria-label", "Recommendation goal");
  for (const [value, label] of [
    ["balanced", "Balanced"],
    ["offense", "Offense"],
    ["defense", "Defense"],
    ["magic", "Magic"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = state.goal === value;
    goal.append(option);
  }
  goal.addEventListener("change", () => {
    state.goal = goal.value;
    state.recommendation = null;
  });
  const recommend = button("Recommend Gear", "equipment-action secondary", () =>
    loadRecommendation(state),
  );
  recommend.disabled = state.busy;
  const close = button(
    "Close",
    "equipment-close",
    () => closeEquipmentScreen(state.scene),
    "Close equipment",
  );
  header.append(previous, identity, next, goal, recommend, close);
  return header;
}

function renderMain(state, model, selectedSlot, candidates, selectedCandidate) {
  const main = element("div", "equipment-main");
  const loadout = element("section", "loadout-panel");
  loadout.setAttribute("aria-labelledby", "loadout-title");
  const loadoutTitle = element("h2", "section-title", "Loadout");
  loadoutTitle.id = "loadout-title";
  loadout.append(loadoutTitle);

  const stage = element("div", "paperdoll-stage");
  const left = element("div", "slot-column slot-column-left");
  const right = element("div", "slot-column slot-column-right");
  const leftIDs = new Set([
    "head",
    "shoulders",
    "body",
    "hands",
    "waist",
    "legs",
    "feet",
  ]);
  for (const slot of model.slots) {
    const control = renderSlot(state, slot);
    (leftIDs.has(slot.id) ? left : right).append(control);
  }
  const silhouette = element("div", "paperdoll-silhouette");
  silhouette.setAttribute("aria-hidden", "true");
  silhouette.append(
    element("span", "paperdoll-head"),
    element("span", "paperdoll-body"),
    element("span", "paperdoll-arms"),
    element("span", "paperdoll-legs"),
    element(
      "strong",
      "paperdoll-class",
      String(model.member.class_name || "?").slice(0, 1),
    ),
  );
  stage.append(left, silhouette, right);
  loadout.append(stage);

  const inventory = element("section", "equipment-inventory");
  inventory.setAttribute("aria-labelledby", "inventory-title");
  const inventoryHeading = element("div", "inventory-heading");
  const inventoryTitle = element("h2", "section-title", "Owned Gear");
  inventoryTitle.id = "inventory-title";
  inventoryHeading.append(
    inventoryTitle,
    element(
      "span",
      "inventory-filter",
      selectedSlot ? `Fits ${selectedSlot.name}` : "Choose a slot",
    ),
  );
  inventory.append(inventoryHeading);
  const list = element("div", "equipment-item-list");
  if (candidates.length === 0) {
    list.append(
      element(
        "p",
        "equipment-empty",
        selectedSlot
          ? `No owned items fit ${selectedSlot.name}.`
          : "Choose a slot to inspect your gear.",
      ),
    );
  }
  for (const candidate of candidates) {
    list.append(
      renderCandidate(
        state,
        selectedSlot,
        candidate,
        selectedCandidate?.key === candidate.key,
      ),
    );
  }
  inventory.append(list);
  main.append(loadout, inventory);
  return main;
}

function renderSlot(state, slot) {
  const item = slot.item;
  const control = button("", "equipment-slot", () => {
    state.selectedSlotID = slot.id;
    state.selectedCandidateKey = "";
    state.recommendation = null;
    renderEquipmentScreen(state);
  });
  control.dataset.slotId = slot.id;
  control.dataset.testid = `equipment-slot-${slot.id}`;
  control.classList.toggle("is-selected", state.selectedSlotID === slot.id);
  control.classList.toggle("is-empty", !item);
  control.setAttribute(
    "aria-pressed",
    state.selectedSlotID === slot.id ? "true" : "false",
  );
  control.setAttribute("aria-label", `${slot.name}: ${item?.name || "Empty"}`);
  const icon = element(
    "span",
    "equipment-placeholder-icon",
    SLOT_GLYPHS[slot.id] || slot.name?.slice(0, 1) || "?",
  );
  const copy = element("span", "equipment-slot-copy");
  copy.append(
    element("span", "equipment-slot-label", slot.name),
    element("span", "equipment-slot-item", item?.name || "Empty slot"),
  );
  const sockets = element("span", "equipment-sockets", socketPips(item));
  sockets.setAttribute("aria-label", socketLabel(item));
  control.append(icon, copy, sockets);
  control.addEventListener("pointerenter", () => {
    if (state.selectedSlotID === slot.id) return;
    if (state.root.matches(":focus-within")) return;
    state.selectedSlotID = slot.id;
    state.selectedCandidateKey = "";
    renderEquipmentScreen(state);
  });
  return control;
}

function renderCandidate(state, slot, candidate, selected) {
  const item = candidate.item;
  const row = button("", "equipment-item-row", () => {
    state.selectedCandidateKey = candidate.key;
    state.recommendation = null;
    renderEquipmentScreen(state);
  });
  row.dataset.itemKey = candidate.key;
  row.dataset.testid = `equipment-item-${candidate.key}`;
  row.classList.toggle("is-selected", selected);
  row.classList.toggle("is-disabled", !candidate.compatible);
  row.setAttribute("aria-pressed", selected ? "true" : "false");
  const icon = element(
    "span",
    "equipment-placeholder-icon small",
    categoryGlyph(itemCategory(item)),
  );
  const copy = element("span", "equipment-item-copy");
  const name = element(
    "span",
    `equipment-item-name rarity-${rarityClass(item.rarity)}`,
    item.name || "Unknown equipment",
  );
  const meta = element(
    "span",
    "equipment-item-meta",
    `${String(item.rarity || "Common")} · Lv.${Number(item.item_level) || 1} · ${formatTopStats(item)}`,
  );
  copy.append(name, meta);
  if (candidate.source) {
    copy.append(
      element(
        "span",
        "equipment-worn-by",
        `Equipped by ${candidate.source.characterName} · ${candidate.source.slotName}`,
      ),
    );
  }
  if (candidate.disabledReason)
    copy.append(
      element("span", "equipment-lock-reason", candidate.disabledReason),
    );
  row.append(icon, copy, element("span", "equipment-row-arrow", "›"));
  row.addEventListener("pointerenter", () => {
    if (state.selectedCandidateKey === candidate.key) return;
    state.selectedCandidateKey = candidate.key;
    renderEquipmentScreen(state);
  });
  return row;
}

function renderComparison(state, model, slot, selectedCandidate, comparison) {
  const region = element("section", "equipment-comparison");
  region.setAttribute("aria-live", "polite");
  const current = renderItemDetails("Current", comparison.current);
  const proposed = renderItemDetails(
    "Candidate",
    selectedCandidate?.item || null,
  );
  const impact = element("div", "comparison-impact");
  impact.append(element("h2", "section-title", "Character Impact"));

  if (!selectedCandidate) {
    impact.append(
      element(
        "p",
        "comparison-prompt",
        slot
          ? `Choose owned gear to compare with ${slot.name}.`
          : "Choose an equipment slot.",
      ),
    );
  } else {
    const deltas = significantStatEntries(comparison.deltas);
    const deltaList = element("div", "comparison-deltas");
    if (deltas.length === 0)
      deltaList.append(element("span", "delta neutral", "No stat change"));
    for (const [stat, value] of deltas) {
      deltaList.append(
        element(
          "span",
          `delta ${deltaTone(stat, value)}`,
          `${statLabel(stat)} ${formatSigned(value)}`,
        ),
      );
    }
    impact.append(deltaList);
    for (const line of comparison.character) {
      impact.append(element("p", "character-impact-line", line));
    }
    if (selectedCandidate.source) {
      impact.append(
        element(
          "p",
          "equipment-move-warning",
          `Moves this item from ${selectedCandidate.source.characterName}'s ${selectedCandidate.source.slotName}.`,
        ),
      );
    }
  }

  const actions = element("div", "comparison-actions");
  const currentItem = slot?.item;
  const openSocket =
    currentItem?.instance_id &&
    currentItem?.sockets?.some((socket) => !socket.gem_id);
  if (openSocket) {
    actions.append(
      button("Socket", "equipment-action secondary", () =>
        openSocketWorkshop(state, slot, currentItem),
      ),
    );
  }
  if (currentItem) {
    const remove = button("Unequip", "equipment-action subtle", () =>
      performUnequip(state, slot),
    );
    remove.disabled = state.busy;
    actions.append(remove);
  }
  if (selectedCandidate) {
    const equip = button(
      `Equip in ${slot?.name || "slot"}`,
      "equipment-action primary",
      () => performEquip(state, slot, selectedCandidate),
    );
    equip.disabled = state.busy || !selectedCandidate.compatible;
    actions.append(equip);
  }
  impact.append(actions);
  region.append(current, proposed, impact);
  return region;
}

function renderItemDetails(label, item) {
  const panel = element("div", "item-details");
  panel.append(element("h2", "section-title", label));
  if (!item) {
    panel.append(
      element(
        "p",
        "comparison-prompt",
        label === "Current" ? "Empty slot" : "No candidate selected",
      ),
    );
    return panel;
  }
  panel.append(
    element(
      "h3",
      `item-detail-name rarity-${rarityClass(item.rarity)}`,
      item.name,
    ),
    element(
      "p",
      "item-detail-meta",
      `${item.rarity || "Common"} · Item Lv.${Number(item.item_level) || 1} · Requires Lv.${Number(item.required_level) || 1}`,
    ),
  );
  const stats = itemStats(item);
  const list = element("div", "item-stat-list");
  for (const [stat, total] of significantStatEntries(stats)) {
    const additions = [
      ...(item.affixes || []).filter((entry) => entry.stat === stat),
      ...(item.sockets || []).filter(
        (entry) => entry.gem_id && entry.stat === stat,
      ),
    ];
    const added = additions.reduce(
      (sum, entry) => sum + (Number(entry.value) || 0),
      0,
    );
    const row = element("p", "item-stat-row");
    row.append(
      element("span", "item-stat-name", statLabel(stat)),
      element("strong", "item-stat-value", String(total)),
    );
    if (additions.length > 0) {
      row.title = `Base ${total - added}; ${additions
        .map(
          (entry) =>
            `${entry.name || entry.gem_name || "Bonus"} ${formatSigned(Number(entry.value) || 0)}`,
        )
        .join("; ")}`;
      row.append(
        element(
          "span",
          "item-stat-breakdown",
          `Base ${total - added} + bonuses ${added}`,
        ),
      );
    }
    list.append(row);
  }
  panel.append(list, element("p", "socket-line", socketLabel(item)));
  return panel;
}

function renderStatus(state) {
  const status = element(
    "div",
    `equipment-status ${state.statusTone || ""}`,
    state.status || "Select a slot, compare, then confirm.",
  );
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  return status;
}

function renderRecommendation(state) {
  const recommendation = state.recommendation;
  const overlay = element("div", "recommendation-backdrop");
  const panel = element("section", "recommendation-dialog");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "recommendation-title");
  const title = element(
    "h2",
    "",
    `${titleCase(recommendation.goal)} Recommendation`,
  );
  title.id = "recommendation-title";
  panel.append(
    title,
    element(
      "p",
      "recommendation-intro",
      recommendation.changes?.length
        ? `Review ${recommendation.changes.length} proposed change${recommendation.changes.length === 1 ? "" : "s"}. Nothing has been equipped yet.`
        : "Your current loadout is already the best owned match for this goal.",
    ),
  );
  const changes = element("div", "recommendation-changes");
  for (const change of recommendation.changes || []) {
    const row = element("div", "recommendation-change");
    row.append(
      element("strong", "", change.slot_name),
      element(
        "span",
        "",
        `${change.from?.name || "Empty"} → ${change.to?.name || "Empty"}`,
      ),
    );
    changes.append(row);
  }
  panel.append(changes);
  const deltas = element("div", "recommendation-deltas");
  for (const [stat, value] of significantStatEntries(recommendation.deltas)) {
    deltas.append(
      element(
        "span",
        `delta ${deltaTone(stat, value)}`,
        `${statLabel(stat)} ${formatSigned(value)}`,
      ),
    );
  }
  panel.append(deltas);
  const actions = element("div", "recommendation-actions");
  actions.append(
    button("Keep Current", "equipment-action secondary", () => {
      state.recommendation = null;
      renderEquipmentScreen(state);
    }),
  );
  if (recommendation.changes?.length) {
    const apply = button(
      "Apply Recommended Gear",
      "equipment-action primary",
      () => applyRecommendation(state),
    );
    apply.disabled = state.busy;
    actions.append(apply);
  }
  panel.append(actions);
  overlay.append(panel);
  return overlay;
}

async function performEquip(state, slot, candidate) {
  if (!slot || !candidate?.compatible || state.busy) return;
  state.busy = true;
  setStatus(state, `Equipping ${candidate.item.name}…`);
  renderEquipmentScreen(state);
  const item = candidate.item;
  const id = item.instance_id || staticBaseID(item.id);
  const result = await equipItem(
    state.scene.gameState.id,
    state.partyIndex,
    id,
    item.kind || inferredKind(item),
    slot.id,
  );
  state.busy = false;
  if (result.error) {
    setStatus(state, result.error, "error");
  } else {
    state.scene.gameState = result;
    state.scene.updateHUD?.();
    state.selectedCandidateKey = "";
    setStatus(state, `${item.name} equipped in ${slot.name}.`, "success");
  }
  renderEquipmentScreen(state);
  focusSelectedSlot(state);
}

async function performUnequip(state, slot) {
  if (!slot?.item || state.busy) return;
  state.busy = true;
  setStatus(state, `Unequipping ${slot.item.name}…`);
  renderEquipmentScreen(state);
  const result = await unequipItem(
    state.scene.gameState.id,
    state.partyIndex,
    slot.id,
  );
  state.busy = false;
  if (result.error) {
    setStatus(state, result.error, "error");
  } else {
    state.scene.gameState = result;
    state.scene.updateHUD?.();
    state.selectedCandidateKey = "";
    setStatus(state, `${slot.item.name} returned to owned gear.`, "success");
  }
  renderEquipmentScreen(state);
  focusSelectedSlot(state);
}

async function loadRecommendation(state) {
  if (state.busy) return;
  state.busy = true;
  setStatus(state, `Building a ${state.goal} loadout…`);
  renderEquipmentScreen(state);
  const result = await recommendEquipment(
    state.scene.gameState.id,
    state.partyIndex,
    state.goal,
  );
  state.busy = false;
  if (result.error) {
    setStatus(state, result.error, "error");
  } else {
    state.recommendation = result;
    setStatus(state, "Recommendation ready for review.", "success");
  }
  renderEquipmentScreen(state);
  requestAnimationFrame(() =>
    state.root.querySelector(".recommendation-dialog button")?.focus(),
  );
}

async function applyRecommendation(state) {
  if (state.busy) return;
  state.busy = true;
  setStatus(state, "Applying the reviewed loadout…");
  renderEquipmentScreen(state);
  const result = await applyRecommendedEquipment(
    state.scene.gameState.id,
    state.partyIndex,
    state.goal,
  );
  state.busy = false;
  state.recommendation = null;
  if (result.error) {
    setStatus(state, result.error, "error");
  } else {
    state.scene.gameState = result;
    state.scene.updateHUD?.();
    state.selectedCandidateKey = "";
    setStatus(state, "Recommended gear equipped.", "success");
  }
  renderEquipmentScreen(state);
  focusSelectedSlot(state);
}

function openSocketWorkshop(state, slot, item) {
  const { scene } = state;
  const returnOptions = {
    selectedSlotID: slot.id,
    goal: state.goal,
    onClose: state.onClose,
  };
  closeEquipmentScreen(scene, { callOnClose: false });
  showGemWorkshop(scene, {
    preselectedInstanceID: item.instance_id,
    onClose: () => showEquipmentScreen(scene, state.partyIndex, returnOptions),
  });
}

function cycleParty(state, delta) {
  const slots = activePartySlots(state.scene.gameState?.party);
  const position = Math.max(0, slots.indexOf(state.partyIndex));
  state.partyIndex = slots[(position + delta + slots.length) % slots.length];
  state.selectedCandidateKey = "";
  state.recommendation = null;
  const nextModel = buildEquipmentScreenModel(
    state.scene.gameState,
    state.partyIndex,
  );
  if (!nextModel.slots.some((slot) => slot.id === state.selectedSlotID)) {
    state.selectedSlotID = "";
  }
  renderEquipmentScreen(state);
  focusSelectedSlot(state);
}

function handleOverlayKeydown(state, event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (state.recommendation) {
      state.recommendation = null;
      renderEquipmentScreen(state);
      focusSelectedSlot(state);
    } else {
      closeEquipmentScreen(state.scene);
    }
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [
    ...state.root.querySelectorAll(
      "button:not(:disabled), select:not(:disabled), [tabindex='0']",
    ),
  ];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusSelectedSlot(state) {
  state.root.querySelector(`[data-slot-id="${state.selectedSlotID}"]`)?.focus();
}

function equipmentDisabledReason(item, member, slot) {
  if (!slot?.accepts?.includes(itemCategory(item)))
    return `Does not fit ${slot?.name || "this slot"}`;
  const required = Number(item.required_level) || 1;
  if ((Number(member.level) || 1) < required)
    return `Requires level ${required}`;
  const allowed = item.allowed_classes || [];
  if (allowed.length > 0 && !allowed.includes(member.class_id)) {
    return `${member.class_name} cannot equip this item`;
  }
  return "";
}

function characterImpact(member, before, after) {
  if (!member) return [];
  const hero = {
    str: Number(member.str) || 0,
    agi: Number(member.agi) || 0,
    int: Number(member.int_stat) || 0,
    vit: Number(member.vit) || 0,
    lck: Number(member.lck) || 0,
  };
  const lines = [];
  for (const stat of CORE_STATS) {
    const current = hero[stat] + (before[stat] || 0);
    const proposed = hero[stat] + (after[stat] || 0);
    if (current !== proposed) {
      lines.push(
        `${statLabel(stat)} ${current} → ${proposed} (Hero ${hero[stat]} + Gear ${after[stat] || 0})`,
      );
    }
  }
  const attackBefore = hero.str + (before.str || 0) + (before.power || 0);
  const attackAfter = hero.str + (after.str || 0) + (after.power || 0);
  lines.unshift(`Attack ${attackBefore} → ${attackAfter}`);
  lines.push(`Absorb ${before.absorb || 0} → ${after.absorb || 0}`);
  return lines.slice(0, 5);
}

function isEquipmentItem(item) {
  return (
    !!item &&
    (!!item.category || /^wpn_|^arm_|^eqp_/.test(String(item.id || "")))
  );
}

function itemCategory(item) {
  if (item?.category) return item.category;
  if (String(item?.id || "").startsWith("wpn_")) return "weapon";
  if (String(item?.id || "").startsWith("arm_")) return "armor";
  return "";
}

function inferredKind(item) {
  const category = itemCategory(item);
  if (category === "weapon") return "weapon";
  if (["ring", "amulet"].includes(category)) return "accessory";
  return "armor";
}

function itemKey(item) {
  if (!item) return "";
  return item.instance_id
    ? `instance:${item.instance_id}`
    : item.id
      ? `static:${item.id}`
      : "";
}

function staticBaseID(id) {
  return String(id || "").replace(/^(wpn_|arm_|eqp_)/, "");
}

function normalizeStats(stats) {
  const normalized = {};
  for (const [key, value] of Object.entries(stats || {})) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) normalized[key] = numeric;
  }
  return normalized;
}

function addStats(target, stats) {
  for (const [key, value] of Object.entries(stats || {}))
    target[key] = (target[key] || 0) + value;
}

function statDeltas(before, after) {
  const deltas = {};
  for (const key of new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])) {
    deltas[key] = (after?.[key] || 0) - (before?.[key] || 0);
  }
  return deltas;
}

function simpleItemScore(item) {
  return Object.entries(itemStats(item)).reduce((total, [stat, value]) => {
    if (stat === "evade_penalty") return total - value;
    return total + value;
  }, 0);
}

function significantStatEntries(stats) {
  const keys = new Set([...STAT_ORDER, ...Object.keys(stats || {})]);
  return [...keys]
    .filter((key) => Number(stats?.[key]) !== 0)
    .map((key) => [key, Number(stats[key]) || 0]);
}

function formatTopStats(item) {
  const entries = significantStatEntries(itemStats(item)).slice(0, 3);
  return entries.length
    ? entries.map(([stat, value]) => `${statLabel(stat)} ${value}`).join(" · ")
    : "No stat bonus";
}

function socketPips(item) {
  if (!item?.sockets?.length) return "";
  return item.sockets.map((socket) => (socket.gem_id ? "◆" : "◇")).join("");
}

function socketLabel(item) {
  if (!item?.sockets?.length) return "No sockets";
  const filled = item.sockets.filter((socket) => socket.gem_id).length;
  const names = item.sockets
    .filter((socket) => socket.gem_id)
    .map((socket) => socket.gem_name)
    .filter(Boolean);
  return `${filled}/${item.sockets.length} sockets filled${names.length ? ` · ${names.join(", ")}` : ""}`;
}

function rarityClass(value) {
  return String(value || "common")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function categoryGlyph(category) {
  return (
    {
      weapon: "W",
      armor: "B",
      shield: "O",
      helmet: "H",
      shoulders: "S",
      gloves: "G",
      belt: "▰",
      pants: "L",
      boots: "F",
      amulet: "A",
      ring: "R",
      focus: "✧",
    }[category] || "?"
  );
}

function statLabel(stat) {
  return STAT_LABELS[stat] || titleCase(String(stat).replaceAll("_", " "));
}

function formatSigned(value) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function deltaTone(stat, value) {
  if (value === 0) return "neutral";
  const improves = stat === "evade_penalty" ? value < 0 : value > 0;
  return improves ? "positive" : "negative";
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activePartySlots(party) {
  const slots = [];
  for (let index = 0; index < (party || []).length; index += 1)
    if (party[index]) slots.push(index);
  return slots;
}

function setStatus(state, message, tone = "") {
  state.status = message;
  state.statusTone = tone;
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function button(label, className, onClick, ariaLabel = "") {
  const control = document.createElement("button");
  control.type = "button";
  control.className = className;
  if (label) control.textContent = label;
  if (ariaLabel) control.setAttribute("aria-label", ariaLabel);
  control.addEventListener("click", onClick);
  return control;
}
