import { toggleMenu } from "./world_menu.js";
import { getMonsters } from "../api.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";
import { mountBestiary, element, button } from "../ui/bestiary.js";
import "../styles/codex.css";

// Existing reference guides; the bestiary alone uses the live catalog.
const EQUIPMENT_GUIDE = [
  {
    title: "Weapons",
    items: [
      { name: "Wooden Club", pow: 5, tier: 1, who: "Warrior" },
      {
        name: "Wooden Staff",
        pow: 4,
        tier: 1,
        who: "Mender, Cinder, Wayfarer",
      },
      {
        name: "Short Sword",
        pow: 6,
        tier: 1,
        who: "Warrior, Wayfarer",
      },
      {
        name: "Rusty Dagger",
        pow: 4,
        tier: 1,
        who: "Rogue, Cinder, Wayfarer",
      },
      {
        name: "Iron Sword",
        pow: 12,
        tier: 2,
        who: "Warrior, Wayfarer",
      },
      {
        name: "Steel Sword",
        pow: 22,
        tier: 3,
        who: "Warrior, Wayfarer",
      },
      {
        name: "Arcane Staff",
        pow: 14,
        tier: 3,
        who: "Mender, Cinder, Wayfarer",
      },
    ],
  },
  {
    title: "Armor",
    items: [
      { name: "Cloth Robe", pow: 2, tier: 1, who: "All casters" },
      {
        name: "Leather Armor",
        pow: 5,
        tier: 1,
        who: "Warrior, Rogue, Wayfarer",
      },
      {
        name: "Chain Mail",
        pow: 12,
        tier: 2,
        who: "Warrior, Wayfarer",
      },
      { name: "Plate Mail", pow: 22, tier: 3, who: "Warrior only" },
    ],
  },
];

const SPELL_GUIDE = [
  {
    name: "Black Magic (Cinder)",
    color: "#ff6666",
    spells: [
      {
        name: "Spark",
        lvl: 1,
        desc: "Fire dmg to one",
        how: "Starting spell",
      },
      {
        name: "Frost",
        lvl: 1,
        desc: "Ice dmg to one",
        how: "Buy at magic shop",
      },
      {
        name: "Sleep",
        lvl: 1,
        desc: "Put enemy to sleep",
        how: "Buy at magic shop",
      },
      {
        name: "Ember",
        lvl: 2,
        desc: "Fire dmg to all",
        how: "Buy at magic shop",
      },
      {
        name: "Chill",
        lvl: 2,
        desc: "Ice dmg to all",
        how: "Buy at magic shop",
      },
      {
        name: "Shock",
        lvl: 2,
        desc: "Lightning dmg to one",
        how: "Buy at magic shop",
      },
    ],
  },
  {
    name: "White Magic (Mender)",
    color: "#66ff66",
    spells: [
      {
        name: "Cure",
        lvl: 1,
        desc: "Heal one ally ~16 HP",
        how: "Starting spell",
      },
      {
        name: "Light",
        lvl: 1,
        desc: "Illuminate dungeons",
        how: "Buy at magic shop",
      },
      {
        name: "Bless",
        lvl: 1,
        desc: "+10% hit to ally",
        how: "Buy at magic shop",
      },
      {
        name: "Heal",
        lvl: 2,
        desc: "Heal all allies ~16 HP",
        how: "Buy at magic shop",
      },
      {
        name: "Mute",
        lvl: 2,
        desc: "Silence one enemy",
        how: "Buy at magic shop",
      },
      {
        name: "Cure Poison",
        lvl: 2,
        desc: "Remove poison",
        how: "Buy at magic shop",
      },
    ],
  },
];

export function toggleCodex(scene) {
  if (scene.codexOpen) {
    scene.codexView?.destroy();
    return;
  }
  if (scene.menuOpen) toggleMenu(scene);

  const previousFocus = document.activeElement;
  const previousInput = scene.input.enabled;
  const previousKeyboard = scene.input.keyboard?.enabled;
  scene.codexOpen = true;
  pauseWorldFor(scene, "codex");
  scene.input.enabled = false;
  if (scene.input.keyboard) scene.input.keyboard.enabled = false;

  const backdrop = element("div", "kith-codex-backdrop");
  const root = element("section", "kith-codex");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "codex-title");
  const header = element("header", "codex-header");
  const title = element("h1", "", "Field codex");
  title.id = "codex-title";
  const close = button("Close", () => destroy());
  close.setAttribute("aria-label", "Close codex");
  header.append(title, close);
  const tabs = element("nav", "codex-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Codex guides");
  const content = element("div", "codex-content");
  content.setAttribute("role", "tabpanel");
  content.id = "codex-panel";
  const footer = element(
    "footer",
    "codex-footer",
    "H / Esc to close · Arrow keys to browse",
  );
  root.append(header, tabs, content, footer);
  backdrop.append(root);
  (document.querySelector("#game-ui") || document.body).append(backdrop);

  let disposed = false;
  let tabCleanup = null;
  let generation = 0;
  const tabButtons = [];
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    tabCleanup?.();
    backdrop.remove();
    scene.events.off("shutdown", destroy);
    scene.codexView = null;
    scene.codexOpen = false;
    scene.input.enabled = previousInput;
    if (scene.input.keyboard) {
      scene.input.keyboard.resetKeys();
      scene.input.keyboard.enabled = previousKeyboard;
    }
    resumeWorldFor(scene, "codex");
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  scene.codexView = { destroy };
  scene.events.once("shutdown", destroy);

  const renderTab = async (key) => {
    const restoreTabFocus = content.contains(document.activeElement);
    const current = ++generation;
    tabCleanup?.();
    tabCleanup = null;
    content.replaceChildren();
    for (const tab of tabButtons) {
      const selected = tab.dataset.tab === key;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if (restoreTabFocus)
      tabButtons.find((tab) => tab.dataset.tab === key)?.focus();
    content.setAttribute("aria-labelledby", `codex-tab-${key}`);
    if (key !== "bestiary") {
      renderGuide(content, key);
      return;
    }
    const status = element("p", "codex-status", "Loading monster catalog…");
    status.setAttribute("role", "status");
    content.append(status);
    try {
      const catalog = await getMonsters();
      if (disposed || generation !== current) return;
      if (!Array.isArray(catalog)) throw new Error("Catalog unavailable");
      content.replaceChildren();
      tabCleanup = mountBestiary(content, catalog, scene.gameState.discovered);
    } catch {
      if (disposed || generation !== current) return;
      status.textContent = "The monster catalog could not be loaded.";
      content.append(button("Try again", () => renderTab("bestiary")));
    }
  };
  for (const [key, label] of [
    ["bestiary", "Bestiary"],
    ["equipment", "Equipment"],
    ["spells", "Spells"],
  ]) {
    const tab = button(label, () => renderTab(key));
    tab.dataset.tab = key;
    tab.id = `codex-tab-${key}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "codex-panel");
    tabButtons.push(tab);
    tabs.append(tab);
  }
  tabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabButtons.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabButtons.length - 1
          : (index +
              (event.key === "ArrowRight" ? 1 : -1) +
              tabButtons.length) %
            tabButtons.length;
    tabButtons[next].focus();
    renderTab(tabButtons[next].dataset.tab);
  });
  // Stop DOM input from reaching Phaser's window-level handlers underneath.
  for (const name of ["pointerdown", "pointerup", "click", "wheel", "keyup"]) {
    backdrop.addEventListener(name, (event) => event.stopPropagation());
  }
  backdrop.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape" || event.key.toLowerCase() === "h") {
      event.preventDefault();
      destroy();
    } else if (event.key === "Tab") {
      const controls = [
        ...root.querySelectorAll('button:not([disabled]), [tabindex="0"]'),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  renderTab("bestiary");
  tabButtons[0].focus();
}

function renderGuide(content, key) {
  const guide = element("div", "codex-guide");
  guide.tabIndex = 0;
  guide.append(
    element("h2", "", key === "equipment" ? "Equipment Guide" : "Spellbook"),
  );
  if (key === "equipment") {
    for (const section of EQUIPMENT_GUIDE) {
      guide.append(element("h3", "", section.title));
      for (const item of section.items) {
        const row = element("p", "codex-guide-row");
        row.append(
          element("strong", "", item.name),
          element(
            "span",
            "",
            `Tier ${item.tier} · ${section.title === "Armor" ? "Absorb" : "Power"} ${item.pow} · ${item.who}`,
          ),
        );
        guide.append(row);
      }
    }
  } else {
    for (const school of SPELL_GUIDE) {
      guide.append(element("h3", "", school.name));
      for (const spell of school.spells) {
        const row = element("p", "codex-guide-row");
        row.append(
          element("strong", "", `Level ${spell.lvl} · ${spell.name}`),
          element("span", "", `${spell.desc} · ${spell.how}`),
        );
        guide.append(row);
      }
    }
  }
  content.append(guide);
}
