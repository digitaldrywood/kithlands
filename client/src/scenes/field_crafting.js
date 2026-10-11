import { craftFieldRecipe } from "../api.js";
import { element, viewportDialog } from "../ui/viewport_dialog.js";
import { showGemWorkshop } from "./gem_workshop.js";

export function showFieldCrafting(scene, { onClose } = {}) {
  let busy = false;
  let alive = true;
  let notice =
    "Gather herbs and minerals along quest trails. Each patch can be harvested once per save.";
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
  Object.assign(dialog.footer.style, {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  });
  scene.events.once("shutdown", () => {
    alive = false;
  });
  const button = (parent, label, action, disabled = false) => {
    const node = element("button", "secondary", label);
    node.type = "button";
    node.disabled = disabled;
    node.onclick = action;
    parent.append(node);
    return node;
  };
  function render() {
    dialog.body.replaceChildren();
    const message = element("p", "", notice);
    message.setAttribute("role", "status");
    dialog.body.append(message, element("h2", "", "Your materials"));
    const materials = scene.gameState.materials || [];
    for (const material of materials)
      dialog.body.append(
        element("p", "", `${material.name}: ${material.count}`),
      );
    for (const recipe of scene.gameState.field_recipes || []) {
      const section = element("section", "journal-section");
      section.dataset.recipe = recipe.id;
      section.append(
        element("h2", "", recipe.name),
        element("p", "", recipe.description),
      );
      const costs = recipe.inputs
        .map(
          (input) =>
            `${input.count} × ${materials.find((m) => m.id === input.material_id)?.name || input.material_id}`,
        )
        .join(" + ");
      section.append(
        element("p", "", `Cost: ${costs}`),
        element(
          "p",
          "",
          `Makes: ${recipe.output_count} × ${recipe.output_name}`,
        ),
      );
      if (recipe.output_stats)
        section.append(
          element(
            "p",
            "",
            Object.entries(recipe.output_stats)
              .filter(([, value]) => value)
              .map(
                ([stat, value]) =>
                  `${stat
                    .replaceAll("_pct", " %")
                    .replaceAll("_", " ")
                    .replaceAll(/\b\w/g, (letter) =>
                      letter.toUpperCase(),
                    )}: ${value}`,
              )
              .join(" · "),
          ),
        );
      if (recipe.sockets)
        section.append(
          element(
            "p",
            "",
            `${recipe.sockets} open gem socket · Compare and equip from Character`,
          ),
        );
      if (!recipe.craftable)
        section.append(element("p", "", recipe.block_reason));
      button(
        section,
        recipe.name,
        async () => {
          if (busy) return;
          busy = true;
          render();
          try {
            const next = await craftFieldRecipe(scene.gameState.id, recipe.id);
            if (!alive) return;
            if (next.error) notice = next.error;
            else {
              scene.gameState = next;
              scene.updateHUD?.();
              notice = next.message || `${recipe.name} complete.`;
            }
          } catch (error) {
            if (alive)
              notice =
                error.message || "Crafting could not be completed. Try again.";
          } finally {
            busy = false;
            if (alive) {
              render();
              dialog.body.scrollTop = 0;
            }
          }
        },
        busy || !recipe.craftable,
      );
      dialog.body.append(section);
    }
    dialog.footer.replaceChildren();
    button(
      dialog.footer,
      "Gem workshop",
      () => {
        if (busy) return;
        alive = false;
        dialog.dispose();
        showGemWorkshop(scene, {
          onClose: () => showFieldCrafting(scene, { onClose }),
        });
      },
      busy,
    );
    button(dialog.footer, "Close", close, busy);
  }
  render();
  return dialog;
}
