import { resolveBattleLoot } from "../api.js";
import { element, viewportDialog } from "../ui/viewport_dialog.js";
import "../styles/post-battle-loot.css";

const STAT_ORDER = [
  "attack",
  "power",
  "absorb",
  "evade",
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
  power: "Power",
  absorb: "Absorb",
  evade: "Evasion",
  str: "Strength",
  agi: "Agility",
  int: "Intellect",
  vit: "Vitality",
  lck: "Luck",
  hit_pct: "Hit",
  crit_pct: "Crit",
  spell_damage_pct: "Spell damage",
  magic_defense: "Magic Defense",
  evade_penalty: "Evade penalty",
};

export const BATTLE_LOOT_REQUEST_TIMEOUT_MS = 15_000;

export async function withBattleLootDeadline(
  request,
  timeoutMs = BATTLE_LOOT_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error("Battle loot request timed out");
      error.name = "AbortError";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function pendingEquipmentDrops(gameState) {
  return (gameState?.battle_rewards?.drops || []).filter(
    (drop) =>
      drop.kind === "equipment" &&
      drop.decision === "pending" &&
      drop.instance_id,
  );
}

export function comparisonRows(option = {}) {
  const deltas = option.deltas || {};
  const keys = [...new Set([...STAT_ORDER, ...Object.keys(deltas)])];
  return keys
    .filter((key) => (Number(deltas[key]) || 0) !== 0)
    .map((key) => ({
      key,
      label: STAT_LABELS[key] || key.replaceAll("_", " "),
      before: Number(option.before?.[key]) || 0,
      after: Number(option.after?.[key]) || 0,
      delta: Number(deltas[key]) || 0,
    }));
}

export function equipmentDropDetails(drop = {}) {
  const item = drop.item || {};
  const details = [];
  if (item.rarity) details.push(item.rarity);
  if (item.item_level) details.push(`Item level ${item.item_level}`);
  if (item.category) details.push(item.category.replaceAll("_", " "));
  return details;
}

function itemIcon(item = {}) {
  const frame = element("div", "battle-loot-icon");
  frame.setAttribute("aria-hidden", "true");
  if (!item.icon_key) {
    frame.textContent = (item.name || "?").slice(0, 1).toUpperCase();
    return frame;
  }
  const image = document.createElement("img");
  image.src = `/sprites/items/${item.icon_key}.png`;
  image.alt = "";
  image.addEventListener("error", () => {
    image.remove();
    frame.textContent = (item.name || "?").slice(0, 1).toUpperCase();
  });
  frame.append(image);
  return frame;
}

function itemStatChips(item = {}) {
  const rows = itemStatRows(item);
  if (rows.length === 0) return null;
  const list = element("ul", "battle-loot-item-stats");
  for (const row of rows) {
    list.append(
      element("li", "", `${row.label} ${row.value > 0 ? "+" : ""}${row.value}`),
    );
  }
  return list;
}

export function itemStatRows(item = {}) {
  const stats = { ...(item.stats || {}) };
  if (item.power && stats.power == null) stats.power = item.power;
  if (item.absorb && stats.absorb == null) stats.absorb = item.absorb;
  const keys = [...new Set([...STAT_ORDER, ...Object.keys(stats)])].filter(
    (key) => (Number(stats[key]) || 0) !== 0,
  );
  return keys.map((key) => ({
    key,
    label: STAT_LABELS[key] || key.replaceAll("_", " "),
    value: Number(stats[key]) || 0,
  }));
}

function renderItemSummary(drop) {
  const item = drop.item || {};
  const summary = element("section", "battle-loot-item-summary");
  summary.append(itemIcon(item));
  const copy = element("div", "battle-loot-item-copy");
  copy.append(
    element("p", "battle-loot-kicker", "BATTLE DROP · ONE EXACT ROLL"),
  );
  copy.append(element("h2", "", drop.name || item.name || "New equipment"));
  const details = equipmentDropDetails(drop);
  if (details.length)
    copy.append(element("p", "battle-loot-meta", details.join(" · ")));
  if (item.affixes?.length) {
    copy.append(
      element(
        "p",
        "battle-loot-affixes",
        item.affixes
          .map(
            (affix) =>
              `${affix.name} (${affix.value > 0 ? "+" : ""}${affix.value} ${STAT_LABELS[affix.stat] || affix.stat})`,
          )
          .join(" · "),
      ),
    );
  }
  const openSockets = (item.sockets || []).filter(
    (socket) => !socket.gem_id,
  ).length;
  if (item.sockets?.length) {
    copy.append(
      element(
        "p",
        "battle-loot-sockets",
        `${openSockets} open of ${item.sockets.length} socket${item.sockets.length === 1 ? "" : "s"}`,
      ),
    );
  }
  const stats = itemStatChips(item);
  if (stats) copy.append(stats);
  summary.append(copy);
  return summary;
}

function renderComparison(option, choose) {
  const card = element("article", "battle-loot-comparison");
  const heading = element("div", "battle-loot-comparison-heading");
  const identity = element("div");
  identity.append(
    element("h3", "", option.character_name || "Party member"),
    element(
      "p",
      "",
      `${option.class_name || "Class"} · ${option.equipment_slot_name || "Equipment"}`,
    ),
  );
  heading.append(identity);
  card.append(heading);
  card.append(
    element(
      "p",
      "battle-loot-current",
      `Current: ${option.current_item_name || "Nothing equipped"}`,
    ),
  );

  const rows = comparisonRows(option);
  const list = element("ul", "battle-loot-deltas");
  if (rows.length === 0) {
    list.append(element("li", "is-neutral", "No effective stat change"));
  } else {
    for (const row of rows) {
      const entry = element("li", row.delta > 0 ? "is-up" : "is-down");
      entry.append(
        element("span", "", row.label),
        element(
          "span",
          "battle-loot-before-after",
          `${row.before} → ${row.after}`,
        ),
        element("strong", "", `${row.delta > 0 ? "+" : ""}${row.delta}`),
      );
      list.append(entry);
    }
  }
  card.append(list);

  const button = element(
    "button",
    "primary battle-loot-equip",
    `Equip Now · ${option.character_name} · ${option.equipment_slot_name}`,
  );
  button.type = "button";
  button.addEventListener("click", () => choose(option));
  card.append(button);
  return card;
}

export function showPostBattleLoot(
  scene,
  initialState,
  { onComplete, requestTimeoutMs = BATTLE_LOOT_REQUEST_TIMEOUT_MS } = {},
) {
  scene.postBattleLootDialog?.dispose();
  let state = initialState;
  const total = pendingEquipmentDrops(state).length;
  let keepButton = null;
  let status = null;
  let busy = false;

  const dialog = viewportDialog(scene, {
    key: "post-battle-loot",
    title: "New Equipment",
    onEscape: () => {
      if (status) {
        status.textContent = "Choose Equip Now or Keep in inventory.";
        status.classList.remove("is-error");
      }
      keepButton?.focus();
    },
  });
  scene.postBattleLootDialog = dialog;
  dialog.root.classList.add("post-battle-loot-dialog");
  const progress = element("p", "battle-loot-progress");
  dialog.header.append(progress);

  const finish = (latest) => {
    scene.gameState = latest;
    scene.postBattleLootDialog = null;
    dialog.dispose();
    onComplete?.(latest);
  };

  const setBusy = (value) => {
    busy = value;
    for (const button of dialog.root.querySelectorAll("button")) {
      button.disabled = value;
    }
  };

  const decide = async (drop, action, option = null) => {
    if (busy) return;
    setBusy(true);
    status.textContent =
      action === "keep"
        ? "Keeping the exact roll…"
        : "Equipping the exact roll…";
    status.classList.remove("is-error");
    try {
      const latest = await withBattleLootDeadline(
        (signal) =>
          resolveBattleLoot(
            state.id,
            drop.instance_id,
            action,
            option?.party_slot || 0,
            option?.equipment_slot || "",
            drop.decision_token,
            { signal },
          ),
        requestTimeoutMs,
      );
      if (latest?.error) {
        if (latest.state?.id === state.id) {
          state = latest.state;
          scene.gameState = state;
          setBusy(false);
          render();
          status.textContent = latest.error;
          status.classList.add("is-error");
          return;
        }
        status.textContent = latest.error;
        status.classList.add("is-error");
        setBusy(false);
        return;
      }
      state = latest;
      scene.gameState = latest;
      if (pendingEquipmentDrops(state).length === 0) {
        finish(state);
        return;
      }
      setBusy(false);
      render();
    } catch (error) {
      status.textContent =
        error?.name === "AbortError"
          ? "Request timed out. The choice may have completed on the server. Retry the same action to reconcile safely."
          : `Could not save that choice. ${error?.message || "Try again."}`;
      status.classList.add("is-error");
      setBusy(false);
    }
  };

  const render = () => {
    const pending = pendingEquipmentDrops(state);
    if (pending.length === 0) {
      finish(state);
      return;
    }
    const drop = pending[0];
    const itemNumber = total - pending.length + 1;
    progress.textContent = `Equipment decision ${itemNumber} of ${total} · Already secured in inventory`;
    dialog.body.replaceChildren();
    dialog.footer.replaceChildren();
    dialog.body.append(renderItemSummary(drop));

    const comparisonHeader = element("div", "battle-loot-section-heading");
    comparisonHeader.append(
      element("h2", "", "Party comparison"),
      element(
        "p",
        "",
        "Only members and slots that can equip this roll are shown.",
      ),
    );
    dialog.body.append(comparisonHeader);
    const comparisons = element("div", "battle-loot-comparisons");
    for (const option of drop.equip_options || []) {
      comparisons.append(
        renderComparison(option, (selected) => decide(drop, "equip", selected)),
      );
    }
    if (!drop.equip_options?.length) {
      comparisons.append(
        element(
          "p",
          "battle-loot-no-options",
          "No current party member can equip this item yet. Keeping it will preserve the exact roll.",
        ),
      );
    }
    dialog.body.append(comparisons);

    status = element("p", "dialog-status battle-loot-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = element("div", "dialog-actions");
    keepButton = element("button", "battle-loot-keep", "Keep in Inventory");
    keepButton.type = "button";
    keepButton.addEventListener("click", () => decide(drop, "keep"));
    actions.append(keepButton);
    dialog.footer.append(status, actions);
    requestAnimationFrame(() =>
      (dialog.body.querySelector(".battle-loot-equip") || keepButton).focus({
        preventScroll: true,
      }),
    );
  };

  render();
  return dialog;
}
