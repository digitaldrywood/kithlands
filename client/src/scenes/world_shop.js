import {
  autosaveGame,
  buyItem,
  equipItem,
  getShop,
  learnSpell,
} from "../api.js";
import { getAutosaveEnabled } from "../systems/prefs.js";
import {
  pauseWorldFor,
  resumeWorldFor,
  topWorldLock,
} from "../systems/modalLock.js";
import { drawButton, drawPanel } from "../ui/panel.js";
import {
  buildFocusedMemberCompare,
  buildItemStatBlock,
  buildMemberIndicators,
  buyForMemberLabel,
  canPartyMemberEquip,
  cycleMemberIndex,
  isEquipmentShopItem,
} from "./shopCompare.js";

const MAIN_PANEL = {
  x: 400,
  y: 300,
  w: 740,
  h: 520,
  depth: 1800,
};

const LIST_LEFT = 90;
const LIST_RIGHT = 495;
const LIST_ROW_CENTER_X = 282;
const LIST_ROW_WIDTH = 410;
const LIST_ROW_HEIGHT = 30;
const LIST_ROW_GAP = 35;
const LIST_TEXT_Y_OFFSET = 3;
const DETAIL_X = 615;
const DETAIL_Y = 325;
const DETAIL_W = 240;
const DETAIL_H = 370;

function drawCycleControl(scene, x, y, label, onClick, depth) {
  const bg = scene.add
    .rectangle(x, y, 64, 38, 0x1e3558, 1)
    .setStrokeStyle(2, 0x66a7ff)
    .setScrollFactor(0)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(x, y + 1, label, {
      fontSize: "16px",
      color: "#dceaff",
      fontFamily: "monospace",
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(depth + 1)
    .setInteractive({ useHandCursor: true });
  const press = () => {
    if (typeof onClick === "function") onClick();
  };
  const over = () => bg.setFillStyle(0x2b5486, 1);
  const out = () => bg.setFillStyle(0x1e3558, 1);
  bg.on("pointerover", over);
  bg.on("pointerout", out);
  bg.on("pointerdown", press);
  text.on("pointerover", over);
  text.on("pointerout", out);
  text.on("pointerdown", press);
  return {
    bg,
    label: text,
    destroy() {
      bg.destroy();
      text.destroy();
    },
  };
}

function destroyGroup(group) {
  group.forEach((entry) => entry?.destroy?.());
  group.length = 0;
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

export async function openShop(scene, spawn) {
  pauseWorldFor(scene, "shop");
  scene.animating = true;

  let items = [];
  let catalogError = "";
  try {
    const shopData = await getShop(scene.gameState.id, spawn.node_id);
    ({ items, error: catalogError } = resolveShopCatalog(shopData));
  } catch (e) {
    console.error("[World] shop fetch failed:", e);
    catalogError = catalogFailure(e);
  }

  if (!catalogError && items.length === 0) {
    scene.showMessage(`${spawn.name} has nothing for sale.`);
    scene.time.delayedCall(1500, () => {
      scene.hideMessage();
      scene.animating = false;
      resumeWorldFor(scene, "shop");
    });
    return;
  }

  const overlay = [];
  const listGroup = [];
  const detailGroup = [];
  const pickerGroup = [];
  const catalogErrorGroup = [];
  const tabButtons = [];
  const tabs = [
    { label: "Weapons", key: "weapons" },
    { label: "Armor", key: "armor" },
    { label: "Items", key: "consumables" },
    { label: "Spells", key: "spells" },
  ];
  let currentTab = "weapons";
  let selectedItemId = null;
  let focusedMemberIndex = 0;
  let escHandler = null;
  let cycleHandler = null;
  const shopOffsetY = scene.gameplayLayout?.portrait
    ? Math.round((scene.gameplayLayout.height - 600) / 2)
    : 0;
  const positionPortraitShop = () => {
    if (shopOffsetY === 0) return;
    for (const entry of scene.children.list) {
      if (
        entry?.depth >= MAIN_PANEL.depth &&
        Number.isFinite(entry.y) &&
        !entry.__kithlandsShopOffsetApplied
      ) {
        entry.y += shopOffsetY;
        entry.__kithlandsShopOffsetApplied = true;
      }
    }
  };
  scene.events.on("postupdate", positionPortraitShop);

  const destroyPicker = () => destroyGroup(pickerGroup);
  const destroyDetail = () => destroyGroup(detailGroup);
  const itemsForTab = (tabKey) => groupShopItems(items)[tabKey] || [];

  const currentSelectedItem = () =>
    itemsForTab(currentTab).find(
      (item) => shopSelectionID(item) === selectedItemId,
    ) || null;

  const showToast = (message, ms = 1200) => {
    scene.showMessage(message);
    scene.time.delayedCall(ms, () => scene.hideMessage());
  };

  const autosaveAfterPurchase = (result) => {
    if (!getAutosaveEnabled() || !result?.id) return;
    autosaveGame(result.id, "purchase")
      .then(() => {
        if (scene.flashSaveIcon) scene.flashSaveIcon();
      })
      .catch((e) => console.error("[Shop] autosave failed:", e));
  };

  const refreshCatalog = async () => {
    try {
      const refreshed = await getShop(scene.gameState.id, spawn.node_id);
      const resolved = resolveShopCatalog(refreshed);
      items = resolved.items;
      catalogError = resolved.error;
      if (catalogError) {
        console.error("[Shop] refresh failed:", catalogError);
        return false;
      }
      return true;
    } catch (e) {
      console.error("[Shop] refresh failed:", e);
      items = [];
      catalogError = catalogFailure(e);
      return false;
    }
  };

  const syncSelection = () => {
    const tabItems = itemsForTab(currentTab);
    const current = tabItems.find(
      (item) => shopSelectionID(item) === selectedItemId,
    );
    if (current && isEquipmentShopItem(current)) {
      return current;
    }
    const fallback = tabItems.find((item) => isEquipmentShopItem(item)) || null;
    selectedItemId = fallback ? shopSelectionID(fallback) : null;
    const partyCount = Math.min(scene.gameState?.party?.length || 0, 4);
    if (focusedMemberIndex >= partyCount) focusedMemberIndex = 0;
    return fallback;
  };

  const updateGold = () => {
    goldText.setText(`Gold: ${scene.gameState.gold}`);
  };

  const updateTabButtons = () => {
    tabButtons.forEach(({ key, button }) =>
      button.setActive(key === currentTab),
    );
  };

  const renderDetail = () => {
    destroyDetail();
    if (currentTab !== "weapons" && currentTab !== "armor") return;

    const item = currentSelectedItem();
    if (!item || !isEquipmentShopItem(item)) return;

    const party = (scene.gameState.party || []).slice(0, 4);
    if (party.length === 0) return;
    if (focusedMemberIndex >= party.length) focusedMemberIndex = 0;

    const member = party[focusedMemberIndex];
    const equipped = scene.gameState.equipment?.[focusedMemberIndex] || {};
    const compare = buildFocusedMemberCompare(item, member, equipped);
    const statBlock = buildItemStatBlock(item);
    const indicators = buildMemberIndicators(
      item,
      scene.gameState.party,
      scene.gameState.equipment,
    );
    const affordable = (scene.gameState.gold || 0) >= (item.price || 0);

    const panel = drawPanel(scene, DETAIL_X, DETAIL_Y, DETAIL_W, DETAIL_H, {
      depth: MAIN_PANEL.depth + 2,
      fill: 0x081225,
      stroke: 0x6699ff,
    });
    detailGroup.push(panel.bg);

    const title = scene.add
      .text(DETAIL_X, DETAIL_Y - 165, item.name, {
        fontSize: "16px",
        color: "#fff5c2",
        fontFamily: "Georgia",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    detailGroup.push(title);

    const cyclePrev = () => {
      focusedMemberIndex = cycleMemberIndex(
        focusedMemberIndex,
        party.length,
        -1,
      );
      renderDetail();
    };
    const cycleNext = () => {
      focusedMemberIndex = cycleMemberIndex(
        focusedMemberIndex,
        party.length,
        1,
      );
      renderDetail();
    };

    const prevBtn = drawCycleControl(
      scene,
      DETAIL_X - 100,
      DETAIL_Y - 135,
      "<",
      cyclePrev,
      MAIN_PANEL.depth + 5,
    );
    const nextBtn = drawCycleControl(
      scene,
      DETAIL_X + 100,
      DETAIL_Y - 135,
      ">",
      cycleNext,
      MAIN_PANEL.depth + 5,
    );
    detailGroup.push(prevBtn, nextBtn);

    const focusedCanEquip = canPartyMemberEquip(item, member);
    const focusText = scene.add
      .text(
        DETAIL_X,
        DETAIL_Y - 136,
        `${member.name} · ${member.class_name} · Lv.${member.level}`,
        {
          fontSize: "11px",
          color: focusedCanEquip ? "#d7e8ff" : "#dda866",
          fontFamily: "Arial",
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    detailGroup.push(focusText);

    if (!focusedCanEquip) {
      const lockedBadge = scene.add
        .text(DETAIL_X, DETAIL_Y - 120, "Ill suited to this path", {
          fontSize: "9px",
          color: "#dda866",
          fontFamily: "Arial",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 3);
      detailGroup.push(lockedBadge);
    }

    let indicatorX = DETAIL_X - 52;
    for (const indicator of indicators) {
      const marker = scene.add
        .text(indicatorX, DETAIL_Y - 110, indicator.symbol, {
          fontSize: indicator.slot === focusedMemberIndex ? "16px" : "13px",
          color: indicator.color,
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 3);
      detailGroup.push(marker);
      indicatorX += 34;
    }

    const currentLine = scene.add
      .text(DETAIL_X - 98, DETAIL_Y - 90, `Current: ${compare.currentName}`, {
        fontSize: "10px",
        color: "#ffffff",
        fontFamily: "Arial",
      })
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    const nextLine = scene.add
      .text(DETAIL_X - 98, DETAIL_Y - 76, `Preview: ${compare.nextName}`, {
        fontSize: "10px",
        color: "#ffffaa",
        fontFamily: "Arial",
      })
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    detailGroup.push(currentLine, nextLine);

    const lockText = scene.add
      .text(
        DETAIL_X - 98,
        DETAIL_Y - 58,
        compare.canEquip ? "May equip" : "May not wield",
        {
          fontSize: "10px",
          color: compare.canEquip ? "#44ff44" : "#ddaa66",
          fontFamily: "Arial",
        },
      )
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    detailGroup.push(lockText);

    let statY = DETAIL_Y - 34;
    const statHeader = scene.add
      .text(DETAIL_X - 98, statY, "Item Stats", {
        fontSize: "11px",
        color: "#ffcc44",
        fontFamily: "Georgia",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    detailGroup.push(statHeader);
    statY += 18;
    for (const stat of statBlock) {
      const line = scene.add
        .text(DETAIL_X - 98, statY, `${stat.label}: ${stat.value}`, {
          fontSize: "10px",
          color: "#dddddd",
          fontFamily: "Arial",
        })
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 3);
      detailGroup.push(line);
      statY += 14;
    }

    statY += 8;
    const compareHeader = scene.add
      .text(DETAIL_X - 98, statY, "Member Compare", {
        fontSize: "11px",
        color: "#ffcc44",
        fontFamily: "Georgia",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    detailGroup.push(compareHeader);
    statY += 18;

    for (const line of compare.lines) {
      const base = scene.add
        .text(
          DETAIL_X - 98,
          statY,
          `${line.label}: ${line.currentValue} to ${line.nextValue}`,
          {
            fontSize: "10px",
            color: "#dddddd",
            fontFamily: "Arial",
          },
        )
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 3);
      const delta = scene.add
        .text(DETAIL_X + 18, statY, line.deltaText, {
          fontSize: "10px",
          color: line.color,
          fontFamily: "Arial",
        })
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 3);
      detailGroup.push(base, delta);
      statY += 14;
    }

    const elementLine = scene.add
      .text(
        DETAIL_X - 98,
        statY,
        `Element: ${compare.currentElement} to ${compare.nextElement}`,
        {
          fontSize: "10px",
          color: "#dddddd",
          fontFamily: "Arial",
        },
      )
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    detailGroup.push(elementLine);

    const buyStandard = async () => {
      const result = await buyItem(
        scene.gameState.id,
        spawn.node_id,
        item.stock_id,
      );
      if (result?.error) {
        await recoverPurchaseError(result.error);
        return;
      }
      scene.gameState = result;
      updateGold();
      scene.updateHUD?.();
      await refreshAfterPurchase(`Bought: ${item.name}!`);
      autosaveAfterPurchase(result);
    };

    const buyForMember = async () => {
      const purchase = await buyItem(
        scene.gameState.id,
        spawn.node_id,
        item.stock_id,
      );
      if (purchase?.error) {
        await recoverPurchaseError(purchase.error);
        return;
      }

      const equipResult = await equipItem(
        purchase.id,
        focusedMemberIndex,
        item.instance_id || item.id,
        item.type,
      );
      const finalResult = equipResult?.error ? purchase : equipResult;
      scene.gameState = finalResult;
      updateGold();
      scene.updateHUD?.();
      await refreshAfterPurchase(
        equipResult?.error
          ? `Bought ${item.name}, but equip failed: ${equipResult.error}`
          : `${member.name} equipped ${item.name}!`,
      );
      autosaveAfterPurchase(finalResult);
    };

    const buyBtn = drawButton(
      scene,
      DETAIL_X - 55,
      DETAIL_Y + 153,
      86,
      30,
      "Buy",
      buyStandard,
      { depth: MAIN_PANEL.depth + 3, fontSize: "11px", fill: 0x1d4938 },
    );
    const buyForBtn = drawButton(
      scene,
      DETAIL_X + 50,
      DETAIL_Y + 153,
      150,
      30,
      buyForMemberLabel(member),
      buyForMember,
      { depth: MAIN_PANEL.depth + 3, fontSize: "10px", fill: 0x1d4938 },
    );
    if (!affordable) {
      buyBtn.setEnabled(false);
      buyForBtn.setEnabled(false);
    } else if (
      item.type === "equipment" ||
      !canPartyMemberEquip(item, member)
    ) {
      buyForBtn.setEnabled(false);
    }
    detailGroup.push(buyBtn, buyForBtn);
  };

  const renderList = (tabItems) => {
    destroyPicker();
    destroyGroup(listGroup);

    const selected = currentSelectedItem();
    const displayItems = tabItems.slice(0, 10);
    const currentGold = scene.gameState?.gold ?? 0;

    let y = 154;
    for (const item of displayItems) {
      const affordable = currentGold >= item.price;
      const equippable = isEquipmentShopItem(item);
      const selectedRow =
        selected && shopSelectionID(selected) === shopSelectionID(item);

      const rowBg = scene.add
        .rectangle(
          LIST_ROW_CENTER_X,
          y,
          LIST_ROW_WIDTH,
          LIST_ROW_HEIGHT,
          selectedRow ? 0x23395d : 0x111a33,
          0.95,
        )
        .setStrokeStyle(1, selectedRow ? 0x88ccff : 0x334466)
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 1);
      listGroup.push(rowBg);

      let desc = item.name;
      if (item.type === "spell" && item.school) {
        desc += ` (${item.school} ${item.spell_level})`;
      }
      if (item.type === "key_item") {
        desc += " [Key]";
      }

      const textColor = affordable || equippable ? "#ffffff" : "#777777";
      const label = scene.add
        .text(LIST_LEFT, y + LIST_TEXT_Y_OFFSET, desc, {
          fontSize: "11px",
          color: textColor,
          fontFamily: "Arial",
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 2);
      listGroup.push(label);

      const price = scene.add
        .text(455, y + LIST_TEXT_Y_OFFSET, `${item.price}g`, {
          fontSize: "11px",
          color: affordable ? "#ffcc44" : "#777777",
          fontFamily: "Arial",
        })
        .setOrigin(1, 0.5)
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 2);
      listGroup.push(price);

      if (equippable) {
        const selectRow = () => {
          selectedItemId = shopSelectionID(item);
          renderList(itemsForTab(currentTab));
          renderDetail();
        };
        rowBg.setInteractive({ useHandCursor: true });
        label.setInteractive({ useHandCursor: true });
        rowBg.on("pointerover", selectRow);
        label.on("pointerover", selectRow);
        rowBg.on("pointerdown", selectRow);
        label.on("pointerdown", selectRow);

        const indicators = buildMemberIndicators(
          item,
          scene.gameState.party,
          scene.gameState.equipment,
        );
        let indicatorX = 390;
        for (const indicator of indicators) {
          const marker = scene.add
            .text(indicatorX, y, indicator.symbol, {
              fontSize: "12px",
              color: indicator.color,
              fontFamily: "monospace",
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(MAIN_PANEL.depth + 2);
          listGroup.push(marker);
          indicatorX += 16;
        }
      } else if (affordable) {
        const triggerPurchase = async () => {
          if (item.type === "spell") {
            showSpellPicker(item);
            return;
          }
          const result = await buyItem(
            scene.gameState.id,
            spawn.node_id,
            item.stock_id,
          );
          if (result?.error) {
            await recoverPurchaseError(result.error);
            return;
          }
          scene.gameState = result;
          updateGold();
          scene.updateHUD?.();
          await refreshAfterPurchase(`Bought: ${item.name}!`);
          autosaveAfterPurchase(result);
        };
        rowBg.setInteractive({ useHandCursor: true });
        label.setInteractive({ useHandCursor: true });
        rowBg.on("pointerdown", triggerPurchase);
        label.on("pointerdown", triggerPurchase);
      }

      if (affordable && !equippable) {
        const triggerPurchase = async () => {
          if (item.type === "spell") {
            showSpellPicker(item);
            return;
          }
          const result = await buyItem(
            scene.gameState.id,
            spawn.node_id,
            item.stock_id,
          );
          if (result?.error) {
            await recoverPurchaseError(result.error);
            return;
          }
          scene.gameState = result;
          updateGold();
          scene.updateHUD?.();
          await refreshAfterPurchase(`Bought: ${item.name}!`);
          autosaveAfterPurchase(result);
        };
        const buyBtn = drawButton(
          scene,
          522,
          y,
          58,
          22,
          "Buy",
          triggerPurchase,
          {
            depth: MAIN_PANEL.depth + 2,
            fontSize: "10px",
            fill: 0x1d4938,
            fillHover: 0x2f6a50,
            stroke: 0x9cdfb4,
          },
        );
        listGroup.push(buyBtn);
      }

      y += LIST_ROW_GAP;
    }

    if (displayItems.length === 0) {
      const empty = scene.add
        .text(280, 205, "Nothing in this category.", {
          fontSize: "12px",
          color: "#666666",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 2);
      listGroup.push(empty);
    }
  };

  const renderCatalogError = () => {
    destroyPicker();
    destroyDetail();
    destroyGroup(listGroup);
    destroyGroup(catalogErrorGroup);
    selectedItemId = null;

    const message = scene.add
      .text(400, 245, `${catalogError}\nNo stale offers are being shown.`, {
        fontSize: "14px",
        color: "#ffd2a8",
        fontFamily: "Arial",
        align: "center",
        wordWrap: { width: 560 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 3);
    catalogErrorGroup.push(message);

    const retry = drawButton(
      scene,
      400,
      320,
      150,
      34,
      "Retry Stock",
      async () => {
        await refreshCatalog();
        renderCatalogView();
        if (!catalogError) showToast("Stock refreshed.");
      },
      {
        depth: MAIN_PANEL.depth + 3,
        fontSize: "12px",
        fill: 0x1d4938,
        fillHover: 0x2f6a50,
        stroke: 0x9cdfb4,
      },
    );
    catalogErrorGroup.push(retry);
  };

  function renderCatalogView() {
    destroyGroup(catalogErrorGroup);
    if (catalogError) {
      renderCatalogError();
      return;
    }
    syncSelection();
    renderList(itemsForTab(currentTab));
    renderDetail();
    updateTabButtons();
  }

  async function recoverPurchaseError(message) {
    const refreshed = await refreshCatalog();
    renderCatalogView();
    showToast(
      refreshed
        ? `${message} Stock refreshed.`
        : `${message} Use Retry Stock to reload offers.`,
      2400,
    );
  }

  async function refreshAfterPurchase(successMessage) {
    const refreshed = await refreshCatalog();
    renderCatalogView();
    showToast(
      refreshed
        ? successMessage
        : `${successMessage} Stock refresh failed; use Retry Stock.`,
      refreshed ? 1200 : 2600,
    );
  }

  const showSpellPicker = (item) => {
    destroyPicker();

    const panel = drawPanel(scene, 400, 305, 470, 250, {
      fill: 0x111133,
      stroke: 0x88aaff,
      depth: MAIN_PANEL.depth + 10,
    });
    pickerGroup.push(panel.bg);

    const titleText = scene.add
      .text(400, 205, `Learn ${item.name}`, {
        fontSize: "16px",
        color: "#ffff88",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 11);
    pickerGroup.push(titleText);

    const subtitle = scene.add
      .text(400, 228, "Choose a party member.", {
        fontSize: "11px",
        color: "#aaccee",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(MAIN_PANEL.depth + 11);
    pickerGroup.push(subtitle);

    const choices = buildSpellLearnerChoices(item, scene.gameState.party || []);
    let y = 258;
    for (const choice of choices) {
      const triggerLearn = async () => {
        const result = await learnSpell(
          scene.gameState.id,
          spawn.node_id,
          item.stock_id,
          choice.name,
        );
        if (result?.error) {
          await recoverPurchaseError(result.error);
          return;
        }
        scene.gameState = result;
        updateGold();
        scene.updateHUD?.();
        await refreshAfterPurchase(`${choice.name} learned ${item.name}!`);
        destroyPicker();
        autosaveAfterPurchase(result);
      };

      const label = scene.add
        .text(210, y, choice.label, {
          fontSize: "11px",
          color: choice.canLearn ? "#ffffff" : "#777777",
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(MAIN_PANEL.depth + 11);
      if (choice.canLearn) {
        label.setInteractive({ useHandCursor: true });
        label.on("pointerdown", triggerLearn);
      }
      pickerGroup.push(label);

      if (choice.canLearn) {
        const status = drawButton(
          scene,
          530,
          y + 6,
          82,
          22,
          "Learn",
          triggerLearn,
          {
            depth: MAIN_PANEL.depth + 11,
            fontSize: "10px",
            fill: 0x1d4938,
            fillHover: 0x2f6a50,
            stroke: 0x9cdfb4,
          },
        );
        pickerGroup.push(status);
      } else {
        const status = scene.add
          .text(492, y, choice.reason || "blocked", {
            fontSize: "11px",
            color: "#ddaa66",
            fontFamily: "Arial",
          })
          .setScrollFactor(0)
          .setDepth(MAIN_PANEL.depth + 11);
        pickerGroup.push(status);
      }

      y += 24;
    }

    const cancel = drawButton(
      scene,
      400,
      392,
      120,
      28,
      "Cancel",
      destroyPicker,
      { depth: MAIN_PANEL.depth + 11, fontSize: "11px" },
    );
    pickerGroup.push(cancel);
  };

  const mainPanel = drawPanel(
    scene,
    MAIN_PANEL.x,
    MAIN_PANEL.y,
    MAIN_PANEL.w,
    MAIN_PANEL.h,
    {
      depth: MAIN_PANEL.depth,
      variant: "ff6",
      radius: 10,
      innerTop: 0x223758,
      innerBottom: 0x101927,
      outerFill: 0x314d78,
    },
  );
  const scrim = scene.add
    .rectangle(
      scene.gameplayLayout?.centerX || 400,
      scene.gameplayLayout?.centerY || 300,
      scene.gameplayLayout?.width || 800,
      scene.gameplayLayout?.height || 600,
      0x02050b,
      0.94,
    )
    .setScrollFactor(0)
    .setDepth(MAIN_PANEL.depth - 1)
    .setInteractive();
  overlay.push(scrim);
  overlay.push(mainPanel.bg);

  const title = scene.add
    .text(400, 64, `${spawn.name}`, {
      fontSize: "20px",
      color: "#f5efe0",
      fontFamily: "Georgia",
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(MAIN_PANEL.depth + 1);
  overlay.push(title);

  const goldText = scene.add
    .text(400, 90, `Gold: ${scene.gameState.gold}`, {
      fontSize: "13px",
      color: "#f0d77a",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(MAIN_PANEL.depth + 1);
  overlay.push(goldText);

  let tabX = 144;
  for (const tab of tabs) {
    const tabBtn = drawButton(
      scene,
      tabX,
      120,
      96,
      28,
      tab.label,
      () => {
        currentTab = tab.key;
        renderCatalogView();
      },
      {
        depth: MAIN_PANEL.depth + 1,
        fontSize: "11px",
        fill: 0x1e3558,
        fillHover: 0x2b5486,
        stroke: 0x9cc8ff,
      },
    );
    overlay.push(tabBtn);
    tabButtons.push({ key: tab.key, button: tabBtn });
    tabX += 108;
  }

  const leaveBtn = drawButton(
    scene,
    400,
    536,
    190,
    32,
    "Leave Shop",
    closeShop,
    {
      depth: MAIN_PANEL.depth + 1,
      fontSize: "12px",
      fill: 0x2d2535,
      fillHover: 0x49385c,
      stroke: 0xd7b45c,
    },
  );
  overlay.push(leaveBtn);

  function closeShop() {
    scene.events.off("postupdate", positionPortraitShop);
    destroyPicker();
    destroyDetail();
    destroyGroup(listGroup);
    destroyGroup(catalogErrorGroup);
    destroyGroup(overlay);
    if (escHandler) {
      scene.input.keyboard.off("keydown-ESC", escHandler);
      escHandler = null;
    }
    if (cycleHandler) {
      scene.input.keyboard.off("keydown", cycleHandler);
      cycleHandler = null;
    }
    scene.animating = false;
    resumeWorldFor(scene, "shop");
  }

  escHandler = () => {
    if (scene._skipShopEscapeOnce) {
      scene._skipShopEscapeOnce = false;
      return;
    }
    if (!shouldHandleShopEscape(scene)) return;
    closeShop();
  };
  cycleHandler = (event) => {
    if (!shouldHandleShopEscape(scene)) return;
    if (!currentSelectedItem() || !isEquipmentShopItem(currentSelectedItem())) {
      return;
    }
    if (event.key === "[" || event.key === "l" || event.key === "L") {
      focusedMemberIndex = cycleMemberIndex(
        focusedMemberIndex,
        Math.min(scene.gameState?.party?.length || 0, 4),
        -1,
      );
      renderDetail();
    }
    if (event.key === "]" || event.key === "r" || event.key === "R") {
      focusedMemberIndex = cycleMemberIndex(
        focusedMemberIndex,
        Math.min(scene.gameState?.party?.length || 0, 4),
        1,
      );
      renderDetail();
    }
  };
  scene.input.keyboard.on("keydown-ESC", escHandler);
  scene.input.keyboard.on("keydown", cycleHandler);
  scene.events.once("shutdown", () => {
    scene.events.off("postupdate", positionPortraitShop);
  });

  renderCatalogView();
  positionPortraitShop();
}
