import { element } from "./viewport_dialog.js";
import "../styles/quest-milestone.css";

// Compare authoritative responses; this never awards XP or predicts a level.
export function questMilestone(previous, next) {
  if (!previous?.id || previous.id !== next?.id || next.error) return null;
  const quest = next.quests?.find(
    (q) =>
      q.completed &&
      previous.quests?.some((old) => old.id === q.id && !old.completed),
  );
  if (!quest) return null;
  const levels = (next.party || []).flatMap((member, index) => {
    const old = previous.party?.[index];
    return old && member.name === old.name && member.level > old.level
      ? [{ name: member.name, level: member.level }]
      : [];
  });
  return {
    key: `${next.id}:${quest.id}`,
    name: quest.name,
    reward: quest.reward,
    levels,
  };
}

let active = null;
const shown = new Set();
function dismiss() {
  if (!active) return;
  clearTimeout(active.fade);
  clearTimeout(active.expiry);
  active.observer.disconnect();
  window.removeEventListener("resize", active.position);
  active.root.remove();
  active = null;
}

export function clearQuestMilestones() {
  dismiss();
  shown.clear();
}

export function showQuestMilestone(scene, previous, next) {
  const milestone = questMilestone(previous, next);
  if (!milestone || shown.has(milestone.key)) return false;
  dismiss();
  shown.add(milestone.key);
  const root = element("aside", "quest-milestone");
  root.setAttribute("role", "status");
  root.setAttribute("aria-label", "Quest reward");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");
  const close = element("button", "quest-milestone-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss quest reward");
  close.addEventListener("click", dismiss);
  for (const type of ["keydown", "keyup"])
    close.addEventListener(type, (event) => {
      // Native button activation must not also confirm the NPC beneath it.
      if (["Enter", " "].includes(event.key)) event.stopPropagation();
    });
  root.append(
    close,
    element("p", "quest-milestone-heading", "Quest complete"),
    element("h2", "quest-milestone-name", milestone.name),
    element(
      "p",
      "quest-milestone-reward",
      `+${milestone.reward.xp} XP · +${milestone.reward.gold} gold`,
    ),
  );
  for (const member of milestone.levels)
    root.append(
      element(
        "p",
        "quest-milestone-level",
        `${member.name} · Level ${member.level}`,
      ),
    );
  for (const event of ["pointerdown", "pointerup", "click"])
    root.addEventListener(event, (event) => event.stopPropagation());
  document.body.append(root);
  const position = () => {
    const rect = scene.game.canvas.getBoundingClientRect();
    Object.assign(root.style, {
      top: `${rect.top + 16}px`,
      right: `${Math.max(16, window.innerWidth - rect.right + 16)}px`,
      width: `${Math.min(360, rect.width - 32)}px`,
    });
  };
  const observer = new ResizeObserver(position);
  observer.observe(scene.game.canvas);
  window.addEventListener("resize", position);
  position();
  // Lives outside scene UI so a building transition cannot erase the reward.
  active = {
    root,
    position,
    observer,
    fade: setTimeout(() => root.classList.add("is-leaving"), 8000),
    expiry: setTimeout(dismiss, 8400),
  };
  return true;
}
