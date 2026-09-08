import { element } from "../ui/viewport_dialog.js";
import {
  isFieldCastableSpell,
  spellNeedsFieldTarget,
  canTargetFieldSpell,
  fieldSpellContext,
  castFieldSpell,
} from "./field_magic.js";

export function fieldCastReason(gameState, caster, spell) {
  if (!isFieldCastableSpell(spell)) return "Battle only";
  if (["combat", "defeat", "victory", "promotion"].includes(gameState.phase))
    return "Unavailable here";
  if (caster.hp <= 0) return "Caster is KO";
  if ((caster.mp ?? 0) < (spell.mp_cost ?? 0)) return "Not enough MP";
  if (!gameState.party.some((target) => canTargetFieldSpell(spell, target)))
    return "No eligible targets";
  return "";
}

export function renderCharacterSpells(state, panel, refresh) {
  const gs = state.scene.gameState;
  const member = gs.party[state.partyIndex];
  panel.append(
    element(
      "p",
      "spell-resources",
      `${member.name} · MP ${member.mp ?? 0}/${member.max_mp ?? 0} · HP ${member.hp}/${member.max_hp}`,
    ),
  );
  const spells = member.spells || [];
  if (!spells.length) {
    panel.append(element("p", "", "No spells learned yet."));
    return;
  }
  const selected =
    spells.find((spell) => spell.id === state.selectedSpellID) ||
    spells.find(isFieldCastableSpell) ||
    spells[0];
  const layout = element("div", "spell-workspace");
  const list = element("section", "spell-library");
  list.setAttribute("aria-label", "Learned spells");
  for (const spell of spells) {
    const row = element("button", "spell-choice");
    row.type = "button";
    row.dataset.focusKey = `spell-${spell.id}`;
    row.setAttribute("aria-pressed", String(spell.id === selected.id));
    row.append(
      element("strong", "", spell.name),
      element("span", "", `${spell.mp_cost || 0} MP`),
      element(
        "small",
        "",
        isFieldCastableSpell(spell) ? "Field magic" : "Battle only",
      ),
    );
    row.disabled = state.busy;
    row.addEventListener("click", () => {
      state.selectedSpellID = spell.id;
      state.status = "";
      refresh();
    });
    list.append(row);
  }
  const detail = element("section", "spell-casting");
  detail.setAttribute("aria-label", "Spell details and targets");
  detail.append(
    element("h3", "", selected.name),
    element("p", "", selected.description || selected.effect || ""),
    element(
      "p",
      "",
      isFieldCastableSpell(selected)
        ? fieldSpellContext(selected)
        : `${selected.mp_cost || 0} MP · Battle only`,
    ),
  );
  const reason = fieldCastReason(gs, member, selected);
  if (reason) detail.append(element("p", "spell-availability", reason));
  if (isFieldCastableSpell(selected)) {
    detail.append(
      element(
        "p",
        "",
        spellNeedsFieldTarget(selected)
          ? "Choose a party member. Keep casting here until you are done."
          : "Cast once to affect eligible party members.",
      ),
    );
    const targets = element("div", "spell-targets");
    gs.party.forEach((target, index) => {
      const card = element(
        spellNeedsFieldTarget(selected) ? "button" : "div",
        "spell-target",
      );
      card.append(
        element("strong", "", target.name),
        element(
          "span",
          "",
          `HP ${target.hp}/${target.max_hp} · MP ${target.mp ?? 0}/${target.max_mp ?? 0}`,
        ),
        element(
          "small",
          "",
          target.hp <= 0
            ? "KO"
            : target.status ||
                (selected.effect === "heal" && target.hp >= target.max_hp
                  ? "Full HP"
                  : "Ready"),
        ),
      );
      if (spellNeedsFieldTarget(selected)) {
        card.type = "button";
        card.dataset.focusKey = `spell-target-${index}`;
        card.setAttribute(
          "aria-label",
          `Cast ${selected.name} on ${target.name}`,
        );
        card.disabled =
          state.busy || !!reason || !canTargetFieldSpell(selected, target);
        card.addEventListener(
          "click",
          () => void performCharacterCast(state, selected, index, refresh),
        );
      }
      targets.append(card);
    });
    detail.append(targets);
    if (!spellNeedsFieldTarget(selected)) {
      const cast = element(
        "button",
        "equipment-action",
        `Cast ${selected.name} on party`,
      );
      cast.disabled = state.busy || !!reason;
      cast.dataset.focusKey = "cast-party";
      cast.addEventListener(
        "click",
        () => void performCharacterCast(state, selected, -1, refresh),
      );
      detail.append(cast);
    }
  }
  layout.append(list, detail);
  panel.append(layout);
}

export async function performCharacterCast(state, spell, targetSlot, refresh) {
  const gs = state.scene.gameState;
  const casterSlot = state.partyIndex;
  const caster = gs.party[casterSlot];
  if (state.busy || fieldCastReason(gs, caster, spell)) return;
  if (
    spellNeedsFieldTarget(spell) &&
    !canTargetFieldSpell(spell, gs.party[targetSlot])
  )
    return;
  state.busy = true;
  state.selectedSpellID = spell.id;
  state.status = `Casting ${spell.name}…`;
  refresh();
  try {
    const result = await castFieldSpell(
      state.scene,
      casterSlot,
      spell,
      targetSlot,
    );
    state.status = result?.error || result?.message || `${spell.name} cast.`;
    state.statusTone = result?.error ? "error" : "success";
  } catch {
    state.status = "Could not confirm the cast. Try again.";
    state.statusTone = "error";
  } finally {
    state.busy = false;
    if (state.scene.equipmentScreenState === state) {
      refresh();
      const targets = [
        ...(state.root?.querySelectorAll(
          ".spell-target:not(:disabled), .spell-casting button:not(:disabled)",
        ) || []),
      ];
      const target =
        targets.find(
          (button) => button.dataset.focusKey === `spell-target-${targetSlot}`,
        ) || targets[0];
      (
        target || state.root?.querySelector('[data-detail-tab="spells"]')
      )?.focus({ preventScroll: true });
    }
  }
}
