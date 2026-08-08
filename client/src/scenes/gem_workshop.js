import { craftGem, socketGem } from "../api.js";
import { playSFX } from "../systems/audio.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { drawButton, drawPanel } from "../ui/panel.js";

// Pure selectors shared by the Gem Workshop renderer and unit tests.

const DEPTH = 51;
const PANEL = { x: 400, y: 300, width: 744, height: 520 };
const COLORS = {
  gold: "#fff1a8",
  text: "#eef7ff",
  muted: "#91a6c8",
  active: "#8ed7ff",
  good: "#8ff0a4",
  bad: "#d47878",
};

export function socketableGear(gs) {
  if (!Array.isArray(gs?.items)) return [];
  return gs.items.filter(
    (item) =>
      item?.instance_id &&
      Array.isArray(item.sockets) &&
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

function drawWorkshopFrame(scene, overlay, onClose) {
  const panel = drawPanel(scene, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
    depth: 50,
    interactive: true,
    variant: "ff6",
  });
  overlay.push(panel.bg);
  addText(scene, overlay, 56, 64, "GEM WORKSHOP", {
    fontSize: "22px",
    fontStyle: "bold",
    fontFamily: "Georgia",
    color: COLORS.gold,
  });
  addText(
    scene,
    overlay,
    56,
    94,
    "Select gear, then a gem. Known recipes never fail or consume ingredients on rejection.",
    { color: COLORS.muted },
  );
  const columns = [
    [58, "SOCKETABLE GEAR"],
    [314, "OWNED GEMS"],
    [532, "KNOWN RECIPES"],
  ];
  for (const [x, label] of columns) {
    addText(scene, overlay, x, 126, label, {
      fontSize: "12px",
      fontStyle: "bold",
      color: COLORS.gold,
    });
  }
  const close = drawButton(scene, 676, 538, 150, 34, "CLOSE", onClose, {
    depth: DEPTH,
    fontSize: "11px",
    fontStyle: "bold",
    fill: 0x1b3660,
    fillHover: 0x27538a,
    stroke: 0xb6d2ff,
    strokeWidth: 2,
  });
  overlay.push(close);
}

function drawChoiceRow(
  scene,
  group,
  x,
  y,
  width,
  label,
  { enabled = true, selected = false, onClick } = {},
) {
  const fill = selected ? 0x2d5a93 : enabled ? 0x172f55 : 0x11182b;
  const stroke = selected ? 0xf4d881 : enabled ? 0x6b9bd5 : 0x33435d;
  const bg = scene.add
    .rectangle(x + width / 2, y + 14, width, 28, fill, 0.98)
    .setStrokeStyle(1, stroke)
    .setScrollFactor(0)
    .setDepth(DEPTH);
  const text = addText(scene, group, x + 10, y + 14, label, {
    fontSize: "10px",
    color: enabled ? COLORS.text : COLORS.muted,
  }).setOrigin(0, 0.5);
  group.push(bg);
  if (enabled && onClick) {
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerover", () => bg.setFillStyle(0x21406e, 0.98));
    bg.on("pointerout", () =>
      bg.setFillStyle(selected ? 0x2d5a93 : 0x172f55, 0.98),
    );
    bg.on("pointerdown", onClick);
  }
}

function clearGroup(group) {
  for (const object of group.splice(0)) object.destroy();
}

function showEmpty(scene, group, x, text) {
  addText(scene, group, x, 164, text, {
    fontSize: "10px",
    color: COLORS.muted,
    fontStyle: "italic",
    wordWrap: { width: 190 },
  });
}

function renderGearColumn(scene, group, gs, selectedID, onSelect) {
  const gear = socketableGear(gs);
  if (gear.length === 0) {
    showEmpty(scene, group, 58, "Find equipment with an open socket.");
    return;
  }
  gear.slice(0, 10).forEach((item, index) => {
    const open = item.sockets.filter((socket) => !socket.gem_id).length;
    drawChoiceRow(
      scene,
      group,
      58,
      150 + index * 34,
      230,
      `${item.name}  [${open} open]`,
      {
        selected: item.instance_id === selectedID,
        onClick: () => onSelect(item.instance_id),
      },
    );
  });
}

function renderGemColumn(scene, group, gs, selectedID, onSocket) {
  const gems = ownedGems(gs);
  if (gems.length === 0) {
    showEmpty(
      scene,
      group,
      314,
      "Defeat monsters or refine shards to find gems.",
    );
    return;
  }
  gems.slice(0, 10).forEach((gem, index) => {
    drawChoiceRow(
      scene,
      group,
      314,
      150 + index * 34,
      190,
      `${gem.name}  x${gem.count}`,
      {
        enabled: !!selectedID,
        onClick: () => onSocket(gem.id),
      },
    );
  });
  if (!selectedID) {
    addText(scene, group, 314, 500, "Select gear before choosing a gem.", {
      fontSize: "9px",
      color: COLORS.muted,
    });
  }
}

function renderRecipeColumn(scene, group, gs, onCraft) {
  const recipes = knownRecipes(gs);
  if (recipes.length === 0) {
    showEmpty(scene, group, 532, "No recipes discovered.");
    return;
  }
  recipes.slice(0, 10).forEach((recipe, index) => {
    const cost = recipeCostLabel(recipe, gs.gems);
    drawChoiceRow(
      scene,
      group,
      532,
      150 + index * 34,
      210,
      `${recipe.name} (${cost})`,
      {
        enabled: recipe.craftable,
        onClick: () => onCraft(recipe.id),
      },
    );
  });
}

export function showGemWorkshop(scene, { onClose } = {}) {
  pauseWorldFor(scene, "gem_workshop");
  const overlay = [];
  const content = [];
  let selectedID = socketableGear(scene.gameState)[0]?.instance_id || "";
  let busy = false;

  const close = () => {
    clearGroup(content);
    clearGroup(overlay);
    resumeWorldFor(scene, "gem_workshop");
    if (onClose) onClose();
  };
  drawWorkshopFrame(scene, overlay, close);

  const notify = (message) => {
    scene.showMessage(message);
    scene.time.delayedCall(1800, () => scene.hideMessage());
  };

  const runAction = async (action, successMessage) => {
    if (busy) return;
    busy = true;
    const result = await action();
    busy = false;
    if (result.error) {
      notify(result.error);
      return;
    }
    scene.gameState = result;
    playSFX("sfx_equip");
    notify(successMessage);
    const gear = socketableGear(result);
    if (!gear.some((item) => item.instance_id === selectedID)) {
      selectedID = gear[0]?.instance_id || "";
    }
    render();
  };

  const selectGear = (instanceID) => {
    selectedID = instanceID;
    render();
  };
  const socketSelected = async (gemID) => {
    const item = socketableGear(scene.gameState).find(
      (candidate) => candidate.instance_id === selectedID,
    );
    const socket = firstOpenSocket(item);
    if (!item || socket < 0) return;
    const gem = ownedGems(scene.gameState).find(
      (candidate) => candidate.id === gemID,
    );
    await runAction(
      () => socketGem(scene.gameState.id, selectedID, socket, gemID),
      `${gem?.name || "Gem"} socketed into ${item.name}.`,
    );
  };
  const craftSelected = async (recipeID) => {
    const recipe = knownRecipes(scene.gameState).find(
      (candidate) => candidate.id === recipeID,
    );
    await runAction(
      () => craftGem(scene.gameState.id, recipeID),
      `${recipe?.name || "Recipe"} complete.`,
    );
  };

  function render() {
    clearGroup(content);
    renderGearColumn(scene, content, scene.gameState, selectedID, selectGear);
    renderGemColumn(
      scene,
      content,
      scene.gameState,
      selectedID,
      socketSelected,
    );
    renderRecipeColumn(scene, content, scene.gameState, craftSelected);
  }

  render();
}
