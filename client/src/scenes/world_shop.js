import spellCatalog from "../../../shared/spells.json";
import itemCatalog from "../../../shared/items.json";
import gatheringCatalog from "../../../shared/gathering.json";
import { itemArtURL } from "../ui/item_art.js";
import { element, viewportDialog } from "../ui/viewport_dialog.js";
import {
  autosaveGame,
  buyItem,
  equipItem,
  getShop,
  learnSpell,
} from "../api.js";
import { getAutosaveEnabled } from "../systems/prefs.js";
import { topWorldLock } from "../systems/modalLock.js";
import {
  buildFocusedMemberCompare,
  canPartyMemberEquip,
  isEquipmentShopItem,
} from "./shopCompare.js";
import "../styles/shop.css";

// The stock response owns prices and eligibility. Authored explanation text
// comes from the same shared catalog used by inventory and item resolution.
export function shopItemInformation(item) {
  const entries =
    item.type === "spell"
      ? spellCatalog.spells
      : item.type === "consumable"
        ? itemCatalog.consumables
        : item.type === "key_item"
          ? itemCatalog.key_items
          : item.type === "material"
            ? gatheringCatalog.materials
            : [];
  const definition = entries.find((entry) => entry.id === item.id);
  const context =
    definition?.combat_usable && definition?.world_usable
      ? "Use in battle or while exploring."
      : definition?.world_usable
        ? "Use while exploring; cannot be used in battle."
        : definition?.combat_usable
          ? "Use in battle only."
          : item.type === "material" && definition
            ? "Crafting ingredient. Use it from Crafting in the party menu."
            : "";
  return {
    description:
      item.description || definition?.description || definition?.source || "",
    context,
  };
}

export function groupShopItems(items = []) {
  return {
    weapons: items.filter((item) => item.type === "weapon"),
    armor: items.filter(
      (item) => item.type === "armor" || item.type === "equipment",
    ),
    consumables: items.filter(
      (item) => item.type === "consumable" || item.type === "key_item",
    ),
    supplies: items.filter((item) => item.type === "material"),
    spells: items.filter((item) => item.type === "spell"),
  };
}

export function buildSpellLearnerChoices(item, party = []) {
  const learnerMap = new Map(
    (item?.learners || []).map((learner) => [
      learner.name,
      {
        canLearn: learner.can_learn ?? learner.canLearn ?? false,
        reason: learner.reason || "",
      },
    ]),
  );

  return party.map((member, slot) => {
    const learner = learnerMap.get(member.name) || {
      canLearn: false,
      reason: "unavailable",
    };
    return {
      slot,
      name: member.name,
      className: member.class_name,
      level: member.level,
      canLearn: learner.canLearn,
      reason: learner.reason,
      label: `${member.name} · Lv.${member.level} ${member.class_name}`,
    };
  });
}

export function shouldHandleShopEscape(scene) {
  return topWorldLock(scene) === "shop";
}

export function resolveShopCatalog(shopData) {
  if (shopData?.error) {
    return {
      items: [],
      error: `Stock unavailable: ${shopData.error}`,
    };
  }
  return {
    items: Array.isArray(shopData?.shop_items) ? shopData.shop_items : [],
    error: "",
  };
}

function catalogFailure(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return `Stock unavailable: ${message || "please try again"}`;
}

function shopSelectionID(item) {
  return item?.stock_id || `${item?.type || "item"}:${item?.id || ""}`;
}

// Browser-sized controls keep the shop legible independently of canvas scale.
// Offers, prices, eligibility and all transactions still come from Go.
export async function openShop(scene, spawn) {
  if (scene.shopDialog && !scene.shopDialog.disposed) return;
  let items = [],
    catalogError = "",
    selectedId = null,
    category = "weapons",
    stockPage = 0,
    pageSize = 6;
  let memberIndex = 0,
    detailOpen = false,
    notice = "Loading stock…";
  scene.shopPurchasePending = false;
  scene.animating = true;
  const dialog = viewportDialog(scene, {
    key: "shop",
    title: spawn.name,
    onEscape: back,
    onKey(event) {
      const target = event.target?.closest?.("button");
      if (["Enter", " "].includes(event.key) && target) {
        event.preventDefault();
        if (!event.repeat && !target.disabled) target.click();
        return;
      }
      if (
        !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      const current = document.activeElement;
      const group = current?.closest("[data-shop-keys]");
      if (!group) return;
      const controls = [...group.querySelectorAll("button:not(:disabled)")];
      const index = controls.indexOf(current);
      if (index < 0) return;
      event.preventDefault();
      const delta = ["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1;
      controls[(index + delta + controls.length) % controls.length]?.focus({
        preventScroll: true,
      });
    },
  });
  scene.shopDialog = dialog;
  dialog.root.classList.add("kith-shop");
  const gold = element("p", "shop-gold");
  dialog.header.append(gold);
  dialog.body.classList.add("shop-body");
  const status = element("p", "shop-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const actions = element("div", "shop-actions");
  dialog.footer.append(status, actions);
  const categories = [
    ["weapons", "Weapons"],
    ["armor", "Armor"],
    ["consumables", "Items"],
    ["spells", "Spells"],
    ["supplies", "Supplies"],
  ];

  function button(label, action, className = "") {
    const node = element("button", className, label);
    node.type = "button";
    node.dataset.shopLabel = label;
    node.disabled = scene.shopPurchasePending;
    node.addEventListener("click", () => {
      if (!scene.shopPurchasePending && !dialog.disposed) action();
    });
    return node;
  }
  function text(parent, tag, value, className = "") {
    const node = element(tag, className, value);
    parent.append(node);
    return node;
  }
  function art(parent, item) {
    const url = itemArtURL(item.icon_key);
    if (!url) return;
    const img = element("img", "shop-item-art");
    img.src = url;
    img.alt = "";
    img.width = img.height = 64;
    parent.append(img);
  }
  const resizeObserver = new ResizeObserver(fitStockPage);
  resizeObserver.observe(dialog.body);
  const stopStockObserver = () => {
    resizeObserver.disconnect();
    scene.events.off("shutdown", stopStockObserver);
  };
  scene.events.once("shutdown", stopStockObserver);

  function fitStockPage() {
    if (dialog.disposed) {
      stopStockObserver();
      return;
    }
    const stock = dialog.body.querySelector(".shop-stock");
    if (!stock?.clientHeight) return;
    // Match the fixed 52px rows, 4px gaps, padding and 46px page controls.
    const capacity = Math.max(
      1,
      Math.floor((stock.clientHeight - 74 + 4) / 56),
    );
    if (capacity === pageSize) return;
    const offers = groupShopItems(items)[category] || [];
    const index = offers.findIndex(
      (item) => shopSelectionID(item) === selectedId,
    );
    pageSize = capacity;
    stockPage = Math.floor(Math.max(0, index) / pageSize);
    const focus = document.activeElement?.closest(".shop-categories")
      ? "category"
      : document.activeElement?.closest(".shop-stock")
        ? "selected"
        : undefined;
    render(focus);
  }

  function close() {
    if (scene.shopPurchasePending || dialog.disposed) return;
    stopStockObserver();
    dialog.dispose();
    scene.animating = false;
    if (scene.shopDialog === dialog) scene.shopDialog = null;
  }
  function back() {
    if (scene.shopPurchasePending) return;
    if (detailOpen && window.matchMedia("(max-width: 620px)").matches) {
      detailOpen = false;
      render("selected");
    } else close();
  }
  function selected() {
    return items.find((item) => shopSelectionID(item) === selectedId) || null;
  }
  async function catalog() {
    const previous = selected();
    try {
      const response = await getShop(scene.gameState.id, spawn.node_id);
      if (dialog.disposed) return;
      ({ items, error: catalogError } = resolveShopCatalog(response));
      // A refreshed quote has a new stock ID. Keep the same reusable item
      // selected without retaining its stale offer token.
      if (previous) {
        const replacement = items.find(
          (item) =>
            item.id === previous.id &&
            item.type === previous.type &&
            item.instance_id === previous.instance_id,
        );
        selectedId = replacement ? shopSelectionID(replacement) : null;
      }
    } catch (error) {
      if (dialog.disposed) return;
      items = [];
      catalogError = catalogFailure(error);
    }
  }
  function save(result) {
    if (!getAutosaveEnabled() || !result?.id) return;
    autosaveGame(result.id, "purchase")
      .then(() => scene.flashSaveIcon?.())
      .catch((error) => console.error("[Shop] autosave failed:", error));
  }
  async function purchase(equip = false) {
    const item = selected();
    if (!item || catalogError || scene.shopPurchasePending) return;
    const member = scene.gameState.party?.[memberIndex];
    scene.shopPurchasePending = true;
    notice = "Completing purchase…";
    render();
    let succeeded = false;
    try {
      const result =
        item.type === "spell"
          ? await learnSpell(
              scene.gameState.id,
              spawn.node_id,
              item.stock_id,
              member?.name,
            )
          : await buyItem(scene.gameState.id, spawn.node_id, item.stock_id);
      if (result?.error) throw new Error(result.error);
      let final = result;
      notice =
        item.type === "spell"
          ? `${member.name} learned ${item.name}!`
          : `Bought: ${item.name}!`;
      if (equip) {
        // Purchase is committed even if the separate equip request fails.
        try {
          const equipped = await equipItem(
            result.id,
            memberIndex,
            item.instance_id || item.id,
            item.type,
          );
          if (equipped?.error) throw new Error(equipped.error);
          final = equipped;
          notice = `${member.name} equipped ${item.name}!`;
        } catch (error) {
          notice = `Bought ${item.name}; equip separately: ${error.message}`;
        }
      }
      if (!dialog.disposed) {
        scene.gameState = final;
        scene.updateHUD?.();
      }
      save(final);
      succeeded = true;
    } catch (error) {
      notice = error.message || "Purchase could not be completed.";
    }
    await catalog();
    if (dialog.disposed) return;
    if (catalogError) notice += " Use Retry Stock to reload offers.";
    else if (!succeeded) notice += " Stock refreshed.";
    scene.shopPurchasePending = false;
    render("purchase");
  }
  function render(focus) {
    if (dialog.disposed) return;
    const oldStock = dialog.body.querySelector(".shop-stock");
    const oldScroll = dialog.body.scrollTop;
    const navScroll =
      dialog.body.querySelector(".shop-categories")?.scrollLeft || 0;
    gold.textContent = `Gold: ${scene.gameState.gold}`;
    status.textContent = notice;
    dialog.body.replaceChildren();
    actions.replaceChildren();
    dialog.root.classList.toggle("shop-detail-open", detailOpen);
    dialog.root.setAttribute("aria-busy", String(scene.shopPurchasePending));
    const leave = button("Leave Shop", close);
    actions.append(leave);
    if (catalogError) {
      text(dialog.body, "p", catalogError, "shop-error");
      const retry = button("Retry Stock", async () => {
        scene.shopPurchasePending = true;
        notice = "Loading stock…";
        render();
        await catalog();
        scene.shopPurchasePending = false;
        notice = catalogError
          ? "Stock could not be loaded."
          : "Stock refreshed.";
        render("category");
      });
      dialog.body.append(retry);
      return;
    }
    const nav = element("nav", "shop-categories");
    nav.setAttribute("aria-label", "Shop categories");
    nav.dataset.shopKeys = "categories";
    for (const [key, label] of categories) {
      const tab = button(label, () => {
        category = key;
        stockPage = 0;
        selectedId = null;
        detailOpen = false;
        render("category");
      });
      tab.setAttribute("aria-pressed", String(category === key));
      nav.append(tab);
    }
    const layout = element("div", "shop-workbench");
    let stock = element("section", "shop-stock");
    stock.setAttribute("aria-label", "Stock");
    stock.dataset.shopKeys = "stock";
    const offers = groupShopItems(items)[category] || [];
    if (!offers.some((item) => shopSelectionID(item) === selectedId))
      selectedId = offers[0] ? shopSelectionID(offers[0]) : null;
    const pageCount = Math.max(1, Math.ceil(offers.length / pageSize));
    stockPage = Math.min(stockPage, pageCount - 1);
    const stockSignature = JSON.stringify([
      category,
      stockPage,
      pageSize,
      scene.shopPurchasePending,
      offers.map(shopSelectionID),
    ]);
    stock.dataset.signature = stockSignature;
    const list = element("div", "shop-stock-list");
    for (const item of offers.slice(
      stockPage * pageSize,
      (stockPage + 1) * pageSize,
    )) {
      const row = button(
        item.name,
        () => {
          selectedId = shopSelectionID(item);
          detailOpen = true;
          notice =
            item.type === "spell"
              ? "Choose a learner, then confirm Learn."
              : "Compare the item before buying.";
          // Only change learner automatically when choosing another spell.
          if (item.type === "spell") {
            const eligible = buildSpellLearnerChoices(
              item,
              scene.gameState.party,
            ).find((choice) => choice.canLearn);
            memberIndex = eligible?.slot ?? 0;
          }
          render("detail");
        },
        "shop-stock-row",
      );
      row.replaceChildren();
      row.dataset.offerId = shopSelectionID(item);
      row.setAttribute(
        "aria-pressed",
        String(selectedId === shopSelectionID(item)),
      );
      art(row, item);
      const name = element("span", "shop-stock-name", item.name);
      if (item.type === "spell")
        text(name, "small", `${item.school} · Tier ${item.spell_level}`);
      row.append(name, element("span", "shop-price", `${item.price}g`));
      list.append(row);
    }
    stock.append(list);
    if (!offers.length) text(list, "p", "Nothing in this category.");
    const pager = element("nav", "shop-pagination");
    pager.setAttribute("aria-label", "Stock pages");
    const turnPage = (delta) => {
      stockPage += delta;
      selectedId = shopSelectionID(offers[stockPage * pageSize]);
      detailOpen = false;
      render("selected");
    };
    const previous = button("Previous page", () => turnPage(-1));
    previous.disabled ||= stockPage === 0;
    const next = button("Next page", () => turnPage(1));
    next.disabled ||= stockPage === pageCount - 1;
    const range = offers.length
      ? `${stockPage * pageSize + 1}–${Math.min((stockPage + 1) * pageSize, offers.length)} of ${offers.length}`
      : "0 items";
    const position = element("span", "shop-page-position", range);
    position.setAttribute("role", "status");
    pager.append(previous, position, next);
    stock.append(pager);
    const preview = element("section", "shop-preview");
    preview.setAttribute("aria-label", "Item preview");
    const item = selected();
    if (item) {
      const backButton = button(
        "Back to stock",
        () => {
          detailOpen = false;
          render("selected");
        },
        "shop-back",
      );
      preview.append(backButton);
      const hero = element("div", "shop-preview-heading");
      art(hero, item);
      const heading = element("div");
      text(
        heading,
        "h2",
        item.type === "spell" ? `Learn ${item.name}` : item.name,
      );
      text(heading, "p", `${item.price} gold`, "shop-price");
      hero.append(heading);
      preview.append(hero);
      const { description, context } = shopItemInformation(item);
      if (description) text(preview, "p", description, "shop-description");
      if (context)
        text(preview, "p", context, "shop-use-context shop-secondary");
      if (item.required_level && item.type !== "spell")
        text(
          preview,
          "p",
          `${item.rarity || "Common"} · Item level ${item.item_level || 1} · Requires level ${item.required_level}`,
          "shop-secondary",
        );
      const party = scene.gameState.party || [];
      if (memberIndex >= party.length) memberIndex = 0;
      if (isEquipmentShopItem(item)) {
        renderEquipment(preview, item, party);
      } else if (item.type === "spell") {
        text(preview, "p", `${item.school} magic · Tier ${item.spell_level}`);
        text(
          preview,
          "p",
          "Magic tier is not character level. Each companion’s class and character level determine whether they can learn it.",
          "shop-secondary shop-spell-requirements",
        );
        text(preview, "h3", "Choose a learner");
        const learners = element("div", "shop-members");
        learners.dataset.shopKeys = "learners";
        for (const choice of buildSpellLearnerChoices(item, party)) {
          const choose = button(
            choice.label,
            () => {
              memberIndex = choice.slot;
              render("member");
            },
            "shop-member",
          );
          choose.setAttribute(
            "aria-pressed",
            String(memberIndex === choice.slot),
          );
          choose.disabled ||= !choice.canLearn;
          text(
            choose,
            "small",
            choice.canLearn ? "Can learn" : choice.reason || "unavailable",
          );
          learners.append(choose);
        }
        preview.append(learners);
      }
      const affordable = scene.gameState.gold >= item.price;
      if (!affordable)
        text(
          preview,
          "p",
          `Need ${item.price - scene.gameState.gold} more gold.`,
          "shop-error",
        );
      const buy = button(
        item.type === "spell" ? "Learn" : "Buy",
        () => purchase(),
        "primary shop-purchase",
      );
      buy.dataset.shopPurchase = "true";
      buy.disabled ||= !affordable;
      if (item.type === "spell")
        buy.disabled ||= !buildSpellLearnerChoices(item, party)[memberIndex]
          ?.canLearn;
      actions.append(buy);
      if (
        isEquipmentShopItem(item) &&
        item.type !== "equipment" &&
        party[memberIndex]
      ) {
        const equip = button(
          `Buy for ${party[memberIndex].name}`,
          () => purchase(true),
          "shop-equip",
        );
        equip.disabled ||=
          !affordable || !canPartyMemberEquip(item, party[memberIndex]);
        actions.append(equip);
      }
    }
    // Changing the preview must not recreate its neighboring catalog rows.
    // Keep decoded icons, focus and layout; rebuild only for a different page,
    // category, pending state or authoritative quote.
    if (oldStock?.dataset.signature === stockSignature) {
      stock = oldStock;
      for (const row of stock.querySelectorAll(".shop-stock-row")) {
        row.setAttribute(
          "aria-pressed",
          String(row.dataset.offerId === selectedId),
        );
      }
    }
    layout.append(stock, preview);
    dialog.body.append(nav, layout);
    dialog.body.scrollTop = oldScroll;
    nav.scrollLeft = navScroll;
    queueMicrotask(fitStockPage);
    if (focus === "category")
      nav
        .querySelector('[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
    if (focus === "selected")
      stock
        .querySelector('[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
    if (focus === "detail") {
      if (window.matchMedia("(max-width: 620px)").matches) {
        preview.tabIndex = -1;
        preview.focus({ preventScroll: true });
        dialog.body.scrollTop = 0;
      } else
        stock
          .querySelector('[aria-pressed="true"]')
          ?.focus({ preventScroll: true });
    }
    if (focus === "member")
      preview
        .querySelector('.shop-member[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
    if (focus === "purchase")
      (actions.querySelector(".shop-purchase:not(:disabled)") || leave).focus({
        preventScroll: true,
      });
  }
  function renderEquipment(preview, item, party) {
    text(preview, "h3", "Compare for");
    const members = element("div", "shop-members");
    members.dataset.shopKeys = "members";
    for (const [index, member] of party.entries()) {
      const choose = button(
        `${member.name} · ${member.class_name} · Lv.${member.level}`,
        () => {
          memberIndex = index;
          render("member");
        },
        "shop-member",
      );
      choose.setAttribute("aria-pressed", String(memberIndex === index));
      text(
        choose,
        "small",
        canPartyMemberEquip(item, member) ? "May equip" : "May not wield",
      );
      members.append(choose);
    }
    preview.append(members);
    const member = party[memberIndex];
    if (!member) return;
    const compare = buildFocusedMemberCompare(
      item,
      member,
      scene.gameState.equipment?.[memberIndex],
    );
    const comparison = element("div", "shop-comparison");
    text(comparison, "p", `Current: ${compare.currentName}`);
    text(comparison, "p", `Preview: ${compare.nextName}`);
    if (!compare.canEquip)
      text(comparison, "p", "Ill suited to this path", "shop-error");
    for (const line of compare.lines) {
      const row = element("div", "shop-stat-delta");
      text(
        row,
        "span",
        `${line.label}: ${line.currentValue} to ${line.nextValue}`,
      );
      const delta = text(row, "strong", line.deltaText);
      delta.style.color = line.color;
      comparison.append(row);
    }
    text(
      comparison,
      "p",
      `Element: ${compare.currentElement} to ${compare.nextElement}`,
      "shop-secondary",
    );
    preview.append(comparison);
  }
  render();
  await catalog();
  if (dialog.disposed) return;
  notice = catalogError
    ? "Stock could not be loaded."
    : "Select an item to inspect before buying.";
  render("category");
}
