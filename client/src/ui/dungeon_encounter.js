import { element, viewportDialog } from "./viewport_dialog.js";
import {
  MONSTER_SPRITE_LOAD,
  monsterSpriteKey,
} from "../data/monsterSprites.js";
import "../styles/dungeon-encounter.css";

// The server supplies the actual roster and level, never a client threat roll.
export function showDungeonEncounter(scene, action, onFight) {
  let dialog;
  const close = () => dialog.dispose();
  dialog = viewportDialog(scene, {
    key: "trail-encounter",
    title: "Optional encounter",
    onEscape: close,
    onKey(event) {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      const buttons = [...dialog.footer.querySelectorAll("button")];
      const index = buttons.indexOf(document.activeElement);
      const delta = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      buttons[(index + delta + buttons.length) % buttons.length]?.focus();
    },
  });
  dialog.root.classList.add("dungeon-encounter");
  const preview = action.encounter;
  dialog.body.append(
    element("p", "encounter-description", preview.description),
  );
  const groups = new Map();
  for (const enemy of preview.enemies) {
    const group = groups.get(enemy.monster_id);
    if (group) group.count++;
    else groups.set(enemy.monster_id, { ...enemy, count: 1 });
  }
  for (const enemy of groups.values()) {
    const row = element("article", "encounter-enemy");
    const art = MONSTER_SPRITE_LOAD.find(
      (entry) => entry.key === monsterSpriteKey(enemy),
    );
    if (art) {
      const image = element("img");
      image.src = art.path;
      image.alt = "";
      row.append(image);
    }
    const details = element("div");
    details.append(
      element(
        "h2",
        "",
        `${enemy.name}${enemy.count > 1 ? ` × ${enemy.count}` : ""} · Level ${preview.level}`,
      ),
      element("p", "", enemy.tactics),
    );
    row.append(details);
    dialog.body.append(row);
  }
  dialog.body.append(
    element(
      "p",
      "encounter-note",
      "Field-guide advice describes strengths and weaknesses; it does not predict the next attack.",
    ),
  );
  dialog.footer.classList.add("dialog-actions");
  const back = element("button", "", "Back to the trail");
  back.addEventListener("click", close);
  const fight = element("button", "primary", "Fight");
  fight.addEventListener("click", () => {
    close();
    onFight();
  });
  dialog.footer.append(back, fight);
  back.focus();
  return dialog;
}
