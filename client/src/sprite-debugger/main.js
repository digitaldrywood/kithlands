import "./styles.css";

import {
  GRID_DIMENSION,
  buildSheetCells,
  debuggerCatalog,
  formatSpriteLabel,
} from "./model.js";
import { WALK_DIRS } from "../scenes/walkFrame.js";

const BACKGROUNDS = ["checker", "dark", "light"];
const state = {
  background: "checker",
};

function previewClassName() {
  return `preview-wrap bg-${state.background}`;
}

function getNativeSizeLabel(width, height) {
  return `${width}x${height} native`;
}

function renderLiveUrl() {
  const target = document.getElementById("live-url");
  target.innerHTML =
    `<strong>${window.location.href}</strong><br />` +
    "Served by the same Vite app as the main game entry.";
}

function renderRuntimeStatus() {
  const target = document.getElementById("runtime-status");
  const runtimeList = debuggerCatalog.walkSheets.map((sheet) => sheet.id);
  target.innerHTML =
    `<strong>Runtime-enabled walk sheets:</strong> ${runtimeList.join(", ")}<br />` +
    "This list is imported from the same runtime registry BootScene uses.";
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  return badge;
}

function makeAssetCard(asset, options) {
  const card = document.createElement("article");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "card-header";

  const titleRow = document.createElement("div");
  titleRow.className = "card-title";

  const title = document.createElement("h3");
  title.textContent = asset.label;

  const badgeRow = document.createElement("div");
  badgeRow.className = "badge-row";
  badgeRow.appendChild(createBadge(asset.badgeLabel, options.badgeClass));

  titleRow.append(title, badgeRow);

  const path = document.createElement("div");
  path.className = "card-path";
  path.textContent = asset.path;

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.textContent = "Loading image metadata...";

  header.append(titleRow, path, meta);

  const body = document.createElement("div");
  body.className = "card-body";

  const wrap = document.createElement("div");
  wrap.className = previewClassName();

  const img = document.createElement("img");
  img.alt = asset.label;
  img.src = asset.path;
  img.width = options.displayWidth;
  img.height = options.displayHeight;

  img.addEventListener("load", () => {
    meta.textContent = getNativeSizeLabel(img.naturalWidth, img.naturalHeight);
  });

  img.addEventListener("error", () => {
    meta.textContent = "Missing or unreadable asset.";
    wrap.innerHTML = `<div class="broken">Missing asset:<br />${asset.path}</div>`;
  });

  wrap.appendChild(img);
  body.appendChild(wrap);
  card.append(header, body);
  return card;
}

function renderAssetGrid(targetId, assets, options) {
  const target = document.getElementById(targetId);
  target.replaceChildren(
    ...assets.map((asset) => makeAssetCard(asset, options)),
  );
}

function updateSelection({
  img,
  card,
  cells,
  selectedCell,
  selectedPreview,
  selectedMeta,
}) {
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = selectedCell.width;
  previewCanvas.height = selectedCell.height;
  const previewCtx = previewCanvas.getContext("2d");
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.drawImage(
    img,
    selectedCell.x,
    selectedCell.y,
    selectedCell.width,
    selectedCell.height,
    0,
    0,
    selectedCell.width,
    selectedCell.height,
  );
  selectedPreview.replaceChildren(previewCanvas);

  selectedMeta.innerHTML =
    `<div class="meta-line"><strong>Selected:</strong> ${selectedCell.id}</div>` +
    `<div class="meta-line"><strong>Direction:</strong> ${selectedCell.direction}</div>` +
    `<div class="meta-line"><strong>Frame:</strong> ${selectedCell.frame}</div>` +
    `<div class="meta-line"><strong>Source crop:</strong> ${selectedCell.x}, ${selectedCell.y}</div>` +
    `<div class="meta-line"><strong>Cell size:</strong> ${selectedCell.width}x${selectedCell.height}</div>`;

  for (const button of card.querySelectorAll(".cell")) {
    button.classList.toggle(
      "active",
      button.dataset.cellId === selectedCell.id,
    );
  }
  for (const boundary of card.querySelectorAll(".sheet-boundary")) {
    boundary.classList.toggle(
      "active",
      boundary.dataset.cellId === selectedCell.id,
    );
  }

  return cells;
}

function createSheetBoundary(classId, cell) {
  const boundary = document.createElement("div");
  boundary.className = "sheet-boundary";
  boundary.dataset.cellId = cell.id;
  boundary.dataset.testid = `sheet-boundary-${classId}-${cell.id}`;
  boundary.style.left = `${(cell.col / GRID_DIMENSION) * 100}%`;
  boundary.style.top = `${(cell.row / GRID_DIMENSION) * 100}%`;
  boundary.style.width = `${100 / GRID_DIMENSION}%`;
  boundary.style.height = `${100 / GRID_DIMENSION}%`;

  const label = document.createElement("span");
  label.className = "sheet-boundary-label";
  label.textContent = cell.id;
  boundary.appendChild(label);

  return boundary;
}

function createCellButton({ img, cell, classId, onSelect }) {
  const button = document.createElement("button");
  button.className = "cell";
  button.type = "button";
  button.dataset.cellId = cell.id;
  button.dataset.testid = `sheet-cell-${classId}-${cell.id}`;

  const label = document.createElement("div");
  label.className = "cell-label";
  label.textContent = cell.id;

  const subtitle = document.createElement("div");
  subtitle.className = "cell-subtitle";
  subtitle.textContent = `${cell.direction} / f${cell.frame}`;

  const wrap = document.createElement("div");
  wrap.className = previewClassName();

  const canvas = document.createElement("canvas");
  canvas.width = cell.width;
  canvas.height = cell.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    cell.x,
    cell.y,
    cell.width,
    cell.height,
    0,
    0,
    cell.width,
    cell.height,
  );
  wrap.appendChild(canvas);
  button.append(label, wrap, subtitle);
  button.addEventListener("click", () => onSelect(cell));
  return button;
}

function buildWalkSheetCard(sheet) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.testid = `walk-sheet-card-${sheet.id}`;

  const header = document.createElement("div");
  header.className = "card-header";

  const titleRow = document.createElement("div");
  titleRow.className = "card-title";
  const title = document.createElement("h3");
  title.textContent = sheet.label;

  const badgeRow = document.createElement("div");
  badgeRow.className = "badge-row";
  badgeRow.append(
    createBadge("Generated walk sheet", "sheet"),
    createBadge("Runtime loaded", "runtime"),
    createBadge("Inspect cell grid", "warning"),
  );

  titleRow.append(title, badgeRow);

  const path = document.createElement("div");
  path.className = "card-path";
  path.textContent = sheet.path;

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.textContent = "Loading sheet...";

  header.append(titleRow, path, meta);

  const body = document.createElement("div");
  body.className = "card-body";

  const layout = document.createElement("div");
  layout.className = "walk-sheet-layout";

  const previewWrap = document.createElement("div");
  previewWrap.className = "sheet-preview-wrap";

  const preview = document.createElement("div");
  preview.className = `sheet-preview ${previewClassName()}`;

  const img = document.createElement("img");
  img.alt = `${sheet.label} walk sheet`;
  img.className = "sheet-preview-image";
  img.src = sheet.path;
  img.width = 220;
  img.height = 220;
  img.dataset.testid = `sheet-preview-${sheet.id}`;

  const overlay = document.createElement("div");
  overlay.className = "sheet-grid-overlay";
  overlay.dataset.testid = `sheet-grid-overlay-${sheet.id}`;

  preview.append(img, overlay);

  const axis = document.createElement("div");
  axis.className = "sheet-axis";
  WALK_DIRS.forEach((dir, index) => {
    const row = document.createElement("div");
    row.className = "sheet-axis-row";
    row.innerHTML =
      `<span class="axis-chip">row ${index}</span>` + `<span>${dir}</span>`;
    axis.appendChild(row);
  });

  previewWrap.append(preview, axis);

  const grid = document.createElement("div");
  grid.className = "cell-grid";

  layout.append(previewWrap, grid);

  const inspector = document.createElement("div");
  inspector.className = "sheet-inspector";

  const selectedPreview = document.createElement("div");
  selectedPreview.className = previewClassName();
  selectedPreview.dataset.testid = `sheet-selected-${sheet.id}`;

  const selectedMeta = document.createElement("div");
  selectedMeta.className = "sheet-inspector-meta";
  selectedMeta.innerHTML =
    `<div class="meta-line"><strong>Runtime key:</strong> ${sheet.runtimeKey}</div>` +
    `<div class="meta-line"><strong>Rows:</strong> ${WALK_DIRS.join(", ")}</div>` +
    `<div class="meta-line"><strong>Status:</strong> Waiting for image load...</div>`;

  inspector.append(selectedPreview, selectedMeta);
  body.append(layout, inspector);
  card.append(header, body);

  img.addEventListener("load", () => {
    let cells;
    try {
      cells = buildSheetCells(img.naturalWidth, img.naturalHeight);
    } catch (error) {
      meta.textContent = error.message;
      grid.innerHTML = `<div class="broken">${error.message}</div>`;
      return;
    }

    meta.textContent =
      `${img.naturalWidth}x${img.naturalHeight} sheet | ` +
      `${GRID_DIMENSION} rows x ${GRID_DIMENSION} columns | ` +
      `${cells[0].width}x${cells[0].height} per cell`;

    overlay.replaceChildren(
      ...cells.map((cell) => createSheetBoundary(sheet.id, cell)),
    );

    const selectCell = (cell) =>
      updateSelection({
        img,
        card,
        cells,
        selectedCell: cell,
        selectedPreview,
        selectedMeta,
      });

    grid.replaceChildren(
      ...cells.map((cell) =>
        createCellButton({
          img,
          cell,
          classId: sheet.id,
          onSelect: selectCell,
        }),
      ),
    );

    card.dataset.loaded = "true";
    selectCell(cells[0]);
  });

  img.addEventListener("error", () => {
    meta.textContent = "Sheet is missing or unreadable.";
    overlay.replaceChildren();
    grid.innerHTML = `<div class="broken">Missing sheet:<br />${sheet.path}</div>`;
    selectedPreview.innerHTML = `<div class="broken">No preview available</div>`;
    selectedMeta.innerHTML =
      `<div class="meta-line"><strong>Runtime key:</strong> ${sheet.runtimeKey}</div>` +
      `<div class="meta-line"><strong>Status:</strong> Missing sprite sheet.</div>`;
  });

  return card;
}

function renderWalkSheets() {
  const target = document.getElementById("walk-grid");
  target.replaceChildren(
    ...debuggerCatalog.walkSheets.map((sheet) => buildWalkSheetCard(sheet)),
  );
}

function render() {
  renderAssetGrid("fallback-grid", debuggerCatalog.fallbackDirectionals, {
    badgeClass: "fallback",
    displayWidth: 128,
    displayHeight: 128,
  });

  renderWalkSheets();

  renderAssetGrid("portrait-grid", debuggerCatalog.portraits, {
    badgeClass: "reference",
    displayWidth: 160,
    displayHeight: 160,
  });

  renderAssetGrid("monster-grid", debuggerCatalog.monsters, {
    badgeClass: "reference",
    displayWidth: 156,
    displayHeight: 156,
  });

  renderAssetGrid("npc-grid", debuggerCatalog.npcs, {
    badgeClass: "reference",
    displayWidth: 120,
    displayHeight: 120,
  });

  renderAssetGrid("ui-grid", debuggerCatalog.ui, {
    badgeClass: "reference",
    displayWidth: 84,
    displayHeight: 84,
  });

  renderAssetGrid("background-grid", debuggerCatalog.backgrounds, {
    badgeClass: "reference",
    displayWidth: 320,
    displayHeight: 240,
  });
}

function setBackground(mode) {
  state.background = BACKGROUNDS.includes(mode) ? mode : "checker";
  for (const button of document.querySelectorAll(".btn[data-bg]")) {
    button.classList.toggle("active", button.dataset.bg === state.background);
  }
  render();
}

function mountStaticMetadata() {
  document.getElementById("expected-geometry").innerHTML =
    `<div class="meta-line"><strong>Directionals:</strong> 128x128 PNG</div>` +
    `<div class="meta-line"><strong>Walk sheets:</strong> 4x4 PNG atlas imported from current runtime data</div>` +
    `<div class="meta-line"><strong>Battle backgrounds:</strong> 800x600 PNG (pre-rendered Gemini scenes, +@2x companion)</div>` +
    `<div class="meta-line"><strong>Inspect cells:</strong> Click any grid cell to zoom and verify crop bounds</div>`;

  document.getElementById("route-notes").innerHTML =
    "<p>The debugger is now a Vite HTML entry, not a static source file under `public/`. " +
    "That keeps `/sprites.html` on the active client stack and lets the page share source modules with the runtime.</p>";

  document.getElementById("other-assets-copy").innerHTML =
    "<p>Monsters are pulled from the shared monster sprite registry, while class portraits and walk sheets use the runtime class list. NPC and UI groups remain explicit quick-reference surfaces.</p>";
}

document.querySelectorAll(".btn[data-bg]").forEach((button) => {
  button.addEventListener("click", () => {
    setBackground(button.dataset.bg);
  });
});

renderLiveUrl();
renderRuntimeStatus();
mountStaticMetadata();
render();

window.__spriteDebugger = {
  buildSheetCells,
  debuggerCatalog,
  formatSpriteLabel,
  setBackground,
};
