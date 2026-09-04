import { craftGem, getGame, socketGem } from "../api.js";
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
  const resolved = item?.socket_previews?.find(
    (preview) => preview.gem_id === gem?.id,
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

function maxPartyLevel(gs) {
  return Math.max(1, ...(gs?.party || []).map((member) => member?.level || 1));
}

export function recommendedGems(gs, item) {
  const level = maxPartyLevel(gs);
  return ownedGems(gs)
    .map((gem) => ({ gem, preview: socketPreview(item, gem, gs) }))
    .filter(({ gem, preview }) => preview && (gem.required_level || 1) <= level)
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
    row.append(
      element("th", "", statName(key)),
      element("td", "", before[key] || 0),
      element("td", "", after[key] || 0),
    );
    body.append(row);
  }
  table.append(body);
  section.append(table);
  parent.append(section);
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
  scene.input?.keyboard?.resetKeys();
  if (scene.input) scene.input.enabled = false;
  if (scene.input?.keyboard) scene.input.keyboard.enabled = false;
  const root = element("section", "kith-gem-workshop");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "gem-workshop-title");
  root.tabIndex = -1;
  (document.querySelector("#game-ui") || document.body).append(root);
  let mode = initialMode;
  let selectedGearID = preselectedInstanceID;
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
    root.remove();
    scene.events?.off("shutdown", shutdown);
    scene.gemWorkshopState = null;
    scene.input?.keyboard?.resetKeys();
    if (scene.input?.keyboard && previousKeyboard != null)
      scene.input.keyboard.enabled = previousKeyboard;
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
    event.stopImmediatePropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...root.querySelectorAll("button:not(:disabled), select:not(:disabled)"),
    ];
    const first = controls[0],
      last = controls.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === root)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === root)
    ) {
      event.preventDefault();
      first?.focus();
    }
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
    parent.append(nav);
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
      row.append(
        element("strong", "", entry.name),
        element("span", entry.muted ? "gem-muted" : "gem-ready", entry.detail),
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
      preview.append(
        element(
          "p",
          "gem-eyebrow",
          "Preview · ingredients are only spent on confirmation",
        ),
        element("h2", "", selected.name),
      );
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
      preview.append(
        element("h3", "", "Creates"),
        element(
          "p",
          "gem-output",
          `${selected.output.count} × ${selected.output.gem_name}`,
        ),
        element("p", "gem-muted", selected.description),
      );
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
          "The output stays in your bag. Socketing is a separate action.",
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
    body.append(choices, preview);
  }

  function renderSocket(gs, body) {
    const gear = workshopGear(gs);
    if (!gear.some((i) => i.instance_id === selectedGearID))
      selectedGearID = gear[0]?.instance_id || "";
    const item = gear.find((i) => i.instance_id === selectedGearID);
    const gems = ownedGems(gs);
    if (!gems.some((g) => g.id === selectedGemID))
      selectedGemID = recommendedGems(gs, item)[0]?.gem.id || gems[0]?.id || "";
    const gem = gems.find((g) => g.id === selectedGemID);
    const choices = element("section", "gem-choices");
    choices.append(element("h2", "", "1. Choose equipment"));
    const label = element("label", "gem-muted", "Equipment and equipped owner");
    label.htmlFor = "gem-equipment";
    const select = element("select");
    select.id = "gem-equipment";
    select.dataset.focusKey = "equipment";
    select.disabled = busy || !gear.length;
    for (const candidate of gear) {
      const option = element(
        "option",
        "",
        `${candidate.name} · ${candidate.equipped_by ? `${candidate.equipped_by}, ${candidate.equipped_kind}` : "In bag"} · ${candidate.sockets.filter((s) => !s.gem_id).length} open`,
      );
      option.value = candidate.instance_id;
      option.selected = candidate.instance_id === selectedGearID;
      select.append(option);
    }
    select.addEventListener("change", () => {
      selectedGearID = select.value;
      selectedGemID = "";
      gemPage = 0;
      notice = "";
      render();
    });
    choices.append(label, select, element("h2", "", "2. Choose a loose gem"));
    pagedChoices(
      choices,
      gems.map((g) => {
        const option = item?.socket_previews?.find((p) => p.gem_id === g.id);
        const effect = gemEffectForItem(g, item);
        return {
          ...g,
          name: `${g.name} × ${g.count}`,
          detail: option?.allowed
            ? `+${effect?.value || 0} ${statName(effect?.stat)}`
            : option?.block_reason ||
              (firstOpenSocket(item) < 0
                ? "No open socket"
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
    preview.append(
      element("p", "gem-eyebrow", "3. Review · select first, confirm below"),
    );
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
      preview.append(
        element("h2", "", item.name),
        element(
          "p",
          "gem-muted",
          item.equipped_by
            ? `${item.equipped_by} · ${item.equipped_kind}`
            : "In your bag",
        ),
      );
      preview.append(element("h3", "", "Current sockets"));
      for (const [index, socket] of item.sockets.entries())
        preview.append(
          element(
            "p",
            "gem-effect",
            `Socket ${index + 1}: ${socket.gem_id ? `${socket.gem_name} · +${socket.value} ${statName(socket.stat)}` : "Open"}`,
          ),
        );
      const resolved = item.socket_previews?.find(
        (p) => p.gem_id === selectedGemID,
      );
      if (gem && resolved?.allowed) {
        preview.append(
          element("h3", "", `Proposed: ${gem.name}`),
          element(
            "p",
            "gem-muted",
            `Consumes 1 loose ${gem.name} (${gem.count} owned). Fills socket ${resolved.socket + 1}.`,
          ),
        );
        changedStats(
          preview,
          "Equipment values",
          resolved.before,
          resolved.after,
        );
        changedStats(
          preview,
          `${item.equipped_by || "Character"} · total from gear`,
          resolved.gear_before,
          resolved.gear_after,
        );
        changedStats(
          preview,
          `${item.equipped_by || "Character"} · effective values`,
          resolved.character_before,
          resolved.character_after,
        );
        preview.append(
          element(
            "p",
            "gem-lock",
            "Socketing is permanent. This gem cannot be removed or recovered.",
          ),
        );
      } else
        preview.append(
          element(
            "p",
            "gem-lock",
            firstOpenSocket(item) < 0
              ? "All sockets filled. Choose another item."
              : resolved?.block_reason ||
                  "Choose an owned, compatible gem to preview its effect.",
          ),
        );
      const confirm = button(
        busy ? "Socketing…" : `Socket ${gem?.name || "gem"} into ${item.name}`,
        () => {
          if (!resolved?.allowed || !gem) return;
          runAction(
            (signal) =>
              socketGem(
                scene.gameState.id,
                item.instance_id,
                resolved.socket,
                gem.id,
                { signal },
              ),
            `${gem.name} socketed into ${item.name}.`,
            () => {
              crafted = false;
            },
          );
        },
        "confirm-socket",
        busy || needsRefresh || !resolved?.allowed,
      );
      confirm.className = "gem-confirm";
      preview.append(confirm);
    }
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
