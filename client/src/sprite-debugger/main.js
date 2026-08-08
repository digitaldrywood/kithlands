import "./styles.css";

import {
  GRID_DIMENSION,
  SHEET_ROW_COUNT,
  WALK_POSE_SEQUENCE,
  buildSheetCells,
  debuggerCatalog,
  formatSpriteLabel,
} from "./model.js";
import { WALK_DIRS } from "../scenes/walkFrame.js";

const BACKGROUNDS = ["checker", "dark", "light"];
const MOTION_FRAME_MS = 110;
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
    `<div class="meta-line"><strong>Required pose:</strong> ${selectedCell.pose.label}</div>` +
    `<div class="meta-line"><strong>Acceptance check:</strong> ${selectedCell.pose.critique}</div>` +
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
  boundary.style.left = `${(cell.x / cell.sheetWidth) * 100}%`;
  boundary.style.top = `${(cell.y / cell.sheetHeight) * 100}%`;
  boundary.style.width = `${(cell.width / cell.sheetWidth) * 100}%`;
  boundary.style.height = `${(cell.height / cell.sheetHeight) * 100}%`;

  const label = document.createElement("span");
  label.className = "sheet-boundary-label";
  label.textContent = cell.pose.shortLabel;
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
  subtitle.textContent = `${cell.direction} / ${cell.pose.shortLabel}`;

  const critique = document.createElement("div");
  critique.className = "cell-critique";
  critique.textContent = cell.pose.id;

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
  button.append(label, wrap, subtitle, critique);
  button.addEventListener("click", () => onSelect(cell));
  return button;
}

function createPoseSequencePanel() {
  const panel = document.createElement("div");
  panel.className = "pose-sequence-panel";
  panel.dataset.testid = "walk-pose-sequence";

  const title = document.createElement("h4");
  title.textContent = "Required stride frames";

  const list = document.createElement("ol");
  list.className = "pose-sequence-list";
  WALK_POSE_SEQUENCE.forEach((pose, index) => {
    const item = document.createElement("li");
    item.innerHTML =
      `<strong>f${index} ${pose.label}</strong>` +
      `<span>${pose.critique}</span>`;
    list.appendChild(item);
  });

  panel.append(title, list);
  return panel;
}

function drawMotionBackdrop(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111923";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1d2a3a";
  for (let x = 0; x < width; x += 16) {
    ctx.fillRect(x, height - 24, 8, 3);
  }
  ctx.strokeStyle = "rgba(245, 202, 95, 0.42)";
  ctx.beginPath();
  ctx.moveTo(0, height - 16.5);
  ctx.lineTo(width, height - 16.5);
  ctx.stroke();
}

function startAnimation(draw, frameMs = MOTION_FRAME_MS) {
  draw();
  const timer = window.setInterval(() => {
    if (!draw()) window.clearInterval(timer);
  }, frameMs);
}

function createDirectionLoop({ img, cells, direction, classId }) {
  const frames = cells.filter((cell) => cell.direction === direction);
  const panel = document.createElement("div");
  panel.className = "motion-loop";
  panel.dataset.testid = `motion-loop-${classId}-${direction}`;

  const title = document.createElement("div");
  title.className = "motion-loop-title";
  title.textContent = `${direction} loop`;

  const wrap = document.createElement("div");
  wrap.className = previewClassName();

  const canvas = document.createElement("canvas");
  canvas.width = frames[0]?.width || 128;
  canvas.height = frames[0]?.height || 128;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  wrap.appendChild(canvas);

  let frameIndex = 0;
  const draw = () => {
    if (!canvas.isConnected) return false;
    const frame = frames[frameIndex % frames.length];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    frameIndex += 1;
    return true;
  };

  if (frames.length > 0) {
    startAnimation(draw);
  }

  panel.append(title, wrap);
  return panel;
}

function createTravelPreview({ img, cells, direction, classId }) {
  const frames = cells.filter((cell) => cell.direction === direction);
  const panel = document.createElement("div");
  panel.className = "travel-preview";
  panel.dataset.testid = `travel-preview-${classId}-${direction}`;

  const title = document.createElement("div");
  title.className = "motion-loop-title";
  title.textContent = `${direction} travel`;

  const canvas = document.createElement("canvas");
  canvas.width = 416;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  let tick = 0;
  const draw = () => {
    if (!canvas.isConnected) return false;
    const frame = frames[tick % frames.length];
    const progress = (tick % (frames.length * 4)) / (frames.length * 4 - 1);
    const travelSpan = canvas.width - frame.width;
    const x =
      direction === "left"
        ? travelSpan - progress * travelSpan
        : progress * travelSpan;
    const y = canvas.height - frame.height - 2;

    drawMotionBackdrop(ctx, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      Math.round(x),
      y,
      frame.width,
      frame.height,
    );
    tick += 1;
    return true;
  };

  if (frames.length > 0) {
    startAnimation(draw);
  }

  panel.append(title, canvas);
  return panel;
}

function createMotionProof({ img, cells, classId, geometry }) {
  const motionDirections = geometry?.directions || WALK_DIRS;
  const directionLoops = document.createElement("div");
  directionLoops.className = "motion-direction-grid";
  directionLoops.append(
    ...motionDirections.map((direction) =>
      createDirectionLoop({ img, cells, direction, classId }),
    ),
  );

  const west = motionDirections.includes("west") ? "west" : "left";
  const east = motionDirections.includes("east") ? "east" : "right";
  const travel = document.createElement("div");
  travel.className = "motion-travel-grid";
  travel.append(
    createTravelPreview({ img, cells, direction: west, classId }),
    createTravelPreview({ img, cells, direction: east, classId }),
  );

  return [directionLoops, travel];
}

function createCandidateMotionProof(candidate) {
  const panel = document.createElement("div");
  panel.className = "candidate-live-motion";
  panel.dataset.testid = `candidate-live-motion-${candidate.id}`;

  const title = document.createElement("div");
  title.className = "motion-loop-title";
  title.textContent = "Live JS walk preview";

  const status = document.createElement("div");
  status.className = "meta-line";
  status.textContent = "Loading candidate side sheet...";

  const img = document.createElement("img");
  img.alt = `${candidate.label} side-only sheet`;
  img.src = candidate.sideSheetPath;
  img.hidden = true;

  img.addEventListener("load", () => {
    let cells;
    try {
      cells = buildSheetCells(img.naturalWidth, img.naturalHeight);
    } catch (error) {
      status.textContent = error.message;
      return;
    }

    const loops = document.createElement("div");
    loops.className = "motion-direction-grid candidate-motion-grid";
    loops.append(
      createDirectionLoop({
        img,
        cells,
        direction: "left",
        classId: candidate.id,
      }),
      createDirectionLoop({
        img,
        cells,
        direction: "right",
        classId: candidate.id,
      }),
    );

    const travel = document.createElement("div");
    travel.className = "motion-travel-grid candidate-motion-grid";
    travel.append(
      createTravelPreview({
        img,
        cells,
        direction: "left",
        classId: candidate.id,
      }),
      createTravelPreview({
        img,
        cells,
        direction: "right",
        classId: candidate.id,
      }),
    );

    status.textContent = `${img.naturalWidth}x${img.naturalHeight} candidate side sheet | left/right rows animated below`;
    panel.append(loops, travel);
  });

  img.addEventListener("error", () => {
    status.textContent = `Missing candidate side sheet: ${candidate.sideSheetPath}`;
  });

  panel.append(title, status, img);
  return panel;
}

function formatMetricValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function motionSummaryRow(label, data) {
  const summary = data?.summary || {};
  const row = document.createElement("tr");
  row.innerHTML =
    `<th>${label}</th>` +
    `<td>${formatMetricValue(summary.max_abs_hair_center_x_delta)}</td>` +
    `<td>${formatMetricValue(summary.max_abs_hair_center_y_delta)}</td>` +
    `<td>${formatMetricValue(summary.max_abs_hair_top_delta)}</td>` +
    `<td>${formatMetricValue(summary.max_abs_baseline_delta)}</td>` +
    `<td>${summary.warnings?.length || 0}</td>`;
  return row;
}

function createCandidateMotionAudit(candidate) {
  const panel = document.createElement("div");
  panel.className = "candidate-motion-audit";
  panel.dataset.testid = `candidate-motion-audit-${candidate.id}`;

  const title = document.createElement("div");
  title.className = "motion-loop-title";
  title.textContent = "Motion consistency audit";

  const status = document.createElement("div");
  status.className = "meta-line";
  status.textContent = "Loading motion metrics...";

  panel.append(title, status);

  if (!candidate.leftMotionPath || !candidate.rightMotionPath) {
    status.textContent = "No motion metrics recorded for this candidate.";
    return panel;
  }

  Promise.all([
    fetch(candidate.leftMotionPath).then((response) => response.json()),
    fetch(candidate.rightMotionPath).then((response) => response.json()),
  ])
    .then(([left, right]) => {
      const table = document.createElement("table");
      table.className = "motion-audit-table";
      table.innerHTML =
        "<thead><tr>" +
        "<th>Row</th>" +
        "<th>Hair X jump</th>" +
        "<th>Hair Y jump</th>" +
        "<th>Hair top jump</th>" +
        "<th>Baseline jump</th>" +
        "<th>Warnings</th>" +
        "</tr></thead>";
      const body = document.createElement("tbody");
      body.append(
        motionSummaryRow("Left", left),
        motionSummaryRow("Right", right),
      );
      table.appendChild(body);

      const warnings = document.createElement("ul");
      warnings.className = "candidate-notes motion-warnings";
      const combinedWarnings = [
        ...left.summary.warnings.map((warning) => `Left: ${warning}`),
        ...right.summary.warnings.map((warning) => `Right: ${warning}`),
      ];
      if (combinedWarnings.length === 0) {
        const item = document.createElement("li");
        item.textContent =
          "No metric warnings, but visual review still decides acceptance.";
        warnings.appendChild(item);
      } else {
        for (const warning of combinedWarnings) {
          const item = document.createElement("li");
          item.textContent = warning;
          warnings.appendChild(item);
        }
      }

      status.textContent =
        "Flags frame-to-frame head/hair jumps that can read as jerkiness.";
      panel.append(table, warnings);
    })
    .catch((error) => {
      status.textContent = `Could not load motion metrics: ${error.message}`;
    });

  return panel;
}

function createCandidateCard(candidate) {
  const card = document.createElement("article");
  card.className = "card candidate-card";
  card.dataset.testid = `candidate-card-${candidate.id}`;

  const header = document.createElement("div");
  header.className = "card-header";

  const titleRow = document.createElement("div");
  titleRow.className = "card-title";

  const title = document.createElement("h3");
  title.textContent = candidate.label;

  const badgeRow = document.createElement("div");
  badgeRow.className = "badge-row";
  badgeRow.append(
    createBadge("Candidate", "sheet"),
    createBadge(candidate.status, "warning"),
  );

  titleRow.append(title, badgeRow);

  const path = document.createElement("div");
  path.className = "card-path";
  path.textContent = candidate.sourcePath;

  header.append(titleRow, path);

  const body = document.createElement("div");
  body.className = "card-body";

  const notes = document.createElement("ul");
  notes.className = "candidate-notes";
  for (const note of candidate.notes) {
    const item = document.createElement("li");
    item.textContent = note;
    notes.appendChild(item);
  }

  const sourceBlock = document.createElement("div");
  sourceBlock.className = "candidate-source";
  const sourceTitle = document.createElement("div");
  sourceTitle.className = "motion-loop-title";
  sourceTitle.textContent = "Generated source strip";
  const sourceWrap = document.createElement("div");
  sourceWrap.className = previewClassName();
  const sourceImg = document.createElement("img");
  sourceImg.alt = `${candidate.label} source`;
  sourceImg.src = candidate.sourcePath;
  sourceImg.dataset.testid = `candidate-source-${candidate.id}`;
  sourceWrap.appendChild(sourceImg);
  sourceBlock.append(sourceTitle, sourceWrap);

  const rowGrid = document.createElement("div");
  rowGrid.className = "candidate-row-grid";
  for (const [label, rowPath] of [
    ["Left runtime row", candidate.leftRowPath],
    ["Right runtime row", candidate.rightRowPath],
  ]) {
    const rowBlock = document.createElement("div");
    rowBlock.className = "candidate-row";
    const rowTitle = document.createElement("div");
    rowTitle.className = "motion-loop-title";
    rowTitle.textContent = label;
    const rowWrap = document.createElement("div");
    rowWrap.className = previewClassName();
    const rowImg = document.createElement("img");
    rowImg.alt = `${candidate.label} ${label}`;
    rowImg.src = rowPath;
    rowImg.dataset.testid = `candidate-row-${candidate.id}-${label
      .toLowerCase()
      .replace(/\s+/g, "-")}`;
    rowWrap.appendChild(rowImg);
    rowBlock.append(rowTitle, rowWrap);
    rowGrid.appendChild(rowBlock);
  }

  const proofBlock = document.createElement("div");
  proofBlock.className = "candidate-proof";
  const proofTitle = document.createElement("div");
  proofTitle.className = "motion-loop-title";
  proofTitle.textContent = "Animated side proof";
  const proofWrap = document.createElement("div");
  proofWrap.className = previewClassName();
  const proofImg = document.createElement("img");
  proofImg.alt = `${candidate.label} animated side proof`;
  proofImg.src = candidate.gifPath;
  proofImg.dataset.testid = `candidate-gif-${candidate.id}`;
  proofWrap.appendChild(proofImg);
  proofBlock.append(proofTitle, proofWrap);

  body.append(
    notes,
    sourceBlock,
    rowGrid,
    createCandidateMotionProof(candidate),
    createCandidateMotionAudit(candidate),
    proofBlock,
  );
  card.append(header, body);
  return card;
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
    createBadge(sheet.geometry.formatLabel, "runtime"),
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
  sheet.geometry.directions.forEach((dir, index) => {
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

  const motionProof = document.createElement("div");
  motionProof.className = "motion-proof";
  motionProof.dataset.testid = `motion-proof-${sheet.id}`;
  motionProof.appendChild(createPoseSequencePanel());

  const inspector = document.createElement("div");
  inspector.className = "sheet-inspector";

  const selectedPreview = document.createElement("div");
  selectedPreview.className = previewClassName();
  selectedPreview.dataset.testid = `sheet-selected-${sheet.id}`;

  const selectedMeta = document.createElement("div");
  selectedMeta.className = "sheet-inspector-meta";
  selectedMeta.innerHTML =
    `<div class="meta-line"><strong>Runtime key:</strong> ${sheet.runtimeKey}</div>` +
    `<div class="meta-line"><strong>Rows:</strong> ${sheet.geometry.directions.join(", ")}</div>` +
    `<div class="meta-line"><strong>Status:</strong> Waiting for image load...</div>`;

  inspector.append(selectedPreview, selectedMeta);
  body.append(layout, motionProof, inspector);
  card.append(header, body);

  img.addEventListener("load", () => {
    let cells;
    try {
      cells = buildSheetCells(
        img.naturalWidth,
        img.naturalHeight,
        sheet.geometry,
      );
    } catch (error) {
      meta.textContent = error.message;
      grid.innerHTML = `<div class="broken">${error.message}</div>`;
      return;
    }

    meta.textContent =
      `${img.naturalWidth}x${img.naturalHeight} sheet | ` +
      `${sheet.geometry.rows} rows x ${sheet.geometry.columns} columns | ` +
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
    motionProof.replaceChildren(
      createPoseSequencePanel(),
      ...createMotionProof({
        img,
        cells,
        classId: sheet.id,
        geometry: sheet.geometry,
      }),
    );

    card.dataset.loaded = "true";
    selectCell(cells[0]);
  });

  img.addEventListener("error", () => {
    meta.textContent = "Sheet is missing or unreadable.";
    overlay.replaceChildren();
    motionProof.replaceChildren();
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

function renderAttackSheets() {
  const target = document.getElementById("attack-grid");
  target.replaceChildren(
    ...debuggerCatalog.attackSheets.map((sheet) => buildWalkSheetCard(sheet)),
  );
}

function renderWalkCandidates() {
  const target = document.getElementById("candidate-grid");
  target.replaceChildren(
    ...debuggerCatalog.walkCandidates.map((candidate) =>
      createCandidateCard(candidate),
    ),
  );
}

function render() {
  renderAssetGrid("fallback-grid", debuggerCatalog.fallbackDirectionals, {
    badgeClass: "fallback",
    displayWidth: 128,
    displayHeight: 128,
  });

  renderWalkSheets();
  renderAttackSheets();
  renderWalkCandidates();

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
    `<div class="meta-line"><strong>Walk sheets:</strong> Per-class runtime geometry; skill-native sheets are 6x8 cells at 64x64</div>` +
    `<div class="meta-line"><strong>Attack sheets:</strong> Skill-native 8x8 cells at 64x64</div>` +
    `<div class="meta-line"><strong>Walk cycle:</strong> contact, down, passing, high, contact, down</div>` +
    `<div class="meta-line"><strong>Battle backgrounds:</strong> 800x600 PNG (pre-rendered Gemini scenes, +@2x companion)</div>` +
    `<div class="meta-line"><strong>Inspect cells:</strong> Click any grid cell to zoom and verify crop bounds</div>` +
    `<div class="meta-line"><strong>Motion proof:</strong> Review left/right loops before accepting a walk sheet</div>`;

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
