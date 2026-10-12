import { craftFieldRecipe } from "../api.js";
import { element, viewportDialog } from "../ui/viewport_dialog.js";
import { showGemWorkshop } from "./gem_workshop.js";
import "../styles/field-crafting.css";

// Presentation only: availability, costs, rewards and mutations come from Go.
function icon(kind) {
  const slot = element("span", `craft-icon craft-icon-${kind}`);
  slot.setAttribute("aria-hidden", "true");
  if (["sword", "shield", "potion"].includes(kind)) {
    const img = element("img");
    img.src = `/sprites/ui/icon_${kind}.png`;
    img.alt = "";
    slot.append(img);
  } else {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    const shapes =
      kind === "herb"
        ? [
            "M24 41V15",
            "M24 29C9 30 7 20 8 14C19 13 25 19 24 29Z",
            "M24 22C24 11 31 6 40 7C40 17 35 24 24 22Z",
          ]
        : kind === "mineral"
          ? [
              "M7 35L13 20L28 12L40 21L43 36L30 41L14 40Z",
              "M13 20L26 28L28 12M26 28L40 21M26 28L30 41M7 35L26 28",
            ]
          : [
              "M24 5L40 18L34 35L24 44L13 35L8 18Z",
              "M8 18H40M24 5L17 18L24 44L31 18Z",
            ];
    for (const d of shapes) {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    slot.append(svg);
  }
  return slot;
}

export function showFieldCrafting(scene, { onClose, selectedRecipe } = {}) {
  let busy = false;
  let alive = true;
  let notice = "";
  let failed = false;
  let selected = selectedRecipe;
  let dialog;
  const close = () => {
    if (busy) return;
    alive = false;
    dialog.dispose();
    onClose?.();
  };
  dialog = viewportDialog(scene, {
    key: "field_crafting",
    title: "Crafting",
    onEscape: close,
  });
  dialog.root.classList.add("field-crafting");
  dialog.header.prepend(element("span", "craft-eyebrow", "FIELD WORKBENCH"));
  dialog.header.append(
    element("p", "craft-subtitle", "Turn trail finds into supplies and gear."),
  );
  scene.events.once("shutdown", () => {
    alive = false;
  });
  const button = (parent, label, action, className = "secondary") => {
    const node = element("button", className, label);
    node.type = "button";
    node.disabled = busy;
    node.onclick = action;
    parent.append(node);
    return node;
  };
  async function craft(recipe) {
    if (busy || !recipe.craftable) return;
    busy = true;
    notice = "";
    render();
    try {
      const next = await craftFieldRecipe(scene.gameState.id, recipe.id);
      if (!alive) return;
      failed = !!next.error;
      if (next.error) notice = next.error;
      else {
        scene.gameState = next;
        scene.updateHUD?.();
        notice = next.message || `${recipe.name} complete.`;
      }
    } catch (error) {
      if (alive) {
        failed = true;
        notice = error.message || "Crafting could not be completed. Try again.";
      }
    } finally {
      busy = false;
      if (alive) {
        render();
        // The selected recipe stays reachable even when its last materials were used.
        dialog.body
          .querySelector('[aria-pressed="true"]')
          ?.focus({ preventScroll: true });
      }
    }
  }
  function render() {
    const gs = scene.gameState;
    const materials = gs.materials || [];
    const recipes = gs.field_recipes || [];
    const recipe = recipes.find((r) => r.id === selected) || recipes[0];
    selected = recipe?.id;
    const materialKind = (id) =>
      gs.resources?.find((r) => r.material_id === id)?.visual || "mineral";
    dialog.root.setAttribute("aria-busy", String(busy));
    dialog.body.replaceChildren();
    const workbench = element("div", "craft-workbench");
    const library = element("nav", "craft-library");
    library.setAttribute("aria-label", "Crafting recipes");
    library.append(element("h2", "craft-label", "RECIPES"));
    for (const r of recipes) {
      const row = button(
        library,
        "",
        () => {
          if (busy) return;
          selected = r.id;
          notice = "";
          render();
          dialog.body
            .querySelector('[aria-pressed="true"]')
            ?.focus({ preventScroll: true });
        },
        "craft-recipe",
      );
      row.dataset.recipe = r.id;
      row.setAttribute("aria-label", r.name);
      row.setAttribute("aria-pressed", String(r.id === selected));
      const text = element("span", "craft-recipe-text");
      text.append(
        element("strong", "", r.output_name),
        element(
          "small",
          r.craftable ? "is-ready" : "",
          r.craftable ? "Ready to craft" : "Missing materials",
        ),
      );
      row.append(icon(r.output_visual || "gem"), text);
    }
    const preview = element("section", "craft-preview");
    preview.setAttribute("aria-label", "Recipe preview");
    if (recipe) {
      const result = element("div", "craft-result");
      const identity = element("div");
      identity.append(
        element("span", "craft-label", "YOU WILL CREATE"),
        element("h2", "craft-item-name", recipe.output_name),
        element(
          "p",
          "craft-yield",
          `${recipe.output_count} ${recipe.output_count === 1 ? "item" : "items"} per craft${recipe.item_level ? ` · Item level ${recipe.item_level}` : ""}`,
        ),
      );
      result.append(icon(recipe.output_visual || "gem"), identity);
      preview.append(result);
      const stats = element("div", "craft-stats");
      for (const [stat, value] of Object.entries(
        recipe.output_stats || {},
      ).filter(([, v]) => v)) {
        const label = stat
          .replaceAll("_pct", " chance")
          .replaceAll("_", " ")
          .replaceAll(/\b\w/g, (l) => l.toUpperCase());
        stats.append(
          element(
            "span",
            "craft-stat",
            `${label} ${value > 0 ? "+" : ""}${value}${stat.endsWith("_pct") ? "%" : ""}`,
          ),
        );
      }
      if (recipe.sockets)
        stats.append(
          element(
            "span",
            "craft-socket",
            `◇ ${recipe.sockets} open gem socket`,
          ),
        );
      if (stats.childElementCount) preview.append(stats);
      preview.append(
        element("p", "craft-description", recipe.description),
        element("h3", "craft-label", "REAGENTS · OWNED / REQUIRED"),
      );
      const ingredients = element("div", "craft-ingredients");
      for (const input of recipe.inputs) {
        const material = materials.find((m) => m.id === input.material_id);
        const owned = material?.count || 0;
        const enough = owned >= input.count;
        const tile = element(
          "div",
          `craft-ingredient ${enough ? "is-ready" : "is-missing"}`,
        );
        const text = element("div");
        text.append(
          element("strong", "", material?.name || input.material_id),
          element("span", "craft-count", `${owned} / ${input.count}`),
          element(
            "small",
            "",
            enough ? "Enough" : `Need ${input.count - owned} more`,
          ),
        );
        tile.append(icon(materialKind(input.material_id)), text);
        ingredients.append(tile);
      }
      preview.append(ingredients);
    } else preview.append(element("p", "", "No recipes available."));
    workbench.append(library, preview);
    const bag = element("div", "craft-bag");
    bag.append(element("span", "craft-label", "MATERIAL POUCH"));
    for (const m of materials) {
      const chip = element("span", "craft-material");
      chip.append(
        icon(materialKind(m.id)),
        element("span", "", `${m.name} × ${m.count}`),
      );
      bag.append(chip);
    }
    dialog.body.append(workbench, bag);
    dialog.footer.replaceChildren();
    const feedback = element(
      "p",
      `craft-feedback ${failed && notice ? "is-error" : ""}`,
      notice ||
        (busy
          ? "Crafting…"
          : recipe?.craftable
            ? "Materials ready."
            : recipe?.block_reason || "Gather resources along quest trails."),
    );
    feedback.setAttribute("role", "status");
    dialog.footer.append(feedback);
    const actions = element("div", "craft-actions");
    button(actions, "Close", close);
    button(actions, "Gem workshop", () => {
      if (busy) return;
      alive = false;
      dialog.dispose();
      showGemWorkshop(scene, {
        onClose: () =>
          showFieldCrafting(scene, { onClose, selectedRecipe: selected }),
      });
    });
    const confirm = button(
      actions,
      busy
        ? "Crafting…"
        : `Craft${recipe ? ` ${recipe.output_count} × ${recipe.output_name}` : ""}`,
      () => craft(recipe),
      "primary craft-confirm",
    );
    confirm.disabled = busy || !recipe?.craftable;
    dialog.footer.append(actions);
  }
  render();
  return dialog;
}
