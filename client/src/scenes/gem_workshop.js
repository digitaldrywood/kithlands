import { itemArtURL } from "../ui/item_art.js";
import { menuKeyboard } from "../ui/menu_keyboard.js";
import { changeGem, craftGem, getGame } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import "../styles/gem-workshop.css";

const STAT_NAMES = {
  power: "Power",
  absorb: "Absorb",
  str: "Strength",
  agi: "Agility",
  int: "Intellect",
  vit: "Vitality",
  lck: "Luck",
  hit_pct: "Hit chance",
  crit_pct: "Critical chance",
  magic_defense: "Magic defense",
  evade_penalty: "Evade penalty",
  attack: "Attack",
  evade: "Evade",
  attacks_per_turn: "Attacks per turn",
};
const statName = (stat) => STAT_NAMES[stat] || stat;
const inactiveStat = (stat) => ["int", "vit", "magic_defense"].includes(stat);
const PAGE_SIZE = 5;

function itemKind(item) {
  if (item?.kind) return item.kind;
  return String(item?.id || "").startsWith("arm_") ? "armor" : "weapon";
}

function equippedGear(gs) {
  const result = [];
  for (
    let partySlot = 0;
    partySlot < (gs?.equipment || []).length;
    partySlot += 1
  ) {
    const equip = gs.equipment[partySlot] || {};
    const owner = gs?.party?.[partySlot]?.name || `Party ${partySlot + 1}`;
    const slots = equip.loadout?.length
      ? equip.loadout
      : [
          { name: "Weapon", item: equip.weapon_item },
          { name: "Armor", item: equip.armor_item },
        ];
    for (const slot of slots) {
      if (!slot.item?.instance_id || !Array.isArray(slot.item.sockets))
        continue;
      result.push({
        ...slot.item,
        equipped_slot: partySlot,
        equipped_by: owner,
        equipped_kind: slot.name,
      });
    }
  }
  return result;
}

export function workshopGear(gs) {
  const byID = new Map();
  for (const item of gs?.items || []) {
    if (item?.instance_id && Array.isArray(item.sockets)) {
      byID.set(item.instance_id, item);
    }
  }
  for (const item of equippedGear(gs)) byID.set(item.instance_id, item);
  return [...byID.values()];
}

export function socketableGear(gs) {
  return workshopGear(gs).filter((item) =>
    item.sockets.some((socket) => !socket.gem_id),
  );
}

export function ownedGems(gs) {
  if (!Array.isArray(gs?.gems)) return [];
  return gs.gems.filter((gem) => gem?.id && gem.count > 0);
}

export function allRecipes(gs) {
  if (!Array.isArray(gs?.gem_recipes)) return [];
  return gs.gem_recipes.filter((recipe) => recipe?.id);
}

export function knownRecipes(gs) {
  return allRecipes(gs).filter((recipe) => recipe.known !== false);
}

export function craftableRecipeCount(gs) {
  return knownRecipes(gs).filter((recipe) => recipe.craftable).length;
}

export function firstOpenSocket(item) {
  if (!Array.isArray(item?.sockets)) return -1;
  return item.sockets.findIndex((socket) => !socket.gem_id);
}

export function gemWorkshopEnabled(gs) {
  return ownedGems(gs).length > 0 || knownRecipes(gs).length > 0;
}

export function recipeCostLabel(recipe, gems = []) {
  const names = new Map(gems.map((gem) => [gem.id, gem.name]));
  const inputs = Array.isArray(recipe?.inputs) ? recipe.inputs : [];
  return inputs
    .map(
      (input) =>
        `${input.count}x ${input.gem_name || names.get(input.gem_id) || input.gem_id}`,
    )
    .join(" + ");
}

export function gemEffectForItem(gem, item) {
  const kind = itemKind(item);
  return (gem?.effects || []).find((effect) => effect.kind === kind) || null;
}

export function socketPreview(item, gem) {
  const effect = gemEffectForItem(gem, item);
  const socket = firstOpenSocket(item);
  const changes = Array.isArray(item?.gem_changes)
    ? item.gem_changes
    : item?.socket_previews || [];
  const resolved = changes.find(
    (preview) =>
      preview.gem_id === gem?.id &&
      (preview.socket == null || socket < 0 || preview.socket === socket),
  );
  if (!effect || !resolved?.allowed) return null;
  return {
    ...resolved,
    stat: statName(effect.stat),
    current: resolved.before[effect.stat] || 0,
    after: resolved.after[effect.stat] || 0,
    delta:
      (resolved.after[effect.stat] || 0) - (resolved.before[effect.stat] || 0),
  };
}

export function gemChangePreview(item, socket, gem) {
  const effect = gemEffectForItem(gem, item);
  const changes = Array.isArray(item?.gem_changes)
    ? item.gem_changes
    : item?.socket_previews || [];
  const resolved = changes.find(
    (preview) =>
      preview.gem_id === gem?.id &&
      (preview.socket == null || preview.socket === socket) &&
      preview.action !== "recover",
  );
  if (!effect || !resolved) return null;
  return {
    ...resolved,
    stat: statName(effect.stat),
    current_value: resolved.before?.[effect.stat] || 0,
    proposed_value: resolved.after?.[effect.stat] || 0,
    delta:
      (resolved.after?.[effect.stat] || 0) -
      (resolved.before?.[effect.stat] || 0),
  };
}

export function gemRecoveryPreview(item, socket) {
  return (
    item?.gem_changes?.find(
      (preview) => preview.action === "recover" && preview.socket === socket,
    ) || null
  );
}

function maxPartyLevel(gs) {
  return Math.max(1, ...(gs?.party || []).map((member) => member?.level || 1));
}

export function recommendedGems(gs, item, socket = firstOpenSocket(item)) {
  const level = maxPartyLevel(gs);
  return ownedGems(gs)
    .map((gem) => ({ gem, preview: gemChangePreview(item, socket, gem) }))
    .filter(
      ({ gem, preview }) =>
        preview?.allowed && (gem.required_level || 1) <= level,
    )
    .sort(
      (a, b) =>
        b.preview.delta - a.preview.delta ||
        (b.gem.tier || 0) - (a.gem.tier || 0) ||
        a.gem.name.localeCompare(b.gem.name),
    );
}

function effectValue(gem, kind) {
  return (
    (gem?.effects || []).find((effect) => effect.kind === kind)?.value || 0
  );
}

export function recipeUpgradePreview(recipe) {
  const input = recipe?.inputs?.[0] || {};
  const output = recipe?.output || {};
  return [
    {
      kind: "weapon",
      stat: "Weapon Power",
      before: effectValue(input, "weapon"),
      after: effectValue(output, "weapon"),
    },
    {
      kind: "armor",
      stat: "Armor Absorb",
      before: effectValue(input, "armor"),
      after: effectValue(output, "armor"),
    },
  ].map((row) => ({ ...row, delta: row.after - row.before }));
}

export function recipeReadiness(recipe, gs = {}) {
  if (recipe?.block_reason) return recipe.block_reason;
  if (recipe?.known === false)
    return recipe.discovery_hint || "Recipe not discovered yet";
  const level = maxPartyLevel(gs);
  if (level < (recipe?.required_level || 1)) {
    return `Requires party level ${recipe.required_level}`;
  }
  const counts = new Map((gs?.gems || []).map((gem) => [gem.id, gem.count]));
  for (const input of recipe?.inputs || []) {
    const owned = input.owned ?? counts.get(input.gem_id) ?? 0;
    if (owned < input.count) {
      return `Need ${input.count - owned} more ${input.gem_name || input.gem_id}`;
    }
  }
  return "Ready to transmute";
}

export function recommendedRecipes(gs) {
  const level = maxPartyLevel(gs);
  return allRecipes(gs)
    .map((recipe) => ({
      recipe,
      levelReady: (recipe.required_level || 1) <= level,
      score: recipeUpgradePreview(recipe).reduce(
        (sum, row) => sum + Math.max(0, row.delta),
        0,
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.recipe.craftable) - Number(a.recipe.craftable) ||
        Number(b.levelReady) - Number(a.levelReady) ||
        (a.recipe.required_level || 1) - (b.recipe.required_level || 1) ||
        b.score - a.score ||
        a.recipe.name.localeCompare(b.recipe.name),
    );
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, action, key, disabled = false) {
  const node = element("button", "", label);
  node.type = "button";
  node.dataset.focusKey = key;
  node.disabled = disabled;
  node.addEventListener("click", action);
  return node;
}

// Decorative silhouettes use the same item art as the loadout. Gem shapes are
// presentation only; their effects and availability always come from the server.
function workshopIcon(item, gear = false) {
  const icon = element("span", gear ? "gem-art is-equipment" : "gem-art");
  icon.setAttribute("aria-hidden", "true");
  if (gear || itemArtURL(item?.icon_key)) {
    const image = element("img");
    image.src = item?.icon_key
      ? itemArtURL(item.icon_key)
      : `/sprites/ui/icon_${itemKind(item) === "armor" ? "shield" : "sword"}.png`;
    image.alt = "";
    image.addEventListener("error", () => {
      icon.textContent = "◇";
    });
    icon.append(image);
  } else {
    icon.classList.add(`gem-tone-${item?.id?.split("_")[0] || "neutral"}`);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    for (const d of [
      "M24 5L40 18L34 35L24 44L13 35L8 18Z",
      "M8 18H40M24 5L17 18L24 44L31 18Z",
    ]) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    icon.append(svg);
  }
  return icon;
}

function pinActions(preview) {
  const content = element("div", "gem-preview-content");
  const actions = element("footer", "gem-actions");
  for (const child of [...preview.children]) {
    if (
      child.matches(
        ".gem-confirm, .gem-replacement-warning, [data-focus-key='socket-crafted']",
      )
    )
      actions.append(child);
    else if (child.matches(".gem-recovery")) {
      const recoverButton = child.querySelector(".gem-recover");
      const recoveryAction = element("section", "gem-recovery");
      const reason = child.querySelector(".gem-lock");
      if (recoverButton.disabled && reason)
        recoveryAction.append(reason.cloneNode(true));
      recoveryAction.append(recoverButton);
      actions.append(recoveryAction);
      const details = element("details", "gem-details");
      child.className = "gem-recovery-info";
      details.append(element("summary", "", "Recovery preview"), child);
      content.append(details);
    } else content.append(child);
  }
  const warning = actions.querySelector(".gem-replacement-warning");
  if (warning) actions.prepend(warning);
  preview.append(content, actions);
}

function changedStats(parent, title, before = {}, after = {}) {
  const rows = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].filter((key) => (before[key] || 0) !== (after[key] || 0));
  if (!rows.length) return;
  const section = element("section", "gem-stat-changes");
  section.append(element("h3", "", title));
  const table = element("table");
  const head = element("tr");
  for (const label of ["Stat", "Current", "Proposed"])
    head.append(element("th", "", label));
  const thead = element("thead");
  thead.append(head);
  table.append(thead);
  const body = element("tbody");
  for (const key of rows) {
    const row = element("tr");
    const delta = (after[key] || 0) - (before[key] || 0);
    const improves = key === "evade_penalty" ? delta < 0 : delta > 0;
    row.append(
      element("th", "", statName(key)),
      element("td", "", before[key] || 0),
      element(
        "td",
        inactiveStat(key) ? "gem-muted" : improves ? "gem-ready" : "gem-loss",
        after[key] || 0,
      ),
    );
    body.append(row);
  }
  table.append(body);
  section.append(table);
  parent.append(section);
}

export function statDeltaSummary(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .map((stat) => ({
      stat,
      delta: (after[stat] ?? 0) - (before[stat] ?? 0),
    }))
    .filter(({ delta }) => delta !== 0)
    .sort((a, b) => statName(a.stat).localeCompare(statName(b.stat)))
    .map(
      ({ stat, delta }) => `${delta > 0 ? "+" : ""}${delta} ${statName(stat)}`,
    )
    .join(", ");
}

export function showGemWorkshop(
  scene,
  { onClose, preselectedInstanceID = "", initialMode = "socket" } = {},
) {
  if (scene.gemWorkshopState) {
    scene.gemWorkshopState.close();
    if (scene.gemWorkshopState) return scene.gemWorkshopState;
  }
  pauseWorldFor(scene, "gem_workshop");
  const previousFocus = document.activeElement;
  const previousInput = scene.input?.enabled;
  const previousKeyboard = scene.input?.keyboard?.enabled;
  const previousGlobalCapture = scene.input?.keyboard?.manager?.preventDefault;
  scene.input?.keyboard?.resetKeys();
  scene.input?.keyboard?.disableGlobalCapture();
  if (scene.input) scene.input.enabled = false;
  if (scene.input?.keyboard) scene.input.keyboard.enabled = false;
  const root = element("section", "kith-gem-workshop");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "gem-workshop-title");
  root.tabIndex = -1;
  (document.querySelector("#game-ui") || document.body).append(root);
  const menuKeys = menuKeyboard(root);
  let mode = initialMode;
  let selectedGearID = preselectedInstanceID;
  let selectedSocket = -1;
  let selectedGemID = "";
  let selectedRecipeID = "";
  let recipePage = 0;
  let gemPage = 0;
  let busy = false;
  let needsRefresh = false;
  let pendingController = null;
  let closed = false;
  let notice = "";
  let noticeIsError = false;
  let crafted = false;

  const shutdown = () => close(false);
  function close(callOnClose = true) {
    if (closed || (callOnClose && busy)) return;
    closed = true;
    pendingController?.abort();
    window.removeEventListener("keydown", keydown, true);
    menuKeys.destroy();
    root.remove();
    scene.events?.off("shutdown", shutdown);
    scene.gemWorkshopState = null;
    scene.input?.keyboard?.resetKeys();
    if (scene.input?.keyboard && previousKeyboard != null)
      scene.input.keyboard.enabled = previousKeyboard;
    if (previousGlobalCapture === true)
      scene.input?.keyboard?.enableGlobalCapture();
    else if (previousGlobalCapture === false)
      scene.input?.keyboard?.disableGlobalCapture();
    if (scene.input && previousInput != null)
      scene.input.enabled = previousInput;
    resumeWorldFor(scene, "gem_workshop");
    if (previousFocus?.isConnected) previousFocus.focus();
    if (callOnClose) onClose?.();
  }
  scene.gemWorkshopState = { root, close };
  scene.events?.once("shutdown", shutdown);
  for (const event of ["pointerdown", "pointerup", "click", "wheel"])
    root.addEventListener(event, (e) => e.stopPropagation());
  const keydown = (event) => {
    if (!root.contains(event.target)) {
      event.stopImmediatePropagation();
      root.focus({ preventScroll: true });
    }
    if (event.key === "Escape") {
      event.stopImmediatePropagation();
      event.preventDefault();
      close();
      return;
    }
    if (menuKeys.handle(event)) event.stopImmediatePropagation();
  };
  window.addEventListener("keydown", keydown, true);

  async function runAction(action, success, onSuccess, refreshing = false) {
    if (busy || (needsRefresh && !refreshing)) return;
    const gameID = scene.gameState.id;
    const controller = new AbortController();
    pendingController = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const actionFocus = document.activeElement?.dataset.focusKey;
    busy = true;
    notice = refreshing ? "Refreshing inventory…" : "Applying gem change…";
    noticeIsError = false;
    render();
    root.focus({ preventScroll: true });
    let result;
    try {
      result = await action(controller.signal);
    } catch (error) {
      result = {
        error:
          error?.name === "AbortError"
            ? "Request timed out. Refresh inventory to check whether the change completed."
            : error?.message ||
              "Connection interrupted. Refresh inventory before trying again.",
      };
    }
    clearTimeout(timeout);
    pendingController = null;
    if (closed) return;
    if (scene.gameState?.id !== gameID) {
      close(false);
      return;
    }
    busy = false;
    if (!result || result.error) {
      notice = result?.error || "Connection interrupted. Try again.";
      noticeIsError = true;
      needsRefresh = true;
    } else {
      needsRefresh = false;
      scene.gameState = result;
      scene.updateHUD?.();
      notice = success;
      noticeIsError = false;
      onSuccess?.();
      playSFX("sfx_equip");
    }
    render();
    if (!closed) {
      const control = [...root.querySelectorAll("[data-focus-key]")].find(
        (node) => node.dataset.focusKey === actionFocus && !node.disabled,
      );
      (control || root).focus({ preventScroll: true });
    }
  }

  function pagedChoices(
    parent,
    entries,
    page,
    selected,
    role,
    choose,
    setPage,
    label,
  ) {
    const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const nav = element("nav", "gem-pages");
    nav.setAttribute("aria-label", `${label} pages`);
    nav.append(
      button(
        "Previous",
        () => setPage(page - 1),
        `${role}-previous`,
        busy || page === 0,
      ),
      element(
        "span",
        "",
        `${page + 1} / ${pages} · ${entries.length} ${label.toLowerCase()}`,
      ),
      button(
        "Next",
        () => setPage(page + 1),
        `${role}-next`,
        busy || page + 1 === pages,
      ),
    );
    if (pages > 1) parent.append(nav);
    const list = element("div", "gem-choice-list");
    list.dataset.list = role;
    for (const entry of entries.slice(
      page * PAGE_SIZE,
      (page + 1) * PAGE_SIZE,
    )) {
      const row = button(
        "",
        () => choose(entry.id),
        `${role}-${entry.id}`,
        busy,
      );
      row.dataset[role + "Id"] = entry.id;
      row.setAttribute("aria-pressed", String(entry.id === selected));
      row.className = "gem-choice";
      const copy = element("span", "gem-choice-copy");
      copy.append(
        element("strong", "", entry.name),
        element("span", entry.muted ? "gem-muted" : "gem-ready", entry.detail),
      );
      row.append(
        workshopIcon(
          role === "recipe"
            ? { id: entry.output?.gem_id, icon_key: entry.output?.icon_key }
            : entry,
        ),
        copy,
      );
      list.append(row);
    }
    if (!entries.length)
      list.append(
        element("p", "gem-muted", `No ${label.toLowerCase()} available.`),
      );
    parent.append(list);
  }

  function renderRecipe(gs, body) {
    const recipes = recommendedRecipes(gs).map(({ recipe }) => recipe);
    if (!recipes.some((r) => r.id === selectedRecipeID))
      selectedRecipeID = recipes[0]?.id || "";
    const selected = recipes.find((r) => r.id === selectedRecipeID);
    const choices = element("section", "gem-choices");
    choices.append(
      element("h2", "", "Recipe book"),
      element(
        "p",
        "gem-muted",
        `${knownRecipes(gs).length} of ${recipes.length} discovered. Inspect any recipe to learn how to unlock it.`,
      ),
    );
    pagedChoices(
      choices,
      recipes.map((r) => ({
        ...r,
        detail:
          r.known === false
            ? "Undiscovered · inspect for hint"
            : recipeReadiness(r, gs),
        muted: !r.craftable,
      })),
      recipePage,
      selectedRecipeID,
      "recipe",
      (id) => {
        selectedRecipeID = id;
        crafted = false;
        render();
      },
      (page) => {
        recipePage = page;
        render();
      },
      "Recipes",
    );
    const preview = element("section", "gem-preview");
    preview.setAttribute("aria-label", "Recipe preview");
    if (selected) {
      const outputCard = element("div", "gem-item-card");
      const outputCopy = element("div");
      outputCopy.append(
        element("p", "gem-eyebrow", "YOU WILL CREATE"),
        element(
          "h2",
          "",
          `${selected.output.count} × ${selected.output.gem_name}`,
        ),
      );
      outputCard.append(
        workshopIcon({
          id: selected.output.gem_id,
          icon_key: selected.output.icon_key,
        }),
        outputCopy,
      );
      preview.append(outputCard, element("h3", "", selected.name));
      preview.append(
        element(
          "p",
          selected.known === false ? "gem-lock" : "gem-muted",
          selected.known === false
            ? `Undiscovered. ${selected.discovery_hint}`
            : `Discovered · Party level ${selected.required_level || 1} required`,
        ),
      );
      const costs = element("section", "gem-costs");
      costs.append(element("h3", "", "Consumes from your loose gems"));
      for (const input of selected.inputs || []) {
        costs.append(
          element(
            "p",
            (input.owned || 0) >= input.count ? "gem-ready" : "gem-lock",
            `${input.gem_name}: ${input.owned || 0} owned / ${input.count} needed`,
          ),
        );
      }
      preview.append(costs);
      preview.append(element("p", "gem-muted", selected.description));
      preview.append(element("h3", "", "Socket effect per output gem"));
      for (const effect of selected.output.effects || [])
        preview.append(
          element(
            "p",
            "gem-effect",
            `${effect.kind}: +${effect.value} ${statName(effect.stat)}${inactiveStat(effect.stat) ? " · no battle effect yet" : ""}`,
          ),
        );
      preview.append(
        element(
          "p",
          "gem-muted",
          "Created gems go into your bag, ready to socket.",
        ),
      );
      const reason = recipeReadiness(selected, gs);
      preview.append(
        element("p", selected.craftable ? "gem-ready" : "gem-lock", reason),
      );
      const confirm = button(
        busy
          ? "Transmuting…"
          : `Transmute ${selected.output.count} × ${selected.output.gem_name}`,
        () =>
          runAction(
            (signal) => craftGem(scene.gameState.id, selected.id, { signal }),
            `Created ${selected.output.count} × ${selected.output.gem_name}. Ingredients consumed; nothing socketed.`,
            () => {
              selectedGemID = selected.output.gem_id;
              crafted = true;
            },
          ),
        "confirm-recipe",
        busy || needsRefresh || !selected.craftable,
      );
      confirm.className = "gem-confirm";
      preview.append(confirm);
      if (crafted)
        preview.append(
          button(
            "Choose equipment to socket",
            () => {
              mode = "socket";
              render();
            },
            "socket-crafted",
          ),
        );
    }
    pinActions(preview);
    body.append(choices, preview);
  }

  function renderSocket(gs, body) {
    const gear = workshopGear(gs);
    if (!gear.some((i) => i.instance_id === selectedGearID))
      selectedGearID = gear[0]?.instance_id || "";
    const item = gear.find((i) => i.instance_id === selectedGearID);
    if (
      !item?.sockets?.length ||
      selectedSocket < 0 ||
      selectedSocket >= item.sockets.length
    ) {
      selectedSocket = Math.max(0, firstOpenSocket(item));
    }
    const socket = item?.sockets?.[selectedSocket];
    const gems = ownedGems(gs);
    if (!gems.some((gem) => gem.id === selectedGemID)) {
      selectedGemID =
        recommendedGems(gs, item, selectedSocket)[0]?.gem.id ||
        gems.find((gem) => gemChangePreview(item, selectedSocket, gem))?.id ||
        gems[0]?.id ||
        "";
    }
    const gem = gems.find((g) => g.id === selectedGemID);
    const resolved = gemChangePreview(item, selectedSocket, gem);
    const recovery = gemRecoveryPreview(item, selectedSocket);
    const choices = element("section", "gem-choices");
    choices.append(element("h2", "", "Equipment"));
    const label = element("label", "gem-muted", "Item to improve");
    label.htmlFor = "gem-equipment";
    const select = element("select");
    select.id = "gem-equipment";
    select.dataset.focusKey = "equipment";
    select.disabled = busy || !gear.length;
    for (const candidate of gear) {
      const option = element(
        "option",
        "",
        `${candidate.name} · ${candidate.equipped_by || "In bag"}`,
      );
      option.value = candidate.instance_id;
      option.selected = candidate.instance_id === selectedGearID;
      select.append(option);
    }
    select.addEventListener("change", () => {
      selectedGearID = select.value;
      selectedSocket = -1;
      selectedGemID = "";
      gemPage = 0;
      notice = "";
      render();
    });
    const picker = element("div", "gem-equipment-picker");
    picker.append(workshopIcon(item, true), select);
    choices.append(label, picker);
    const socketList = element("div", "gem-socket-list");
    socketList.setAttribute("role", "group");
    socketList.setAttribute("aria-label", "Equipment sockets");
    for (const [index, candidate] of item?.sockets?.entries() || []) {
      const socketChoice = button(
        `Socket ${index + 1}: ${candidate.gem_id ? candidate.gem_name : "Open"}`,
        () => {
          selectedSocket = index;
          selectedGemID = "";
          gemPage = 0;
          notice = "";
          render();
        },
        `socket-${index}`,
        busy,
      );
      socketChoice.dataset.socketIndex = String(index);
      socketChoice.setAttribute(
        "aria-pressed",
        String(index === selectedSocket),
      );
      if (candidate.icon_key)
        socketChoice.prepend(workshopIcon({ icon_key: candidate.icon_key }));
      socketList.append(socketChoice);
    }
    if (!item?.sockets?.length)
      socketList.append(element("p", "gem-muted", "This item has no sockets."));
    choices.append(socketList, element("h2", "", "Loose gems"));
    pagedChoices(
      choices,
      gems.map((g) => {
        const option = gemChangePreview(item, selectedSocket, g);
        const delta = statDeltaSummary(option?.before, option?.after);
        return {
          ...g,
          name: `${g.name} × ${g.count}`,
          detail: option?.allowed
            ? `${option.action === "replace" ? `Replace ${option.installed_gem_name} · ` : ""}${delta || "No stat change"} · ${option.gold_cost} gold`
            : option?.block_reason ||
              (socket?.gem_id === g.id
                ? "Already installed in this socket"
                : "Choose compatible equipment"),
          muted: !option?.allowed,
        };
      }),
      gemPage,
      selectedGemID,
      "gem",
      (id) => {
        selectedGemID = id;
        render();
      },
      (page) => {
        gemPage = page;
        render();
      },
      "Gems",
    );
    const preview = element("section", "gem-preview");
    preview.setAttribute("aria-label", "Socket preview");
    preview.append(element("p", "gem-eyebrow", "RESULT PREVIEW"));
    if (!item) {
      preview.append(
        element("h2", "", "No socketed equipment yet"),
        element(
          "p",
          "gem-muted",
          "Find equipment with an open socket, then return here.",
        ),
      );
    } else {
      preview.append(element("h2", "", item.name));
      if (gem && resolved?.allowed) {
        const replacing = resolved.action === "replace";
        preview.append(
          element(
            "h3",
            replacing ? "" : "gem-selected-name",
            `${replacing ? "Replacement" : "Proposed"}: ${gem.name}`,
          ),
          element(
            "p",
            "gem-muted",
            replacing
              ? `Uses 1 ${gem.name}. Replaces ${resolved.installed_gem_name}.`
              : `Uses 1 ${gem.name} · Socket ${resolved.socket + 1}`,
          ),
          element(
            "p",
            resolved.gold_cost ? "gem-lock" : "gem-ready",
            resolved.gold_cost
              ? `Workshop fee: ${resolved.gold_cost} gold · ${resolved.gold_before} → ${resolved.gold_after} gold`
              : `No workshop fee · ${resolved.gold_before} gold remains`,
          ),
        );
        changedStats(
          preview,
          "Equipment values",
          resolved.before,
          resolved.after,
        );
        const details = element("details", "gem-details");
        details.append(element("summary", "", "Character stat breakdown"));
        changedStats(
          details,
          `${item.equipped_by || "Character"} · total from gear`,
          resolved.gear_before,
          resolved.gear_after,
        );
        changedStats(
          details,
          `${item.equipped_by || "Character"} · effective values`,
          resolved.character_before,
          resolved.character_after,
        );
        preview.append(details);
        if (replacing)
          preview.append(
            element(
              "p",
              "gem-lock gem-replacement-warning",
              `The installed ${resolved.installed_gem_name} will be destroyed. Recover it first to keep it.`,
            ),
          );
      } else
        preview.append(
          element(
            "p",
            "gem-lock",
            resolved?.block_reason ||
              (socket?.gem_id
                ? "Choose a different owned gem to preview replacement."
                : "Choose an owned, compatible gem to preview its effect."),
          ),
        );
      const confirm = button(
        busy
          ? "Applying…"
          : resolved?.action === "replace"
            ? `Replace with ${gem?.name || "gem"} · ${resolved?.gold_cost || 0} gold`
            : `Socket ${gem?.name || "gem"} into ${item.name}`,
        () => {
          if (!resolved?.allowed || !gem) return;
          runAction(
            (signal) =>
              changeGem(
                scene.gameState.id,
                resolved.action,
                item.instance_id,
                resolved.socket,
                gem.id,
                resolved.token,
                { signal },
              ),
            resolved.action === "replace"
              ? `${resolved.installed_gem_name} replaced with ${gem.name} in ${item.name}.`
              : `${gem.name} socketed into ${item.name}.`,
            () => {
              selectedGemID = "";
              crafted = false;
            },
          );
        },
        "confirm-socket",
        busy || needsRefresh || !resolved?.allowed || !resolved?.token,
      );
      confirm.className = "gem-confirm";
      confirm.hidden = !!recovery && !resolved?.allowed;
      preview.append(confirm);

      if (recovery) {
        const recover = element("section", "gem-recovery");
        recover.append(
          element("h3", "", `Recover ${recovery.installed_gem_name}`),
          element(
            "p",
            "gem-muted",
            `Returns exactly 1 ${recovery.installed_gem_name} to your loose gems and leaves socket ${selectedSocket + 1} open.`,
          ),
          element(
            "p",
            "gem-lock",
            recovery.allowed
              ? `Workshop fee: ${recovery.gold_cost} gold · ${recovery.gold_before} → ${recovery.gold_after} gold`
              : recovery.block_reason,
          ),
        );
        if (recovery.allowed) {
          changedStats(
            recover,
            "Equipment after recovery",
            recovery.before,
            recovery.after,
          );
          changedStats(
            recover,
            `${item.equipped_by || "Character"} · effective after recovery`,
            recovery.character_before,
            recovery.character_after,
          );
        }
        const recoverButton = button(
          busy
            ? "Recovering…"
            : `Recover ${recovery.installed_gem_name} · ${recovery.gold_cost} gold`,
          () =>
            runAction(
              (signal) =>
                changeGem(
                  scene.gameState.id,
                  recovery.action,
                  item.instance_id,
                  recovery.socket,
                  "",
                  recovery.token,
                  { signal },
                ),
              `${recovery.installed_gem_name} recovered from ${item.name}.`,
              () => {
                selectedGemID = recovery.installed_gem_id;
                crafted = false;
              },
            ),
          `recover-${selectedSocket}`,
          busy || needsRefresh || !recovery.allowed || !recovery.token,
        );
        recoverButton.className = "gem-recover";
        recover.append(recoverButton);
        preview.append(recover);
      }
    }
    pinActions(preview);
    body.append(choices, preview);
  }

  function render() {
    if (closed) return;
    const focusKey = root.contains(document.activeElement)
      ? document.activeElement.dataset.focusKey
      : "";
    const scroll = root.querySelector(".gem-body")?.scrollTop || 0;
    const gs = scene.gameState;
    root.replaceChildren();
    root.dataset.mode = mode;
    const header = element("header", "gem-header");
    const title = element("h1", "", "Gem Workshop");
    title.id = "gem-workshop-title";
    header.append(title, button("Close", close, "close", busy));
    root.append(header);
    const tabs = element("nav", "gem-tabs");
    tabs.setAttribute("aria-label", "Workshop actions");
    for (const [id, label] of [
      ["socket", "Socket gems"],
      ["transmute", `Transmute · ${craftableRecipeCount(gs)} ready`],
    ]) {
      const tab = button(
        label,
        () => {
          mode = id;
          render();
        },
        `mode-${id}`,
        busy,
      );
      tab.setAttribute("aria-pressed", String(mode === id));
      tabs.append(tab);
    }
    root.append(tabs);
    if (notice) {
      const status = element(
        "p",
        noticeIsError ? "gem-notice is-error" : "gem-notice",
        notice,
      );
      status.setAttribute("role", noticeIsError ? "alert" : "status");
      if (noticeIsError)
        status.append(
          button(
            "Refresh inventory",
            () =>
              runAction(
                (signal) => getGame(scene.gameState.id, { signal }),
                "Inventory refreshed. Review your selection before confirming.",
                undefined,
                true,
              ),
            "refresh",
            busy,
          ),
        );
      root.append(status);
    }
    const body = element("div", "gem-body");
    if (mode === "transmute") renderRecipe(gs, body);
    else renderSocket(gs, body);
    root.append(body);
    if (busy)
      root.querySelectorAll("summary").forEach((summary) => {
        summary.tabIndex = -1;
      });
    body.scrollTop = scroll;
    if (focusKey) {
      const focused = [...root.querySelectorAll("[data-focus-key]")].find(
        (n) => n.dataset.focusKey === focusKey && !n.disabled,
      );
      (focused || root).focus({ preventScroll: true });
    }
  }
  render();
  root.focus();
  return scene.gemWorkshopState;
}
