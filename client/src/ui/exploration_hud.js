import { element } from "./viewport_dialog.js";
import { activeWorldLocks } from "../systems/modalLock.js";
import { isTouchDevice } from "../systems/input.js";
import "../styles/exploration-hud.css";

// This is a presentation layer only. Actions continue through the scene's
// existing input handlers and authoritative server transitions.
export function explorationHUD(scene, { menu, help, mute, isMuted, colors }) {
  const root = element("section", "exploration-hud");
  root.setAttribute("aria-label", "Exploration controls");
  const objective = element("div", "explore-objective explore-surface");
  const title = element("strong");
  const detail = element("p");
  const saveStatus = element("span", "explore-save-status");
  saveStatus.setAttribute("role", "status");
  objective.append(
    element("span", "explore-eyebrow", "CURRENT OBJECTIVE"),
    title,
    detail,
  );
  const map = element("div", "explore-map explore-surface");
  const canvas = element("canvas");
  canvas.width = 120;
  canvas.height = 90;
  canvas.setAttribute("aria-label", "Nearby destinations");
  const dot = element("span", "explore-map-dot");
  map.append(canvas, dot);
  const ctx = canvas.getContext("2d");
  for (let y = 0; y < scene.mapH; y += 2) {
    for (let x = 0; x < scene.mapW; x += 2) {
      ctx.fillStyle = `#${(colors[scene.tileData[y][x]] || 0).toString(16).padStart(6, "0")}`;
      ctx.fillRect(
        (x * 120) / scene.mapW,
        (y * 90) / scene.mapH,
        Math.max(1, 240 / scene.mapW),
        Math.max(1, 180 / scene.mapH),
      );
    }
  }
  for (const spawn of scene.spawns) {
    ctx.fillStyle = spawn.kind === "natural" ? "#a8c995" : "#f4ebd1";
    ctx.fillRect(
      (spawn.x * 120) / scene.mapW - 1,
      (spawn.y * 90) / scene.mapH - 1,
      3,
      3,
    );
  }
  const bottom = element("div", "explore-bottom");
  const prompts = element("div", "explore-prompts");
  const interaction = element("button", "explore-interaction explore-surface");
  interaction.hidden = true;
  interaction.onclick = () => scene.handleAction();
  const notice = element("div", "explore-notice explore-surface");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  const footer = element("div", "explore-footer explore-surface");
  const party = element("div", "explore-party");
  const toolbar = element("div", "explore-toolbar");
  const resources = element("span", "explore-resources");
  const buttons = element("div", "explore-actions");
  const button = (text, callback) => {
    const item = element("button", "", text);
    item.type = "button";
    item.onclick = callback;
    buttons.append(item);
    return item;
  };
  const sound = button(isMuted() ? "Unmute" : "Mute", () => {
    mute();
    sound.textContent = isMuted() ? "Unmute" : "Mute";
  });
  button("Help", help);
  button("Menu", menu).classList.add("explore-menu-button");
  toolbar.append(resources, buttons);
  footer.append(party, toolbar);
  bottom.append(notice, interaction, prompts, footer);
  root.append(objective, map, saveStatus, bottom);
  document.body.append(root);
  // DOM controls must never also become a world click/tap.
  for (const event of ["pointerdown", "pointerup", "click", "wheel"])
    root.addEventListener(event, (e) => e.stopPropagation());
  const position = () => {
    const rect = scene.game.canvas.getBoundingClientRect();
    Object.assign(root.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  };
  const observer = new ResizeObserver(position);
  observer.observe(scene.game.canvas);
  window.addEventListener("resize", position);
  position();
  let previous = "";
  let suspended = false;
  const update = () => {
    root.hidden =
      suspended || activeWorldLocks(scene).length > 0 || !!scene.gameOver;
    root.classList.toggle("explore-touch", isTouchDevice());
    saveStatus.textContent =
      scene.saveIcon?.alpha > 0 ? scene.saveIcon.text : "";
    saveStatus.hidden = !saveStatus.textContent;
    dot.style.left = `${(scene.playerX / scene.mapW) * 100}%`;
    dot.style.top = `${(scene.playerY / scene.mapH) * 100}%`;
    const gs = scene.gameState;
    const state = JSON.stringify([
      gs.party,
      gs.gold,
      gs.potions,
      gs.ethers,
      gs.hi_ethers,
      gs.x_ethers,
      gs.transport?.tier_name,
    ]);
    if (state === previous) return;
    previous = state;
    party.replaceChildren();
    for (const member of gs.party || []) {
      const card = element("div", "explore-member");
      const portrait = element("img");
      portrait.src = `/sprites/${member.sprite_id || member.class_id}.png`;
      portrait.alt = "";
      const info = element("div");
      const name = element("strong", "", member.name);
      const hp = element("span", "", `${member.hp}/${member.max_hp} HP`);
      const bar = element("progress");
      bar.max = Math.max(1, member.max_hp || 1);
      bar.value = member.hp || 0;
      bar.setAttribute("aria-label", `${member.name} health`);
      info.append(name, hp, bar);
      if (member.max_mp > 0)
        info.append(element("small", "", `${member.mp}/${member.max_mp} MP`));
      card.append(portrait, info);
      party.append(card);
    }
    resources.textContent = `${gs.transport?.tier_name || "On foot"} · ${gs.gold || 0} Gold · ${gs.potions || 0} Potions · ${(gs.ethers || 0) + (gs.hi_ethers || 0) + (gs.x_ethers || 0)} Ether`;
  };
  // Paused/sleeping scenes stop updating, while their DOM remains mounted.
  // Hide immediately so another scene never inherits the World controls.
  const suspend = () => {
    suspended = true;
    root.hidden = true;
  };
  const resume = () => {
    suspended = false;
    position();
    update();
  };
  scene.events.on("pause", suspend);
  scene.events.on("sleep", suspend);
  scene.events.on("resume", resume);
  scene.events.on("wake", resume);
  scene.events.on("update", update);
  update();
  const dispose = () => {
    scene.events.off("pause", suspend);
    scene.events.off("sleep", suspend);
    scene.events.off("resume", resume);
    scene.events.off("wake", resume);
    scene.events.off("shutdown", dispose);
    scene.events.off("destroy", dispose);
    scene.events.off("update", update);
    observer.disconnect();
    window.removeEventListener("resize", position);
    root.remove();
    scene.explorationHUD = null;
  };
  scene.events.once("shutdown", dispose);
  scene.events.once("destroy", dispose);
  return {
    root,
    objective(heading, body) {
      title.textContent = heading;
      detail.textContent = body;
    },
    message(text) {
      notice.textContent = text;
      notice.hidden = !text;
    },
    interaction(text) {
      interaction.textContent = text;
      interaction.hidden = !text;
    },
    trail(label, onClick, route) {
      const item = element("button", "explore-trail explore-surface", label);
      item.type = "button";
      item.dataset.route = String(route);
      item.onclick = onClick;
      prompts.append(item);
      return {
        setLabel(value) {
          item.textContent = value;
        },
        setEnabled(enabled) {
          item.disabled = !enabled;
        },
        destroy() {
          item.remove();
        },
      };
    },
  };
}
