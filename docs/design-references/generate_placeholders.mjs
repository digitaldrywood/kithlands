// One-shot placeholder generator for design-references/.
//
// Both Fandom and GameUIDatabase reject automated fetches (HTTP 403), and
// Wikimedia Commons does not host FF screenshots (copyright). This script
// emits clearly-labelled placeholder PNGs at the right dimensions so the
// design-validation skill has a complete reference bank to point at while
// the PM manually sources the real screenshots from a browser.
//
// Each placeholder is a 1024x768 PNG with the scene name + intended source
// rendered into the image, so anyone opening the file knows exactly what's
// expected and where it should come from.
//
// Re-run as: node generate_placeholders.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("/home/loganlanou/.claude/skills/design-validation/node_modules/sharp");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 1024;
const HEIGHT = 768;

const REFERENCES = [
  {
    file: "ff6-party-menu.png",
    title: "FF6 Party Menu",
    source: "Spriters Resource — SNES FF6 menu sheet",
    bg: "#101a30",
    accent: "#4488ff",
  },
  {
    file: "ff6-battle.png",
    title: "FF6 Battle",
    source: "Spriters Resource — SNES FF6 battle sheet",
    bg: "#1d1224",
    accent: "#ff8844",
  },
  {
    file: "ff9-battle.png",
    title: "FF9 Battle",
    source: "Spriters Resource — PSX FF9 battle UI",
    bg: "#191c2e",
    accent: "#88aaff",
  },
  {
    file: "ff6-overworld-town.png",
    title: "FF6 Overworld Town",
    source: "Spriters Resource — SNES FF6 overworld tiles",
    bg: "#3c5a2a",
    accent: "#c8a060",
  },
  {
    file: "ff6-town-interior.png",
    title: "FF6 Town Interior (Inn)",
    source: "Spriters Resource — SNES FF6 inn interior",
    bg: "#3a2a1a",
    accent: "#ffcc66",
  },
  {
    file: "ff4-castle-interior.png",
    title: "FF4 Castle Interior",
    source: "Spriters Resource — SNES FF4 castle tiles",
    bg: "#2a2238",
    accent: "#cc88ff",
  },
  {
    file: "ff9-formation.png",
    title: "FF9 Order (Formation)",
    source: "Spriters Resource — PSX FF9 menu sheet",
    bg: "#0d1530",
    accent: "#66ddff",
  },
  {
    file: "ff6-load-save.png",
    title: "FF6 Load/Save Panel",
    source: "Spriters Resource — SNES FF6 load/save sheet",
    bg: "#10192d",
    accent: "#ffcc44",
  },
  {
    file: "ff6-menu-select.png",
    title: "FF6 Menu Selection State",
    source: "Spriters Resource — SNES FF6 menu sheet",
    bg: "#10192d",
    accent: "#ffe080",
  },
  {
    file: "ff6-shop.png",
    title: "FF6 Shop UI",
    source: "Spriters Resource — SNES FF6 shop sheet",
    bg: "#1a2238",
    accent: "#aaff88",
  },
  {
    file: "ff6-name-entry.png",
    title: "FF6 Name Entry",
    source: "Spriters Resource — SNES FF6 name entry",
    bg: "#0e1828",
    accent: "#ff88aa",
  },
];

function escapeXml(str) {
  return str.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c],
  );
}

function svgFor({ title, source, bg, accent }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" fill="none" stroke="${accent}" stroke-width="6"/>
  <rect x="56" y="56" width="${WIDTH - 112}" height="${HEIGHT - 112}" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2"/>
  <text x="${WIDTH / 2}" y="240" text-anchor="middle" font-family="monospace" font-size="56" font-weight="bold" fill="#ffffff">${escapeXml(title)}</text>
  <text x="${WIDTH / 2}" y="320" text-anchor="middle" font-family="monospace" font-size="28" fill="${accent}">REFERENCE PLACEHOLDER</text>
  <text x="${WIDTH / 2}" y="420" text-anchor="middle" font-family="monospace" font-size="22" fill="#cccccc">Drop in screenshot from:</text>
  <text x="${WIDTH / 2}" y="460" text-anchor="middle" font-family="monospace" font-size="22" fill="#ffffff">${escapeXml(source)}</text>
  <text x="${WIDTH / 2}" y="600" text-anchor="middle" font-family="monospace" font-size="18" fill="#888888">design-validation skill calibration target</text>
  <text x="${WIDTH / 2}" y="640" text-anchor="middle" font-family="monospace" font-size="18" fill="#888888">see docs/design-references/README.md</text>
</svg>`;
}

async function main() {
  for (const ref of REFERENCES) {
    const out = path.join(__dirname, ref.file);
    await sharp(Buffer.from(svgFor(ref)))
      .png({ compressionLevel: 9 })
      .toFile(out);
    process.stdout.write(`wrote ${ref.file}\n`);
  }
}

main();
