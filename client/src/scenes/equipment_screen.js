import { renderCharacterSpells } from "./character_spells.js";
import {
  applyRecommendedEquipment,
  equipItem,
  previewEquipment,
  recommendEquipment,
  unequipItem,
} from "../api.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { renderEquipmentBuilds } from "./equipment_builds.js";
import { showGemWorkshop } from "./gem_workshop.js";

const LOCK_NAME = "equipment_screen";
const INACTIVE_STATS = new Set(["vit", "magic_defense"]);
const DETAIL_TABS = [
  ["summary", "Summary"],
  ["spells", "Spells"],
  ["special", "Special"],
];
const STAT_ORDER = [
  "attack",
  "evade",
  "attacks_per_turn",
  "power",
  "absorb",
  "str",
  "agi",
  "int",
  "vit",
  "lck",
  "hit_pct",
  "crit_pct",
  "spell_damage_pct",
  "magic_defense",
  "evade_penalty",
];
const STAT_LABELS = {
  attack: "Attack",
  evade: "Evasion",
  attacks_per_turn: "Attacks",
  power: "Power",
  absorb: "Absorb",
  str: "Strength",
  agi: "Agility",
  int: "Intellect",
  vit: "Vitality",
  lck: "Luck",
  hit_pct: "Hit",
  crit_pct: "Crit",
  spell_damage_pct: "Spell damage (%)",
  magic_defense: "Magic Defense",
  evade_penalty: "Evade penalty",
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
  // Phaser listens for pointer input at the window level. Keep interactions
  // with this DOM overlay from activating the older canvas menu underneath.
  for (const eventName of ["pointerdown", "pointerup", "click"]) {
    root.addEventListener(eventName, (event) => event.stopPropagation());
  }
  const dom = { destroy: () => root.remove() };
  const state = {
    scene,
    root,
    dom,
    partyIndex,
    detailTab: DETAIL_TABS.some(([id]) => id === options.detailTab)
      ? options.detailTab
      : "summary",
    selectedSlotID: options.selectedSlotID || "",
    selectedCandidateKey: "",
    goal: options.goal || "balanced",
    recommendation: null,
    buildPanel: false,
    buildPreview: null,
    buildName: "",
    busy: false,
    status: "",
    statusTone: "",
    onClose: options.onClose,
    previousFocus: document.activeElement,
    previousPhaserInputEnabled: scene.input?.enabled,
  };
  if (scene.input) scene.input.enabled = false;
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
  requestAnimationFrame(() => {
    if (state.selectedSlotID) focusSelectedSlot(state);
    else root.focus();
  });
}

export function closeEquipmentScreen(scene, { callOnClose = true } = {}) {
  const state = scene?.equipmentScreenState;
  if (!state) return;
  scene.equipmentScreenState = null;
  window.removeEventListener("resize", state.resizeHandler);
  if (state.scene.input && state.previousPhaserInputEnabled != null) {
    state.scene.input.enabled = state.previousPhaserInputEnabled;
  }
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
    effective: normalizeStats(equipment.effective),
    base: normalizeStats(equipment.base),
  };
}

export function buildCharacterSummaryResources(member = {}) {
  const xp = Math.max(0, Number(member.xp) || 0);
  const xpNext = Math.max(0, Number(member.xp_next) || 0);
  return [
    {
      label: "HP",
      current: Math.max(0, Number(member.hp) || 0),
      maximum: Math.max(0, Number(member.max_hp) || 0),
      tone: "hp",
      note: "",
    },
    {
      label: "MP",
      current: Math.max(0, Number(member.mp) || 0),
      maximum: Math.max(0, Number(member.max_mp) || 0),
      tone: "mp",
      note: "",
    },
    {
      label: "XP",
      current: xp,
      maximum: xpNext,
      tone: "xp",
      note: xpNext > 0 ? `Next level in ${Math.max(0, xpNext - xp)}` : "",
    },
  ];
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
  preview = null,
) {
  const model = buildEquipmentScreenModel(gameState, partyIndex);
  return {
    current: model.slots.find((slot) => slot.id === slotID)?.item || null,
    candidate: candidate || null,
    before: preview?.before || model.effective,
    after: preview?.after || model.effective,
    deltas: preview?.deltas || {},
    character: preview
      ? ["Before temporary battle buffs and formation effects."]
      : [],
    ready: !!preview,
  };
}

export function buildEquipmentComparisonRows(comparison) {
  const before = comparison?.before || {};
  const after = comparison?.after || {};
  const deltas = comparison?.deltas || {};
  const keys = new Set([
    ...STAT_ORDER,
    ...Object.keys(before),
    ...Object.keys(after),
  ]);
  return [...keys]
    .filter((stat) => {
      const current = Number(before[stat]) || 0;
      const preview = Number(after[stat]) || 0;
      const delta = Number(deltas[stat]) || 0;
      return current !== 0 || preview !== 0 || delta !== 0;
    })
    .map((stat) => {
      const current = Number(before[stat]) || 0;
      const preview = Number(after[stat]) || 0;
      const delta = Number(deltas[stat]) || preview - current;
      return {
        stat,
        label: statLabel(stat),
        current,
        preview,
        delta,
        tone: deltaTone(stat, delta),
      };
    });
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
  const focused = document.activeElement;
  const focusKey = root.contains(focused) ? equipmentFocusKey(focused) : null;
  const model = buildEquipmentScreenModel(scene.gameState, state.partyIndex);
  if (!model.member) {
    closeEquipmentScreen(scene);
    return;
  }
  if (
    state.selectedSlotID &&
    !model.slots.some((slot) => slot.id === state.selectedSlotID)
  )
    state.selectedSlotID = "";
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
    state.previewGameState === scene.gameState &&
      state.previewKey ===
        `${state.partyIndex}:${state.selectedSlotID}:${selectedCandidate?.key}`
      ? state.comparisonPreview
      : null,
  );

  root.classList.toggle("is-spells", state.detailTab === "spells");
  root.replaceChildren();
  root.append(
    renderHeader(state, model),
    renderMain(
      state,
      model,
      selectedSlot,
      candidates,
      selectedCandidate,
      comparison,
    ),
    renderStatus(state),
  );
  if (state.recommendation) root.append(renderRecommendation(state));
  if (state.buildPanel) {
    for (const child of root.children) child.inert = true;
    root.append(
      renderEquipmentBuilds(
        state,
        () => renderEquipmentScreen(state),
        () => closeBuildPanel(state),
      ),
    );
    // Rerenders replace focused controls. Keep keyboard events inside the modal
    // even while all mutation buttons are disabled awaiting the server.
    root
      .querySelector(".equipment-build-dialog")
      ?.focus({ preventScroll: true });
  }
  if (focusKey !== null && !state.buildPanel) {
    const control = [
      ...root.querySelectorAll("button, select, [tabindex]"),
    ].find((entry) => equipmentFocusKey(entry) === focusKey);
    (control || root).focus();
  }
}

function equipmentFocusKey(control) {
  return (
    control.dataset.testid ||
    control.dataset.focusKey ||
    control.getAttribute("aria-label") ||
    control.id
  );
}

function renderHeader(state, model) {
  const header = element("header", "equipment-header");
  const party = activePartySlots(state.scene.gameState?.party);
  const position = Math.max(0, party.indexOf(state.partyIndex));
  const previous = button(
    "‹",
    "equipment-nav",
    (event) => cycleParty(state, -1, event),
    "Previous character",
  );
  const next = button(
    "›",
    "equipment-nav",
    (event) => cycleParty(state, 1, event),
    "Next character",
  );
  previous.dataset.direction = "previous";
  next.dataset.direction = "next";
  previous.disabled = party.length < 2;
  next.disabled = party.length < 2;
  const identity = element("div", "equipment-identity");
  const title = element("h1", "", "Character");
  title.id = "equipment-screen-title";
  const characterName = element("p", "equipment-character", model.member.name);
  characterName.setAttribute("aria-live", "polite");
  const partyPosition = element(
    "span",
    "equipment-party-position",
    `${position + 1}/${party.length}`,
  );
  partyPosition.setAttribute(
    "aria-label",
    `Character ${position + 1} of ${party.length}`,
  );
  identity.append(
    title,
    characterName,
    partyPosition,
    element(
      "p",
      "equipment-character-meta",
      `${model.member.class_name} · Level ${model.member.level}`,
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
  if (state.detailTab === "spells")
    header.append(previous, identity, next, close);
  else header.append(previous, identity, next, goal, recommend, close);
  return header;
}

function renderMain(
  state,
  model,
  selectedSlot,
  candidates,
  selectedCandidate,
  comparison,
) {
  const main = element(
    "div",
    `equipment-main${selectedSlot ? " has-selection" : ""}`,
  );
  if (state.detailTab === "spells") {
    main.append(renderCharacterSummary(state, model));
    return main;
  }
  const loadout = element("section", "loadout-panel");
  loadout.setAttribute("aria-labelledby", "loadout-title");
  const loadoutTitle = element("h2", "section-title", "Loadout");
  loadoutTitle.id = "loadout-title";
  const loadoutHeading = element("div", "loadout-heading");
  const builds = button(
    "Saved Builds",
    "equipment-action secondary equipment-build-open",
    () => {
      state.buildPanel = true;
      state.buildPreview = null;
      state.buildDeleteID = "";
      state.buildOverwriteID = "";
      state.recommendation = null;
      state.status = "";
      renderEquipmentScreen(state);
      requestAnimationFrame(() =>
        state.root.querySelector('[data-build-focus="close"]')?.focus(),
      );
    },
  );
  builds.disabled = state.busy;
  loadoutHeading.append(loadoutTitle, builds);
  loadout.append(loadoutHeading);

  const stage = element("div", "paperdoll-stage");
  const portrait = document.createElement("img");
  portrait.className = "paperdoll-character-art";
  portrait.src = `/sprites/${model.member.sprite_id || model.member.class_id}.png`;
  portrait.alt = "";
  portrait.setAttribute("aria-hidden", "true");
  portrait.addEventListener("error", () =>
    portrait.classList.add("is-missing"),
  );
  stage.append(portrait);
  for (const slot of model.slots) stage.append(renderSlot(state, slot));
  loadout.append(
    stage,
    element(
      "p",
      "paperdoll-help",
      "Hover or focus for full stats—no click needed. Click only to change gear.",
    ),
  );

  main.append(renderCharacterSummary(state, model), loadout);
  if (selectedSlot) {
    main.append(
      renderEquipmentDrawer(
        state,
        model,
        selectedSlot,
        candidates,
        selectedCandidate,
        comparison,
      ),
    );
  }
  return main;
}

function renderCharacterSummary(state, model) {
  const member = model.member;
  const panel = element("section", "character-summary-panel");
  panel.setAttribute("aria-labelledby", "character-summary-title");
  const title = element("h2", "section-title", "Character Details");
  title.id = "character-summary-title";
  panel.append(title);

  const tabList = element("div", "character-detail-tabs");
  tabList.setAttribute("role", "tablist");
  tabList.setAttribute("aria-label", "Character details");
  for (const [id, label] of DETAIL_TABS) {
    const tab = button(label, "character-detail-tab", () => {
      state.detailTab = id;
      state.status = "";
      renderEquipmentScreen(state);
      requestAnimationFrame(() =>
        state.root.querySelector(`[data-detail-tab="${id}"]`)?.focus(),
      );
    });
    tab.dataset.detailTab = id;
    tab.id = `character-detail-tab-${id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute(
      "aria-selected",
      state.detailTab === id ? "true" : "false",
    );
    tab.setAttribute("aria-controls", `character-detail-panel-${id}`);
    tab.tabIndex = state.detailTab === id ? 0 : -1;
    tab.addEventListener("keydown", (event) =>
      handleDetailTabKeydown(state, id, event),
    );
    tabList.append(tab);
  }
  panel.append(tabList);

  const tabPanel = element("div", "character-detail-panel");
  tabPanel.id = `character-detail-panel-${state.detailTab}`;
  tabPanel.setAttribute("role", "tabpanel");
  tabPanel.setAttribute(
    "aria-labelledby",
    `character-detail-tab-${state.detailTab}`,
  );
  if (state.detailTab === "spells")
    renderCharacterSpells(state, tabPanel, () => renderEquipmentScreen(state));
  else if (state.detailTab === "special") renderSpecialTab(tabPanel, member);
  else renderSummaryTab(tabPanel, model);
  panel.append(tabPanel);
  return panel;
}

function renderSummaryTab(panel, model) {
  const member = model.member;

  const vitals = element("section", "character-summary-group");
  vitals.append(element("h3", "character-summary-label", "Vitals"));
  const bars = element("div", "character-resource-bars");
  for (const resource of buildCharacterSummaryResources(member)) {
    const { label, current, maximum, tone, note } = resource;
    const row = element("div", "character-resource");
    const labelRow = element("div", "character-resource-label");
    labelRow.append(
      element("strong", "", label),
      element("span", "", maximum > 0 ? `${current}/${maximum}` : "—"),
    );
    const track = element("span", "character-resource-track");
    const fill = element("span", `character-resource-fill ${tone}`);
    fill.style.width = `${maximum > 0 ? Math.max(0, Math.min(100, (current / maximum) * 100)) : 0}%`;
    track.append(fill);
    row.append(labelRow, track);
    if (note) row.append(element("span", "character-resource-note", note));
    bars.append(row);
  }
  vitals.append(bars);
  panel.append(vitals);

  const combat = element("section", "character-summary-group");
  combat.append(element("h3", "character-summary-label", "Combat"));
  const stats = element("dl", "character-stat-grid");
  for (const stat of [
    "attack",
    "str",
    "agi",
    "int",
    "vit",
    "lck",
    "absorb",
    "hit_pct",
    "attacks_per_turn",
    "crit_pct",
    "evade",
    "spell_damage_pct",
  ]) {
    const label = statLabel(stat);
    const base = model.base[stat] || 0;
    const total = model.effective[stat] ?? base;
    const bonus = total - base;
    const term = element("dt", "", label);
    const value = element("dd");
    value.append(element("strong", "", String(total)));
    if (bonus)
      value.append(
        element(
          "span",
          "stat-breakdown",
          `${base} base ${formatSigned(bonus)} gear`,
        ),
      );
    stats.append(term, value);
  }
  combat.append(stats);
  combat.append(
    element(
      "p",
      "equipment-magic-note",
      "Intellect adds the same percentage to spell damage and healing. Spell damage bonus affects offense only.",
    ),
  );
  const inactive = [...INACTIVE_STATS].filter((stat) => model.gearTotals[stat]);
  if (inactive.length)
    combat.append(
      element(
        "p",
        "equipment-inactive-note",
        `${inactive.map((stat) => `${statLabel(stat)} ${formatSigned(model.gearTotals[stat])}`).join(", ")}: gear bonuses are inactive. They do not change HP growth, status resistance, or protection.`,
      ),
    );

  panel.append(combat);

  const condition = element("section", "character-summary-group");
  condition.append(element("h3", "character-summary-label", "Condition"));
  const conditions = element("div", "character-conditions");
  conditions.append(
    element("span", "condition-label", "Status"),
    element("strong", "", member.status || "Normal"),
  );
  condition.append(conditions);
  panel.append(condition);
}

function renderSpecialTab(panel, member) {
  const abilities = member.abilities || [];
  if (!abilities.length) {
    panel.append(
      element("p", "character-detail-empty", "No special techniques yet."),
    );
    return;
  }
  const list = element("div", "character-ability-list");
  for (const ability of abilities) {
    const row = element("article", "character-ability-card");
    row.append(
      element("strong", "", titleCase(String(ability).replaceAll("_", " "))),
      element("span", "character-ability-effect", "Class technique"),
    );
    list.append(row);
  }
  panel.append(list);
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
  const filledSockets = (item?.sockets || []).filter((socket) => socket.gem_id);
  control.classList.toggle("is-socketed", filledSockets.length > 0);
  if (filledSockets.length) {
    const primary = filledSockets[0];
    const secondary = filledSockets[1] || primary;
    control.style.setProperty("--socket-color", primary.color || "#ff9f43");
    control.style.setProperty(
      "--socket-glow",
      primary.glow_color || primary.color || "#ffd166",
    );
    control.style.setProperty(
      "--socket-color-secondary",
      secondary.color || primary.color || "#61cfff",
    );
    control.style.setProperty(
      "--socket-glow-secondary",
      secondary.glow_color ||
        secondary.color ||
        primary.glow_color ||
        "#b6f4ff",
    );
  }
  control.setAttribute(
    "aria-pressed",
    state.selectedSlotID === slot.id ? "true" : "false",
  );
  control.setAttribute("aria-label", `${slot.name}: ${item?.name || "Empty"}`);
  const frame = element(
    "span",
    `equipment-slot-frame rarity-${rarityClass(item?.rarity)}`,
  );
  const icon = renderItemIcon(
    item,
    SLOT_GLYPHS[slot.id] || slot.name?.slice(0, 1) || "?",
  );
  const sockets = renderSocketPips(item);
  sockets.setAttribute("aria-label", socketLabel(item));
  frame.append(icon, sockets);
  const caption = element("span", "equipment-slot-label", slot.name);
  const tooltip = renderItemTooltip(
    slot.name,
    item,
    "Click only when you want to change gear",
  );
  tooltip.id = `equipment-slot-tip-${state.partyIndex}-${slot.id}`;
  control.setAttribute("aria-describedby", tooltip.id);
  control.append(frame, caption, tooltip);
  return control;
}

function renderEquipmentDrawer(
  state,
  model,
  slot,
  candidates,
  selectedCandidate,
  comparison,
) {
  const drawer = element("aside", "equipment-drawer");
  drawer.setAttribute("aria-labelledby", "inventory-title");
  const heading = element("div", "equipment-drawer-heading");
  const headingCopy = element("div");
  const title = element("h2", "section-title", slot.name);
  title.id = "inventory-title";
  headingCopy.append(
    title,
    element(
      "p",
      "drawer-subtitle",
      slot.item ? `Equipped: ${slot.item.name}` : "Nothing equipped",
    ),
  );
  heading.append(
    headingCopy,
    button(
      "×",
      "drawer-close",
      () => {
        state.selectedSlotID = "";
        state.selectedCandidateKey = "";
        renderEquipmentScreen(state);
        state.root.querySelector(`[data-slot-id="${slot.id}"]`)?.focus();
      },
      "Close gear drawer",
    ),
  );
  drawer.append(heading);

  const current = element("section", "drawer-current");
  current.append(renderItemDetails("Equipped", slot.item));
  const currentActions = element("div", "drawer-current-actions");
  const hasSockets = slot.item?.instance_id && slot.item?.sockets?.length > 0;
  if (hasSockets) {
    const openSocket = slot.item.sockets.some((socket) => !socket.gem_id);
    currentActions.append(
      button(
        openSocket ? "Socket" : "Workshop",
        "equipment-action secondary",
        () => openSocketWorkshop(state, slot, slot.item),
      ),
    );
  }
  if (slot.item) {
    const remove = button("Unequip", "equipment-action subtle", () =>
      performUnequip(state, slot),
    );
    remove.disabled = state.busy;
    currentActions.append(remove);
  }
  current.append(currentActions);
  drawer.append(current);

  const ownedHeading = element("div", "inventory-heading");
  ownedHeading.append(
    element("h3", "section-title", "Owned Gear"),
    element("span", "inventory-filter", `Fits ${slot.name}`),
  );
  drawer.append(ownedHeading);

  const list = element("div", "equipment-item-list");
  if (candidates.length === 0) {
    list.append(
      element("p", "equipment-empty", `No owned items fit ${slot.name}.`),
    );
  }
  for (const candidate of candidates) {
    list.append(
      renderCandidate(
        state,
        slot,
        candidate,
        selectedCandidate?.key === candidate.key,
      ),
    );
  }
  drawer.append(list);
  if (selectedCandidate) {
    drawer.append(
      renderComparison(state, model, slot, selectedCandidate, comparison),
    );
  } else if (candidates.length > 0) {
    drawer.append(
      element(
        "p",
        "drawer-hint",
        "Hover for full stats and comparison. Click only to select an item for equipping.",
      ),
    );
  }
  return drawer;
}

function renderCandidate(state, slot, candidate, selected) {
  const item = candidate.item;
  const row = button("", "equipment-item-row", () =>
    selectEquipmentCandidate(state, slot, candidate),
  );
  row.dataset.itemKey = candidate.key;
  row.dataset.testid = `equipment-item-${candidate.key}`;
  row.classList.toggle("is-selected", selected);
  row.classList.toggle("is-disabled", !candidate.compatible);
  row.setAttribute("aria-pressed", selected ? "true" : "false");
  const icon = renderItemIcon(item, categoryGlyph(itemCategory(item)), true);
  const copy = element("span", "equipment-item-copy");
  const name = element(
    "span",
    `equipment-item-name rarity-${rarityClass(item.rarity)}`,
    item.name || "Unknown equipment",
  );
  const meta = element("span", "equipment-item-meta", formatTopStats(item));
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
  const tooltip = renderItemTooltip(
    candidate.disabledReason ||
      `Compare with ${slot.item?.name || "empty slot"}`,
    item,
    candidate.compatible
      ? "Click to select for equip review"
      : "Cannot equip this item",
  );
  tooltip.classList.add("candidate-tooltip");
  tooltip.append(
    element("span", "delta neutral", "Select for exact character comparison."),
  );
  tooltip.id = `equipment-candidate-tip-${candidate.key.replace(/[^a-z0-9_-]/gi, "-")}`;
  row.setAttribute("aria-describedby", tooltip.id);
  row.append(icon, copy, element("span", "equipment-row-arrow", "›"), tooltip);
  return row;
}

function renderComparison(state, model, slot, selectedCandidate, comparison) {
  const region = element(
    "section",
    "equipment-choice-preview comparison-impact",
  );
  region.setAttribute("aria-live", "polite");
  region.append(
    element("h3", "section-title", `Equip ${selectedCandidate.item.name}?`),
  );
  if (!comparison.ready) {
    region.append(
      element(
        "p",
        "character-impact-line",
        state.comparisonError || "Checking character totals…",
      ),
    );
    if (state.comparisonError) {
      region.append(
        button("Retry comparison", "equipment-action secondary", () =>
          selectEquipmentCandidate(state, slot, selectedCandidate),
        ),
      );
    }
    return region;
  }
  const comparisonTable = element("div", "comparison-table");
  comparisonTable.setAttribute(
    "aria-label",
    "Current and preview character stats",
  );
  const tableHead = element("div", "comparison-table-head");
  tableHead.append(
    element("span", "comparison-stat", "Character stat"),
    element("span", "comparison-current", "Current"),
    element("span", "comparison-arrow", ""),
    element("span", "comparison-preview", "Preview"),
    element("span", "comparison-delta", "Change"),
  );
  comparisonTable.append(tableHead);
  for (const row of buildEquipmentComparisonRows(comparison)) {
    const tableRow = element(
      "div",
      `comparison-table-row ${row.tone}${row.delta === 0 ? " is-unchanged" : ""}`,
    );
    tableRow.append(
      element("span", "comparison-stat", row.label),
      element("span", "comparison-current", String(row.current)),
      element("span", "comparison-arrow", "→"),
      element("span", "comparison-preview", String(row.preview)),
      element(
        "span",
        `comparison-delta delta ${row.tone}`,
        row.delta === 0 ? "—" : formatSigned(row.delta),
      ),
    );
    comparisonTable.append(tableRow);
  }
  region.append(comparisonTable);
  for (const line of comparison.character) {
    region.append(element("p", "character-impact-line", line));
  }
  if (selectedCandidate.source) {
    region.append(
      element(
        "p",
        "equipment-move-warning",
        `Moves from ${selectedCandidate.source.characterName}'s ${selectedCandidate.source.slotName}.`,
      ),
    );
  }

  const actions = element("div", "comparison-actions");
  const equip = button(
    `Equip in ${slot?.name || "slot"}`,
    "equipment-action primary",
    () => performEquip(state, slot, selectedCandidate),
  );
  equip.disabled = state.busy || !selectedCandidate.compatible;
  actions.append(equip);
  region.append(actions);
  return region;
}

function renderItemTooltip(label, item, footer = "") {
  const tooltip = element("span", "equipment-tooltip");
  tooltip.setAttribute("role", "tooltip");
  tooltip.append(element("span", "tooltip-eyebrow", label));
  if (!item) {
    tooltip.append(
      element("strong", "tooltip-item-name", "Empty slot"),
      element("span", "tooltip-copy", footer || "Select to browse gear"),
    );
    return tooltip;
  }
  tooltip.append(
    element(
      "strong",
      `tooltip-item-name rarity-${rarityClass(item.rarity)}`,
      item.name,
    ),
    element(
      "span",
      "tooltip-meta",
      `${item.rarity || "Common"} · Item Lv.${Number(item.item_level) || 1} · Requires Lv.${Number(item.required_level) || 1}`,
    ),
  );
  const stats = element("span", "tooltip-stats");
  for (const [stat, total] of significantStatEntries(itemStats(item))) {
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
    stats.append(
      element(
        "span",
        "tooltip-stat",
        additions.length
          ? `${statLabel(stat)} ${total} · base ${total - added} + ${added}`
          : `${statLabel(stat)} ${total}`,
      ),
    );
  }
  tooltip.append(stats);

  if (
    Object.keys(itemStats(item)).some(
      (stat) => INACTIVE_STATS.has(stat) && itemStats(item)[stat],
    )
  ) {
    tooltip.append(
      element(
        "span",
        "tooltip-copy",
        "Vitality and Magic Defense gear bonuses are inactive. They do not change HP growth, status resistance, or protection.",
      ),
    );
  }
  const sources = element("span", "tooltip-sources");
  for (const affix of item.affixes || []) {
    const row = element("span", "tooltip-source-row is-affix");
    row.append(
      element("span", "tooltip-source-kind", "Affix"),
      element("strong", "", affix.name || "Equipment bonus"),
      element(
        "span",
        "tooltip-source-value",
        `${statLabel(affix.stat)} ${formatSigned(Number(affix.value) || 0)}`,
      ),
    );
    sources.append(row);
  }
  for (const socket of item.sockets || []) {
    const filled = Boolean(socket.gem_id);
    const row = element(
      "span",
      `tooltip-source-row is-socket ${filled ? "is-filled" : "is-open"}`,
    );
    if (filled) {
      row.style.setProperty("--tooltip-gem-color", socket.color || "#69e6b5");
      row.style.setProperty(
        "--tooltip-gem-glow",
        socket.glow_color || socket.color || "#b6f4ff",
      );
    }
    row.append(
      element("span", "tooltip-source-kind", filled ? "Gem" : "Socket"),
      element(
        "strong",
        "",
        filled ? socket.gem_name || "Socketed gem" : "Open socket",
      ),
      element(
        "span",
        "tooltip-source-value",
        filled
          ? `${statLabel(socket.stat)} ${formatSigned(Number(socket.value) || 0)}`
          : "Ready",
      ),
    );
    sources.append(row);
  }
  if (sources.childElementCount > 0) {
    tooltip.append(
      element("span", "tooltip-section-label", "Bonuses & Sockets"),
      sources,
    );
  }
  if (footer) tooltip.append(element("span", "tooltip-copy", footer));
  return tooltip;
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
    state.status ||
      (state.detailTab === "spells"
        ? "Select a spell to view its details or cast field magic."
        : "Select a slot, compare, then confirm."),
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

async function selectEquipmentCandidate(state, slot, candidate) {
  state.selectedCandidateKey = candidate.key;
  state.recommendation = null;
  state.comparisonPreview = null;
  state.comparisonError = "";
  const key = `${state.partyIndex}:${slot.id}:${candidate.key}`;
  state.previewKey = key;
  const request = {};
  state.previewRequest = request;
  const gameState = state.scene.gameState;
  state.previewGameState = gameState;
  renderEquipmentScreen(state);
  const focusCandidate = () =>
    state.root.querySelector(`[data-item-key="${candidate.key}"]`)?.focus();
  focusCandidate();
  const item = candidate.item;
  let result;
  try {
    result = await previewEquipment(
      gameState.id,
      state.partyIndex,
      slot.id,
      item.instance_id || staticBaseID(item.id),
      item.kind || inferredKind(item),
    );
  } catch {
    result = { error: "Could not load character totals. Please try again." };
  }
  if (
    state.scene.equipmentScreenState !== state ||
    state.previewRequest !== request ||
    state.previewKey !== key ||
    state.selectedSlotID !== slot.id ||
    state.selectedCandidateKey !== candidate.key ||
    state.scene.gameState !== gameState
  )
    return;
  state.comparisonError = result.error || "";
  state.comparisonPreview = result.error ? null : result;
  renderEquipmentScreen(state);
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
    detailTab: state.detailTab,
    onClose: state.onClose,
  };
  closeEquipmentScreen(scene, { callOnClose: false });
  showGemWorkshop(scene, {
    preselectedInstanceID: item.instance_id,
    onClose: () => showEquipmentScreen(scene, state.partyIndex, returnOptions),
  });
}

function cycleParty(state, delta, event) {
  const slots = activePartySlots(state.scene.gameState?.party);
  if (slots.length < 2) return;
  // A double-click on a two-person party otherwise advances twice and lands
  // back on the same member, which makes a successful navigation look inert.
  if (Number(event?.detail) > 1) return;
  const position = Math.max(0, slots.indexOf(state.partyIndex));
  state.partyIndex = slots[(position + delta + slots.length) % slots.length];
  state.selectedSlotID = "";
  state.selectedCandidateKey = "";
  state.recommendation = null;
  renderEquipmentScreen(state);
  const direction = delta < 0 ? "previous" : "next";
  requestAnimationFrame(() =>
    state.root.querySelector(`[data-direction="${direction}"]`)?.focus(),
  );
}

function handleDetailTabKeydown(state, currentID, event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const current = Math.max(
    0,
    DETAIL_TABS.findIndex(([id]) => id === currentID),
  );
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? DETAIL_TABS.length - 1
        : (current +
            (event.key === "ArrowLeft" ? -1 : 1) +
            DETAIL_TABS.length) %
          DETAIL_TABS.length;
  state.detailTab = DETAIL_TABS[next][0];
  renderEquipmentScreen(state);
  requestAnimationFrame(() =>
    state.root.querySelector(`[data-detail-tab="${state.detailTab}"]`)?.focus(),
  );
}

function closeBuildPanel(state) {
  if (state.busy) return;
  state.buildPanel = false;
  renderEquipmentScreen(state);
  requestAnimationFrame(() =>
    state.root.querySelector(".equipment-build-open")?.focus(),
  );
}

function handleOverlayKeydown(state, event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (state.buildPanel) {
      closeBuildPanel(state);
    } else if (state.recommendation) {
      state.recommendation = null;
      renderEquipmentScreen(state);
      focusSelectedSlot(state);
    } else {
      closeEquipmentScreen(state.scene);
    }
    return;
  }
  if (
    !state.buildPanel &&
    ["ArrowLeft", "ArrowRight"].includes(event.key) &&
    !event.target.closest?.('[role="tablist"]') &&
    !["SELECT", "INPUT", "TEXTAREA"].includes(event.target.tagName)
  ) {
    event.preventDefault();
    event.stopPropagation();
    cycleParty(state, event.key === "ArrowLeft" ? -1 : 1);
    return;
  }
  if (event.key !== "Tab") return;
  const focusScope =
    state.root.querySelector(".equipment-build-dialog") || state.root;
  const focusable = [
    ...focusScope.querySelectorAll(
      "button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex='0']",
    ),
  ];
  if (focusable.length === 0) {
    event.preventDefault();
    focusScope.focus();
    return;
  }
  if (state.buildPanel && document.activeElement === focusScope) {
    event.preventDefault();
    (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
    return;
  }
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
  const selected = state.selectedSlotID
    ? state.root.querySelector(`[data-slot-id="${state.selectedSlotID}"]`)
    : null;
  (selected || state.root.querySelector(".equipment-slot"))?.focus();
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

function simpleItemScore(item) {
  return Object.entries(itemStats(item)).reduce((total, [stat, value]) => {
    if (INACTIVE_STATS.has(stat)) return total;
    if (stat === "evade_penalty") return total - value;
    return total + value;
  }, 0);
}

function significantStatEntries(stats) {
  const keys = new Set([...STAT_ORDER, ...Object.keys(stats || {})]);
  return [...keys]
    .filter((key) => {
      const value = Number(stats?.[key]);
      return Number.isFinite(value) && value !== 0;
    })
    .map((key) => [key, Number(stats[key]) || 0]);
}

function formatTopStats(item) {
  const entries = significantStatEntries(itemStats(item)).slice(0, 3);
  return entries.length
    ? entries
        .map(
          ([stat, value]) =>
            `${statLabel(stat)} ${value}${INACTIVE_STATS.has(stat) ? " (inactive)" : ""}`,
        )
        .join(" · ")
    : "No stat bonus";
}

function renderSocketPips(item) {
  const sockets = element("span", "equipment-sockets");
  for (const socket of item?.sockets || []) {
    const filled = Boolean(socket.gem_id);
    const pip = element(
      "span",
      `equipment-socket-pip ${filled ? "is-filled" : "is-open"}`,
      filled ? "◆" : "◇",
    );
    if (filled) {
      pip.style.setProperty("--pip-color", socket.color || "#ff9f43");
      pip.style.setProperty(
        "--pip-glow",
        socket.glow_color || socket.color || "#ffd166",
      );
    }
    sockets.append(pip);
  }
  return sockets;
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

function renderItemIcon(item, fallback, small = false) {
  const wrapper = element(
    "span",
    `equipment-placeholder-icon${small ? " small" : ""}`,
  );
  if (!item?.icon_key) {
    wrapper.textContent = fallback;
    return wrapper;
  }
  const image = document.createElement("img");
  image.className = "equipment-item-art";
  image.src = `/sprites/items/${item.icon_key}.png`;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.addEventListener("error", () => {
    wrapper.textContent = fallback;
  });
  wrapper.append(image);
  return wrapper;
}

function statLabel(stat) {
  return STAT_LABELS[stat] || titleCase(String(stat).replaceAll("_", " "));
}

function formatSigned(value) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function deltaTone(stat, value) {
  if (INACTIVE_STATS.has(stat)) return "neutral";
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
  control.dataset.focusKey = ariaLabel || label;
  if (label) control.textContent = label;
  if (ariaLabel) control.setAttribute("aria-label", ariaLabel);
  control.addEventListener("click", onClick);
  return control;
}
