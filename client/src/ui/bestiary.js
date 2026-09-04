import {
  monsterSpriteKey,
  MONSTER_SPRITE_LOAD,
} from "../data/monsterSprites.js";
import items from "../../../shared/items.json";

const DROP_ITEM_NAMES = new Map(
  Object.values(items)
    .flatMap((entries) => (Array.isArray(entries) ? entries : []))
    .filter((item) => item?.id && item?.name)
    .map((item) => [item.id, item.name]),
);

export function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function button(label, onClick) {
  const node = element("button", "", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

export function bestiaryEntries(catalog, discovered = {}) {
  return catalog.map((monster, index) => {
    const known = discovered?.[monster.id] === true;
    return {
      id: monster.id,
      number: String(index + 1).padStart(2, "0"),
      known,
      name: known ? monster.name : "Unknown creature",
      // Do not leak names, art, or stats through hidden/accessible markup.
      monster: known ? monster : null,
    };
  });
}

export function monsterArt(monster) {
  return MONSTER_SPRITE_LOAD.find(
    ({ key }) => key === monsterSpriteKey(monster),
  )?.path;
}

export function affinityLabel(values) {
  return values?.length
    ? values
        .map((value) => value.charAt(0).toUpperCase() + value.slice(1))
        .join(", ")
    : "None";
}

export function dropItemName(itemId) {
  return (
    DROP_ITEM_NAMES.get(itemId) ||
    String(itemId || "Unknown item")
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

export function mountBestiary(host, catalog, discovered) {
  const entries = bestiaryEntries(catalog, discovered);
  const count = entries.filter((entry) => entry.known).length;
  const summary = element(
    "p",
    "bestiary-summary",
    `${count} / ${entries.length} discovered`,
  );
  summary.append(
    element("span", "", "Meet creatures to reveal their field notes."),
  );
  host.append(summary);
  if (!entries.length) {
    host.append(element("p", "codex-status", "No creatures are listed yet."));
    return () => {};
  }
  const body = element("div", "bestiary-body");
  const list = element("div", "bestiary-list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Monster catalog");
  const detail = element("article", "bestiary-detail");
  detail.tabIndex = 0;
  detail.setAttribute("aria-label", "Creature details");
  const controls = [];
  let selected = Math.max(
    0,
    entries.findIndex((entry) => entry.known),
  );
  const select = (index, focus = false) => {
    selected = index;
    controls.forEach((control, i) => {
      control.setAttribute("aria-selected", String(i === index));
      control.tabIndex = i === index ? 0 : -1;
    });
    renderDetail(detail, entries[index]);
    if (focus) {
      controls[index].focus({ preventScroll: true });
      controls[index].scrollIntoView({ block: "nearest" });
    }
    detail.scrollTop = 0;
  };
  entries.forEach((entry, index) => {
    const control = button("", () => select(index));
    control.className = "bestiary-entry";
    control.setAttribute("role", "option");
    control.append(
      element("span", "bestiary-number", entry.number),
      element("span", "", entry.name),
    );
    if (entry.known) control.append(element("span", "bestiary-known", "Seen"));
    controls.push(control);
    list.append(control);
  });
  list.addEventListener("keydown", (event) => {
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    let next;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = entries.length - 1;
    else if (event.key in moves)
      next = Math.max(
        0,
        Math.min(entries.length - 1, selected + moves[event.key]),
      );
    else return;
    event.preventDefault();
    select(next, true);
  });
  body.append(list, detail);
  host.append(body);
  select(selected);
  // No global listeners or async work; removing this subtree releases it.
  return () => body.remove();
}

function renderDetail(detail, entry) {
  detail.replaceChildren();
  const heading = element("div", "bestiary-heading");
  heading.append(
    element("p", "bestiary-kicker", `Field entry ${entry.number}`),
    element("h2", "", entry.name),
  );
  detail.append(heading);
  if (!entry.known) {
    const unknown = element("div", "bestiary-unknown", "?");
    unknown.setAttribute("aria-hidden", "true");
    detail.append(
      unknown,
      element(
        "p",
        "bestiary-note",
        "You have not encountered this creature in this save. Its name, appearance, and base stats will be revealed when you meet it in battle.",
      ),
    );
    return;
  }
  const monster = entry.monster;
  const portrait = element("div", "bestiary-portrait");
  const path = monsterArt(monster);
  if (path) {
    const art = element("img");
    art.src = path;
    art.alt = monster.name;
    art.addEventListener(
      "error",
      () => {
        portrait.replaceChildren(
          element("span", "bestiary-note", "Illustration unavailable"),
        );
      },
      { once: true },
    );
    portrait.append(art);
  } else {
    portrait.append(
      element("span", "bestiary-note", "Illustration not yet available"),
    );
  }
  const tags = [`Tier ${monster.tier}`];
  if (monster.is_boss) tags.push("Boss");
  else if (monster.size) tags.push(affinityLabel([monster.size]));
  if (monster.is_undead) tags.push("Undead");
  heading.append(element("p", "bestiary-note", tags.join(" · ")));
  detail.append(portrait);

  const fieldNote = element("section", "bestiary-field-note");
  fieldNote.append(
    element("h3", "", "Field note"),
    element("p", "", monster.field_note),
  );
  const fieldGuide = element("dl", "bestiary-field-guide");
  fieldGuide.append(
    element("dt", "", "Habitats"),
    element("dd", "", monster.habitats.join(" · ")),
    element("dt", "", "Tactics"),
    element("dd", "", monster.tactics),
  );
  detail.append(fieldNote, fieldGuide);

  const affinities = element("dl", "bestiary-affinities");
  for (const [label, values] of [
    ["Weaknesses", monster.weaknesses],
    ["Resistances", monster.resistances],
    ["Absorbs", monster.absorbs],
  ]) {
    affinities.append(
      element("dt", "", label),
      element("dd", "", affinityLabel(values)),
    );
  }
  detail.append(affinities, element("h3", "", "Known drops"));
  if (monster.drops.length) {
    const table = element("table", "bestiary-drops");
    table.setAttribute("aria-label", `${monster.name} drop table`);
    const head = element("thead");
    const headRow = element("tr");
    for (const label of ["Item", "Chance"]) {
      const cell = element("th", "", label);
      cell.scope = "col";
      headRow.append(cell);
    }
    head.append(headRow);
    const body = element("tbody");
    for (const drop of monster.drops) {
      const row = element("tr");
      row.append(
        element("td", "", dropItemName(drop.item_id)),
        element("td", "", `${drop.chance_pct}%`),
      );
      body.append(row);
    }
    table.append(head, body);
    detail.append(table);
  } else {
    detail.append(element("p", "bestiary-note", "No recorded drops."));
  }
  detail.append(element("h3", "", "Base stats & rewards"));
  const stats = element("dl", "bestiary-stats");
  for (const [label, value] of [
    ["HP", monster.hp],
    ["XP", monster.xp_reward],
    ["Gold", monster.gold_reward],
    ["Strength", monster.stats.str],
    ["Agility", monster.stats.agi],
    ["Intellect", monster.stats.int],
    ["Vitality", monster.stats.vit],
    ["Luck", monster.stats.lck],
    ["Armor absorb", monster.armor_absorb],
  ]) {
    const cell = element("div");
    cell.append(element("dt", "", label), element("dd", "", String(value)));
    stats.append(cell);
  }
  detail.append(
    stats,
    element(
      "p",
      "bestiary-note bestiary-scaling",
      "Base values from the monster catalog. Encounter level and difficulty can change stats and rewards; these are not a prediction for your next battle.",
    ),
  );
}
