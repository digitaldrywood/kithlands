import { element, viewportDialog } from "./viewport_dialog.js";
import { inferPartyRow } from "../scenes/battle_layout.js";
import { combatantConditionLabel } from "../systems/hpBar.js";
import "../styles/party-menu.css";

const labels = {
  CHARACTER: "Character",
  ITEMS: "Items",
  MAGIC: "Magic",
  FORMATION: "Formation",
  "QUEST LOG": "Quest journal",
  "WORLD MAP": "World map",
  SAVE: "Save game",
  OPTIONS: "Settings",
  CLOSE: "Back to game",
  "AUTO: ON": "Autosave on",
  "AUTO: OFF": "Autosave off",
};
function actionLabel(label) {
  return labels[label] || label.replace("GEMS", "Gem workshop");
}
function stat(label, value, max, kind) {
  const row = element("div", `party-stat ${kind}`);
  const caption = element("div", "party-stat-caption");
  caption.append(
    element("span", "", label),
    element("span", "", `${value || 0} / ${max || 0}`),
  );
  const bar = element("progress");
  bar.max = Math.max(1, max || 0);
  bar.value = Math.max(0, value || 0);
  bar.setAttribute("aria-label", label);
  row.append(caption, bar);
  return row;
}
export function renderPartyMenu(scene, { party, actions, onClose, onSelect }) {
  const handles = new Map();
  const dialog = viewportDialog(scene, {
    key: "party_menu_view",
    title: "Your party",
    onEscape: onClose,
    onKey: (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat)
        return;
      const handle = handles.get(event.key.toUpperCase());
      if (handle && !handle.button.disabled) {
        event.preventDefault();
        handle.button.click();
      }
    },
  });
  dialog.root.classList.add("modern-party-menu");
  dialog.header.prepend(element("p", "party-eyebrow", "KITHLANDS  /  PAUSED"));
  const close = element("button", "party-dismiss", "×");
  close.setAttribute("aria-label", "Back to game");
  close.addEventListener("click", onClose);
  dialog.header.append(close);
  const resources = element("div", "party-resources");
  for (const [label, value] of [
    ["Gold", scene.gameState.gold || 0],
    ["Potions", scene.gameState.potions || 0],
    [
      "Ether",
      (scene.gameState.ethers || 0) +
        (scene.gameState.hi_ethers || 0) +
        (scene.gameState.x_ethers || 0),
    ],
  ]) {
    const chip = element("span", "");
    chip.append(
      element("strong", "", String(value)),
      element("span", "", label),
    );
    resources.append(chip);
  }
  dialog.header.append(resources);
  const sidebar = element("nav", "party-sidebar");
  sidebar.setAttribute("aria-label", "Game menu");
  const nav = element("div", "party-nav-scroll");
  nav.tabIndex = 0;
  nav.setAttribute("aria-label", "More menu actions");
  actions.forEach((action, index) => {
    const button = element("button", "party-nav-action");
    button.type = "button";
    button.dataset.action = action.hotkey || "exit";
    const label = element("span", "", actionLabel(action.label));
    button.append(label);
    if (action.hotkey)
      button.append(
        element("kbd", "", action.hotkey === "ESC" ? "Esc" : action.hotkey),
      );
    button.disabled = action.enabled === false;
    button.addEventListener("click", () => action.onClick());
    const handle = {
      button,
      setLabel: (value) => {
        label.textContent = actionLabel(value);
      },
      setEnabled: (enabled) => {
        button.disabled = !enabled;
      },
    };
    handles.set(action.hotkey, handle);
    if (index === 0) {
      button.classList.add("party-exit");
      label.textContent = "Exit game";
      button.setAttribute("aria-label", "Exit to main menu");
      dialog.header.append(button);
      sidebar.append(element("p", "party-nav-heading", "ADVENTURE"));
    } else nav.append(button);
  });
  sidebar.append(nav);
  const overview = element("div", "party-overview");
  const intro = element("div", "party-overview-heading");
  intro.append(
    element("h2", "", "Traveling companions"),
    element("span", "", `${party.length} in your party`),
  );
  const cards = element("div", "party-cards");
  const buttons = [];
  party.forEach((member, slot) => {
    const card = element("button", "party-card");
    card.type = "button";
    card.setAttribute("aria-pressed", String(slot === 0));
    card.setAttribute("aria-label", `Select ${member.name}`);
    const portrait = element("img", "party-portrait");
    portrait.src = `/sprites/${member.sprite_id || member.class_id}.png`;
    portrait.alt = "";
    const details = element("div", "party-member-details");
    const title = element("div", "party-member-title");
    title.append(
      element("h3", "", member.name),
      element("span", "party-level", `Lv. ${member.level || 1}`),
    );
    const status = combatantConditionLabel(
      member.hp,
      member.max_hp,
      member.status,
    );
    details.append(
      title,
      element(
        "p",
        "party-class",
        `${member.class_name || member.class_id || "Adventurer"} · ${inferPartyRow(member)} row${status ? ` · ${status}` : ""}`,
      ),
    );
    details.append(stat("Health", member.hp, member.max_hp, "health"));
    if (member.max_mp > 0)
      details.append(stat("Magic", member.mp, member.max_mp, "magic"));
    details.append(stat("Experience", member.xp, member.xp_next, "experience"));
    card.append(portrait, details);
    card.addEventListener("click", () => {
      onSelect(slot);
      buttons.forEach((item, i) =>
        item.setAttribute("aria-pressed", String(i === slot)),
      );
    });
    buttons.push(card);
    cards.append(card);
  });
  overview.append(
    intro,
    cards,
    element(
      "p",
      "party-tip",
      "Select a companion, then open Character to manage their equipment and abilities.",
    ),
  );
  dialog.body.append(sidebar, overview);
  dialog.footer.remove();
  return { ...dialog, handles };
}
