import { craftGem, socketGem } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { drawButton, drawPanel } from "../ui/panel.js";

const DEPTH = 71;
const PANEL = { x: 400, y: 300, width: 760, height: 540 };
const COLORS = {
  gold: "#fff1a8",
  text: "#eef7ff",
  muted: "#91a6c8",
  active: "#8ed7ff",
  good: "#8ff0a4",
  bad: "#ef9696",
  warning: "#ffd27d",
};

function itemKind(item) {
  if (item?.kind) return item.kind;
  return String(item?.id || "").startsWith("arm_") ? "armor" : "weapon";
}

function equippedGear(gs) {
  const result = [];
  for (let slot = 0; slot < (gs?.equipment || []).length; slot += 1) {
    const equip = gs.equipment[slot] || {};
    const owner = gs?.party?.[slot]?.name || `Party ${slot + 1}`;
    if (equip.weapon_item?.instance_id) {
      result.push({
        ...equip.weapon_item,
        equipped_slot: slot,
        equipped_by: owner,
        equipped_kind: "Weapon",
      });
    }
    if (equip.armor_item?.instance_id) {
      result.push({
        ...equip.armor_item,
        equipped_slot: slot,
        equipped_by: owner,
        equipped_kind: "Armor",
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

export function knownRecipes(gs) {
  if (!Array.isArray(gs?.gem_recipes)) return [];
  return gs.gem_recipes.filter((recipe) => recipe?.id);
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

export function socketPreview(item, gem, gs = {}) {
  const effect = gemEffectForItem(gem, item);
  if (!item || !gem || !effect) return null;
  const kind = itemKind(item);
  const current = kind === "armor" ? item.absorb || 0 : item.power || 0;
  const after = current + effect.value;
  const stat = kind === "armor" ? "Absorb" : "Power";
  const owner = item.equipped_by || "";
  const member = Number.isInteger(item.equipped_slot)
    ? gs?.party?.[item.equipped_slot]
    : null;
  const characterCurrent =
    kind === "weapon" && member ? (member.str || 0) + current : current;
  const characterAfter = characterCurrent + effect.value;
  return {
    kind,
    stat,
    current,
    after,
    delta: effect.value,
    owner,
    characterLabel:
      owner && kind === "weapon"
        ? `${owner} ATK`
        : owner
          ? `${owner} Absorb`
          : "",
    characterCurrent,
    characterAfter,
    better: effect.value > 0,
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
  return "Ready to refine";
}

export function recommendedRecipes(gs) {
  const level = maxPartyLevel(gs);
  return knownRecipes(gs)
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

function addText(scene, group, x, y, text, style = {}) {
  const node = scene.add
    .text(x, y, text, {
      fontSize: "11px",
      color: COLORS.text,
      fontFamily: "Trebuchet MS",
      ...style,
    })
    .setScrollFactor(0)
    .setDepth(DEPTH);
  group.push(node);
  return node;
}

function addPanel(scene, group, x, y, width, height) {
  const panel = scene.add
    .rectangle(x + width / 2, y + height / 2, width, height, 0x102442, 0.9)
    .setStrokeStyle(1, 0x638fc5)
    .setScrollFactor(0)
    .setDepth(DEPTH - 1);
  group.push(panel);
  return panel;
}

function drawWorkshopFrame(scene, overlay, onClose) {
  const panel = drawPanel(scene, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
    depth: DEPTH - 3,
    interactive: true,
    variant: "ff6",
  });
  overlay.push(panel.bg);
  addText(scene, overlay, 50, 48, "GEM WORKSHOP", {
    fontSize: "22px",
    fontStyle: "bold",
    fontFamily: "Georgia",
    color: COLORS.gold,
  });
  const subtitle = addText(
    scene,
    overlay,
    50,
    76,
    "Choose first. Review the exact result. Confirm only when it looks right.",
    { color: COLORS.muted },
  );
  const close = drawButton(scene, 684, 544, 136, 32, "CLOSE", onClose, {
    depth: DEPTH,
    fontSize: "11px",
    fontStyle: "bold",
    fill: 0x1b3660,
    fillHover: 0x27538a,
    stroke: 0xb6d2ff,
    strokeWidth: 2,
  });
  overlay.push(close);
  return { subtitle };
}

function drawChoiceRow(
  scene,
  group,
  x,
  y,
  width,
  height,
  label,
  { selected = false, muted = false, onClick, meta } = {},
) {
  const fill = selected ? 0x2d5a93 : muted ? 0x11182b : 0x172f55;
  const stroke = selected ? 0xf4d881 : muted ? 0x3e536f : 0x6b9bd5;
  const bg = scene.add
    .rectangle(x + width / 2, y + height / 2, width, height, fill, 0.98)
    .setStrokeStyle(1, stroke)
    .setScrollFactor(0)
    .setDepth(DEPTH);
  bg.gemWorkshopMeta = meta || null;
  const text = addText(scene, group, x + 10, y + height / 2, label, {
    fontSize: "10px",
    color: muted ? COLORS.muted : COLORS.text,
    wordWrap: { width: width - 18 },
  }).setOrigin(0, 0.5);
  group.push(bg);
  if (onClick) {
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerover", () => bg.setFillStyle(0x21406e, 0.98));
    bg.on("pointerout", () =>
      bg.setFillStyle(selected ? 0x2d5a93 : muted ? 0x11182b : 0x172f55, 0.98),
    );
    bg.on("pointerup", onClick);
  }
  return bg;
}

function clearGroup(group) {
  for (const object of group.splice(0)) object.destroy();
}

function addTabs(scene, group, mode, gs, setMode) {
  const ready = craftableRecipeCount(gs);
  const socketTab = drawButton(
    scene,
    264,
    112,
    210,
    34,
    "SOCKET GEMS",
    () => setMode("socket"),
    { depth: DEPTH, fontStyle: "bold" },
  );
  socketTab.setActive(mode === "socket");
  const refineTab = drawButton(
    scene,
    500,
    112,
    242,
    34,
    ready > 0 ? `REFINE  •  ${ready} READY` : "REFINE RECIPES",
    () => setMode("refine"),
    { depth: DEPTH, fontStyle: "bold" },
  );
  refineTab.setActive(mode === "refine");
  group.push(socketTab, refineTab);
}

function renderSocketMode(scene, group, state) {
  const { gs, selectedGearID, selectedGemID, selectGear, selectGem, confirm } =
    state;
  const gear = workshopGear(gs);
  const gems = ownedGems(gs);
  const selectedItem = gear.find((item) => item.instance_id === selectedGearID);
  const selectedGem = gems.find((gem) => gem.id === selectedGemID);
  const selectedSocket = firstOpenSocket(selectedItem);
  const recommendations =
    selectedSocket >= 0 ? recommendedGems(gs, selectedItem) : [];
  const bestGemID = recommendations[0]?.gem?.id || "";
  const justCrafted =
    !!selectedGem && selectedGem.id === state.justCraftedGemID;

  addText(scene, group, 48, 148, "1  CHOOSE EQUIPMENT", {
    fontSize: "12px",
    fontStyle: "bold",
    color: COLORS.gold,
  });
  addPanel(scene, group, 46, 168, 244, 330);
  if (gear.length === 0) {
    addText(scene, group, 60, 190, "No equipment has an open socket.", {
      color: COLORS.muted,
      wordWrap: { width: 215 },
    });
  }
  gear.slice(0, 7).forEach((item, index) => {
    const open = item.sockets.filter((socket) => !socket.gem_id).length;
    const owner = item.equipped_by ? ` • ${item.equipped_by}` : " • Inventory";
    const socketStatus = open > 0 ? `${open} OPEN` : "SOCKETED";
    drawChoiceRow(
      scene,
      group,
      56,
      180 + index * 42,
      224,
      36,
      `${item.name}\n${socketStatus}${owner}`,
      {
        selected: item.instance_id === selectedGearID,
        onClick: () => selectGear(item.instance_id),
        meta: { role: "gear", id: item.instance_id },
      },
    );
  });

  addText(scene, group, 306, 148, "2  CHOOSE A GEM", {
    fontSize: "12px",
    fontStyle: "bold",
    color: COLORS.gold,
  });
  addPanel(scene, group, 304, 168, 186, 330);
  if (gems.length === 0) {
    addText(scene, group, 318, 190, "No gems owned yet.", {
      color: COLORS.muted,
    });
  }
  gems.slice(0, 7).forEach((gem, index) => {
    const preview = socketPreview(selectedItem, gem, gs);
    const levelLocked = (gem.required_level || 1) > maxPartyLevel(gs);
    const socketFilled = selectedItem && selectedSocket < 0;
    const best = gem.id === bestGemID;
    const delta = !selectedItem
      ? "Choose equipment"
      : socketFilled
        ? "Socket already filled"
        : preview
          ? `+${preview.delta} ${preview.stat}`
          : "Not compatible";
    drawChoiceRow(
      scene,
      group,
      314,
      180 + index * 42,
      166,
      36,
      `${best ? "★ " : ""}${gem.name}  x${gem.count}\n${levelLocked ? `Lv.${gem.required_level} required` : delta}`,
      {
        selected: gem.id === selectedGemID,
        muted: !selectedItem || socketFilled || !preview || levelLocked,
        onClick:
          !socketFilled && preview && !levelLocked
            ? () => selectGem(gem.id)
            : null,
        meta: { role: "gem", id: gem.id },
      },
    );
  });

  addText(scene, group, 506, 148, "3  REVIEW & CONFIRM", {
    fontSize: "12px",
    fontStyle: "bold",
    color: COLORS.gold,
  });
  addPanel(scene, group, 504, 168, 248, 330);
  renderSocketPreview(
    scene,
    group,
    gs,
    selectedItem,
    selectedGem,
    bestGemID,
    justCrafted,
  );
  const preview =
    selectedSocket >= 0 ? socketPreview(selectedItem, selectedGem, gs) : null;
  const confirmButton = drawButton(
    scene,
    628,
    476,
    214,
    38,
    state.busy
      ? "WORKING..."
      : selectedItem && selectedSocket < 0
        ? "SOCKET FILLED"
        : justCrafted
          ? `SOCKET ${selectedGem.name.toUpperCase()} NOW`
          : "CONFIRM & SOCKET",
    confirm,
    {
      depth: DEPTH,
      fontStyle: "bold",
      fill: 0x1f5d48,
      fillHover: 0x2b7d62,
      stroke: 0xa5f0c8,
    },
  );
  confirmButton.setEnabled(!!preview && !state.busy);
  group.push(confirmButton);
}

function renderSocketPreview(
  scene,
  group,
  gs,
  item,
  gem,
  bestGemID,
  justCrafted,
) {
  if (!item) {
    addText(scene, group, 520, 190, "Choose equipment to see its sockets.", {
      color: COLORS.muted,
      wordWrap: { width: 215 },
    });
    return;
  }
  addText(scene, group, 520, 186, item.name, {
    fontSize: "14px",
    fontStyle: "bold",
    color: COLORS.text,
    wordWrap: { width: 215 },
  });
  addText(
    scene,
    group,
    520,
    218,
    item.equipped_by
      ? `Equipped by ${item.equipped_by} • ${item.equipped_kind}`
      : "Currently in inventory",
    { fontSize: "10px", color: COLORS.active },
  );
  addText(
    scene,
    group,
    520,
    240,
    `Current: ${item.sockets.map((socket) => (socket.gem_id ? "◆" : "◇")).join("  ")}  ${firstOpenSocket(item) >= 0 ? "OPEN" : "SOCKETED"}`,
    { fontSize: "14px", color: COLORS.gold },
  );
  if (firstOpenSocket(item) < 0) {
    const filled = item.sockets.filter((socket) => socket.gem_id);
    addText(scene, group, 520, 282, "✓ SOCKET APPLIED", {
      fontSize: "11px",
      fontStyle: "bold",
      color: COLORS.good,
    });
    filled.forEach((socket, index) => {
      const stat = socket.stat === "absorb" ? "Absorb" : "Power";
      addText(
        scene,
        group,
        520,
        310 + index * 25,
        `◆ ${socket.gem_name}   +${socket.value} ${stat}`,
        { fontSize: "12px", fontStyle: "bold", color: COLORS.good },
      );
    });
    addText(
      scene,
      group,
      520,
      372,
      "This equipment has no open sockets remaining.",
      { fontSize: "10px", color: COLORS.muted, wordWrap: { width: 215 } },
    );
    return;
  }
  if (!gem) {
    addText(
      scene,
      group,
      520,
      284,
      "Now choose a gem. The best compatible option is marked ★.",
      {
        color: COLORS.muted,
        wordWrap: { width: 215 },
      },
    );
    return;
  }
  const preview = socketPreview(item, gem, gs);
  if (!preview) return;
  addText(
    scene,
    group,
    520,
    266,
    justCrafted ? "STEP 2 OF 2 — WEAPON STILL OPEN" : "PREVIEW — NOT APPLIED",
    {
      fontSize: "9px",
      fontStyle: "bold",
      color: COLORS.warning,
    },
  );
  addText(scene, group, 520, 288, gem.name, {
    fontSize: "13px",
    fontStyle: "bold",
    color: gem.id === bestGemID ? COLORS.good : COLORS.text,
  });
  if (gem.id === bestGemID) {
    addText(scene, group, 520, 308, "★ BEST OWNED GEM FOR THIS ITEM", {
      fontSize: "9px",
      color: COLORS.good,
    });
  }
  addText(
    scene,
    group,
    520,
    332,
    `${preview.stat}:  ${preview.current}  →  ${preview.after}   (+${preview.delta})`,
    { fontSize: "14px", fontStyle: "bold", color: COLORS.good },
  );
  if (preview.characterLabel) {
    addText(
      scene,
      group,
      520,
      356,
      `${preview.characterLabel}:  ${preview.characterCurrent}  →  ${preview.characterAfter}`,
      { color: COLORS.active },
    );
  }
  addText(scene, group, 520, 380, gem.description || "", {
    fontSize: "10px",
    color: COLORS.muted,
    wordWrap: { width: 215 },
  });
  addText(scene, group, 520, 404, `After confirm: ◆ ${gem.name}`, {
    fontSize: "10px",
    color: COLORS.good,
  });
  addText(scene, group, 520, 426, "⚠ Socketing is permanent for now.", {
    fontSize: "10px",
    color: COLORS.warning,
  });
}

function renderRefineMode(scene, group, state) {
  const recipes = recommendedRecipes(state.gs);
  const selected = recipes.find(
    ({ recipe }) => recipe.id === state.selectedRecipeID,
  )?.recipe;
  const recommendedID = recipes.find(({ recipe }) => recipe.craftable)?.recipe
    ?.id;

  addText(scene, group, 48, 148, "KNOWN RECIPES", {
    fontSize: "12px",
    fontStyle: "bold",
    color: COLORS.gold,
  });
  addPanel(scene, group, 46, 168, 320, 330);
  recipes.slice(0, 7).forEach(({ recipe }, index) => {
    const ready = recipe.craftable;
    const recommendation = recipe.id === recommendedID;
    drawChoiceRow(
      scene,
      group,
      56,
      180 + index * 52,
      300,
      44,
      `${recommendation ? "★ " : ""}${recipe.name}\n${recipeReadiness(recipe, state.gs)}`,
      {
        selected: recipe.id === state.selectedRecipeID,
        muted: !ready,
        onClick: () => state.selectRecipe(recipe.id),
        meta: { role: "recipe", id: recipe.id },
      },
    );
  });

  addText(scene, group, 382, 148, "RECIPE PREVIEW", {
    fontSize: "12px",
    fontStyle: "bold",
    color: COLORS.gold,
  });
  addPanel(scene, group, 380, 168, 372, 330);
  renderRecipePreview(scene, group, selected, state.gs, recommendedID);
  const craftButton = drawButton(
    scene,
    566,
    476,
    260,
    38,
    state.busy ? "WORKING..." : "CREATE GEM — THEN SOCKET",
    state.confirmRecipe,
    {
      depth: DEPTH,
      fontStyle: "bold",
      fill: 0x1f5d48,
      fillHover: 0x2b7d62,
      stroke: 0xa5f0c8,
    },
  );
  craftButton.setEnabled(!!selected?.craftable && !state.busy);
  group.push(craftButton);
}

function renderRecipePreview(scene, group, recipe, gs, recommendedID) {
  if (!recipe) {
    addText(
      scene,
      group,
      396,
      190,
      "Select any recipe—even a locked one—to inspect its cost and result.",
      {
        color: COLORS.muted,
        wordWrap: { width: 340 },
      },
    );
    return;
  }
  addText(scene, group, 396, 184, recipe.output.gem_name, {
    fontSize: "16px",
    fontStyle: "bold",
    color: COLORS.text,
  });
  if (recipe.id === recommendedID) {
    addText(scene, group, 396, 208, "★ RECOMMENDED — READY NOW", {
      fontSize: "10px",
      color: COLORS.good,
    });
  }
  addText(scene, group, 396, 236, "COST", {
    fontSize: "10px",
    fontStyle: "bold",
    color: COLORS.gold,
  });
  (recipe.inputs || []).forEach((input, index) => {
    const owned = input.owned ?? 0;
    const enough = owned >= input.count;
    addText(
      scene,
      group,
      396,
      256 + index * 22,
      `${input.count} ${input.gem_name}   •   owned ${owned}`,
      { color: enough ? COLORS.good : COLORS.bad },
    );
  });
  addText(scene, group, 396, 294, "RESULTING SOCKET BONUS", {
    fontSize: "10px",
    fontStyle: "bold",
    color: COLORS.gold,
  });
  recipeUpgradePreview(recipe).forEach((row, index) => {
    addText(
      scene,
      group,
      396,
      316 + index * 25,
      `${row.stat}:  +${row.before}  →  +${row.after}   (${row.delta >= 0 ? "+" : ""}${row.delta})`,
      {
        fontSize: "13px",
        fontStyle: "bold",
        color: row.delta >= 0 ? COLORS.good : COLORS.bad,
      },
    );
  });
  addText(scene, group, 396, 374, recipe.output.description || "", {
    fontSize: "10px",
    color: COLORS.muted,
    wordWrap: { width: 340 },
  });
  addText(scene, group, 396, 398, recipeReadiness(recipe, gs), {
    fontSize: "11px",
    fontStyle: "bold",
    color: recipe.craftable ? COLORS.good : COLORS.warning,
  });
  addText(
    scene,
    group,
    396,
    420,
    "Step 1: Create the gem. Step 2: Socket it on the next screen.",
    { fontSize: "9px", color: COLORS.muted },
  );
}

export function showGemWorkshop(
  scene,
  { onClose, preselectedInstanceID = "", initialMode = "socket" } = {},
) {
  pauseWorldFor(scene, "gem_workshop");
  const overlay = [];
  const content = [];
  let mode = initialMode;
  let busy = false;
  let selectedGearID = preselectedInstanceID;
  let selectedGemID = "";
  let selectedRecipeID = "";
  let notice = "";
  let noticeIsError = false;
  let justCraftedGemID = "";

  const close = () => {
    clearGroup(content);
    clearGroup(overlay);
    if (scene.gemWorkshopEscHandler) {
      scene.input.keyboard.off("keydown-ESC", scene.gemWorkshopEscHandler);
      scene.gemWorkshopEscHandler = null;
    }
    resumeWorldFor(scene, "gem_workshop");
    if (onClose) onClose();
  };
  const frame = drawWorkshopFrame(scene, overlay, close);

  const escHandler = () => close();
  scene.input.keyboard.once("keydown-ESC", escHandler);
  scene.gemWorkshopEscHandler = escHandler;

  const runAction = async (action, successMessage, onSuccess) => {
    if (busy) return;
    busy = true;
    notice = "";
    render();
    let result;
    try {
      result = await action();
    } catch (error) {
      result = { error: error?.message || "Action failed" };
    }
    busy = false;
    if (!result || result.error) {
      notice = result?.error || "Action failed";
      noticeIsError = true;
      render();
      return;
    }
    scene.gameState = result;
    notice = successMessage;
    noticeIsError = false;
    if (onSuccess) onSuccess(result);
    if (typeof scene.updateHUD === "function") scene.updateHUD();
    playSFX("sfx_equip");
    render();
  };

  const selectGear = (instanceID) => {
    selectedGearID = instanceID;
    selectedGemID =
      recommendedGems(
        scene.gameState,
        workshopGear(scene.gameState).find(
          (item) => item.instance_id === instanceID,
        ),
      )[0]?.gem?.id || "";
    notice = "";
    render();
  };

  const confirmSocket = async () => {
    const item = workshopGear(scene.gameState).find(
      (candidate) => candidate.instance_id === selectedGearID,
    );
    const gem = ownedGems(scene.gameState).find(
      (candidate) => candidate.id === selectedGemID,
    );
    const socket = firstOpenSocket(item);
    if (!item || !gem || socket < 0) return;
    await runAction(
      () => socketGem(scene.gameState.id, selectedGearID, socket, gem.id),
      `✓ ${gem.name} socketed. ${item.name} is now socketed.`,
      () => {
        justCraftedGemID = "";
      },
    );
  };

  const confirmRecipe = async () => {
    const recipe = knownRecipes(scene.gameState).find(
      (candidate) => candidate.id === selectedRecipeID,
    );
    if (!recipe?.craftable) return;
    await runAction(
      () => craftGem(scene.gameState.id, recipe.id),
      `✓ ${recipe.output.gem_name} refined — not socketed yet. Review and confirm above.`,
      () => {
        mode = "socket";
        selectedGemID = recipe.output.gem_id;
        justCraftedGemID = recipe.output.gem_id;
      },
    );
  };

  function render() {
    clearGroup(content);
    const gs = scene.gameState;
    const gear = workshopGear(gs);
    if (!gear.some((item) => item.instance_id === selectedGearID)) {
      selectedGearID = gear[0]?.instance_id || "";
    }
    const selectedItem = gear.find(
      (item) => item.instance_id === selectedGearID,
    );
    const gems = recommendedGems(gs, selectedItem);
    if (!gems.some(({ gem }) => gem.id === selectedGemID)) {
      selectedGemID = gems[0]?.gem?.id || "";
    }
    const recipes = recommendedRecipes(gs);
    if (!recipes.some(({ recipe }) => recipe.id === selectedRecipeID)) {
      selectedRecipeID = recipes[0]?.recipe?.id || "";
    }

    addTabs(scene, content, mode, gs, (nextMode) => {
      mode = nextMode;
      render();
    });
    if (mode === "refine") {
      renderRefineMode(scene, content, {
        gs,
        busy,
        selectedRecipeID,
        selectRecipe: (recipeID) => {
          selectedRecipeID = recipeID;
          render();
        },
        confirmRecipe,
      });
    } else {
      renderSocketMode(scene, content, {
        gs,
        busy,
        selectedGearID,
        selectedGemID,
        justCraftedGemID,
        selectGear,
        selectGem: (gemID) => {
          selectedGemID = gemID;
          render();
        },
        confirm: confirmSocket,
      });
    }
    frame.subtitle.setText(
      notice ||
        "Choose first. Review the exact result. Confirm only when it looks right.",
    );
    frame.subtitle.setColor(
      notice ? (noticeIsError ? COLORS.bad : COLORS.warning) : COLORS.muted,
    );
    if (notice) {
      addText(scene, content, 50, 510, notice, {
        fontSize: "10px",
        fontStyle: "bold",
        color: noticeIsError ? COLORS.bad : COLORS.good,
        wordWrap: { width: 545 },
      });
    }
  }

  render();
}
