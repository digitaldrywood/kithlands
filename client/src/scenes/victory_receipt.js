import { element, viewportDialog } from "../ui/viewport_dialog.js";
import { buildVictoryXPSegments } from "../systems/victoryXp.js";
import {
  buildVictorySummary,
  buildFinalePartyXP,
  buildPartyXP,
  formatSpoils,
} from "../systems/victoryPresentation.js";
import "../styles/victory-receipt.css";

// Presentation only: totals, thresholds, KO eligibility and rewards come from Go.
export function showVictoryReceipt(scene, gs, { onContinue, onTallyDone }) {
  let ready = false;
  let finished = false;
  let continued = false;
  const rows = [];
  const timers = [];
  const tweens = [];
  const continueOnce = () => {
    if (!ready || continued || dialog.disposed) return;
    continued = true;
    finish();
    onContinue();
  };
  const dialog = viewportDialog(scene, {
    key: "victory-receipt",
    title: "VICTORY!",
    onEscape: continueOnce,
    onKey: (event) => {
      if (["Enter", "Space"].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.key === "Enter") {
        event.preventDefault();
        continueOnce();
      } else if (event.code === "Space") {
        event.preventDefault();
        if (!finished) finish();
        else continueOnce();
      }
    },
  });
  dialog.root.classList.add("victory-receipt");
  dialog.header.append(element("p", "", "Rewards and party progress"));
  const summary = buildVictorySummary(gs.combat_log || [], gs.battle_rewards);
  const finaleXP = buildFinalePartyXP(gs);
  if (finaleXP) summary.xpEarned = finaleXP.reduce((sum, n) => sum + n, 0);
  const amounts = buildPartyXP(gs);
  const rewards = element("div", "victory-rewards");
  for (const [label, value, detail] of [
    ["XP earned", `+${summary.xpEarned}`, "Shared by active allies"],
    ["Gold earned", `+${summary.goldEarned}`, `${gs.gold || 0} gold in purse`],
    ["Spoils", String(summary.found.length), "Items recovered"],
  ]) {
    const card = element("section", "victory-reward");
    card.append(
      element("h2", "", label),
      element("strong", "", value),
      element("p", "", detail),
    );
    rewards.append(card);
  }
  dialog.body.append(
    rewards,
    element("h2", "victory-party-heading", "Party progress"),
  );
  const party = element("div", "victory-party");
  for (const [index, member] of (gs.party || []).entries()) {
    const row = element("section", "victory-member");
    row.dataset.partySlot = index;
    const portrait = element("img", "victory-portrait");
    portrait.src = `/sprites/${member.sprite_id || member.class_id}.png`;
    portrait.alt = "";
    const content = element("div", "victory-member-content");
    const heading = element("div", "victory-member-heading");
    heading.append(element("h3", "", member.name));
    const died = gs.died_this_fight?.[index] === true;
    const leveled = !died && (gs.xp_thresholds?.[index]?.length || 0) > 1;
    if (leveled)
      heading.append(element("strong", "victory-level-up", "LEVEL UP"));
    content.append(
      heading,
      element(
        "p",
        "victory-class",
        `${member.class_name || member.class_id} · Level ${member.level}`,
      ),
    );
    const facts = element("div", "victory-member-facts");
    facts.append(
      element("p", "victory-health", `HP ${member.hp} / ${member.max_hp}`),
    );
    const gain = element(
      "p",
      `victory-xp-gain${died ? " is-defeated" : ""}`,
      died
        ? "NO XP · DEFEATED"
        : amounts[index] == null
          ? "XP updated"
          : `+${amounts[index]} XP`,
    );
    facts.append(gain);
    const xp = element(
      "p",
      "victory-xp-total",
      member.xp_next > 0
        ? `XP ${member.xp} / ${member.xp_next}`
        : `XP ${member.xp} · Maximum level`,
    );
    const bar = element("progress", "victory-xp-bar");
    bar.setAttribute("aria-label", `${member.name} experience`);
    bar.max = 1;
    const { final, segments } = victoryXPState(gs, index);
    bar.value = died
      ? final
      : segments[0]?.max > 0
        ? segments[0].start / segments[0].max
        : final;
    content.append(facts, xp, bar);
    row.append(portrait, content);
    if (died) row.classList.add("is-defeated");
    party.append(row);
    rows.push({ bar, final, segments, died });
  }
  dialog.body.append(party);
  const spoils = element("section", "victory-spoils");
  spoils.append(
    element("h2", "", "Recovered"),
    element("p", "", [formatSpoils(summary), ...summary.quests].join(" · ")),
    element(
      "p",
      "victory-supplies",
      `Potions ${gs.potions || 0} · Ether ${(gs.ethers || 0) + (gs.hi_ethers || 0) + (gs.x_ethers || 0)}`,
    ),
  );
  dialog.body.append(spoils);
  const hint = element(
    "p",
    "victory-controls",
    "Enter: continue · Space: finish tally · Esc: continue",
  );
  const button = element("button", "primary victory-continue", "Continue");
  button.hidden = true;
  button.addEventListener("click", continueOnce);
  dialog.footer.append(hint, button);

  function finish() {
    if (finished) return;
    finished = true;
    hint.textContent = "Enter / Space: continue · Esc: continue";
    for (const timer of timers) timer.remove(false);
    for (const tween of tweens) tween.stop();
    for (const { bar, final } of rows) bar.value = final;
    onTallyDone?.();
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) finish();
  else {
    let pending = rows.filter((row) => !row.died).length;
    rows.forEach((row, index) => {
      if (row.died) return;
      const runSegment = (n) => {
        if (finished || dialog.disposed) return;
        const segment = row.segments[n];
        if (!segment) {
          row.bar.value = row.final;
          if (--pending === 0) finish();
          return;
        }
        const proxy = { value: segment.start / segment.max };
        row.bar.value = proxy.value;
        tweens.push(
          scene.tweens.add({
            targets: proxy,
            value: segment.end / segment.max,
            duration: 650,
            onUpdate: () => {
              row.bar.value = proxy.value;
            },
            onComplete: () => runSegment(n + 1),
          }),
        );
      };
      timers.push(
        scene.time.delayedCall(450 + index * 250, () => runSegment(0)),
      );
    });
    if (!pending) finish();
  }
  scene.events.once("shutdown", finish);
  return {
    dialog,
    finish,
    enableContinue() {
      ready = true;
      dialog.root.inert = false;
      dialog.root.removeAttribute("aria-hidden");
      button.hidden = false;
      button.focus({ preventScroll: true });
    },
    suspend() {
      dialog.root.inert = true;
      dialog.root.setAttribute("aria-hidden", "true");
    },
  };
}

export function victoryXPState(gs, index) {
  const member = gs.party[index];
  const died = gs.died_this_fight?.[index] === true;
  const final =
    member.xp_next > 0
      ? Math.max(0, Math.min(1, member.xp / member.xp_next))
      : 1;
  return {
    final,
    segments: died
      ? []
      : buildVictoryXPSegments({
          prevXP: gs.xp_before?.[index],
          currentXP: member.xp,
          xpNext: member.xp_next,
          xpThresholds: gs.xp_thresholds?.[index],
        }),
  };
}
