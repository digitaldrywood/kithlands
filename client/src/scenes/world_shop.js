import { getShop, buyItem, learnSpell, autosaveGame } from "../api.js";
import { getAutosaveEnabled } from "../systems/prefs.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";

export function groupShopItems(items = []) {
  return {
    weapons: items.filter((item) => item.type === "weapon"),
    armor: items.filter((item) => item.type === "armor"),
    consumables: items.filter((item) => item.type === "consumable"),
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

export async function openShop(scene, spawn) {
  pauseWorldFor(scene, "shop");
  scene.animating = true;

  let items = [];
  try {
    const shopData = await getShop(scene.gameState.id, spawn.node_id);
    items = shopData.shop_items || [];
  } catch (e) {
    console.error("[World] shop fetch failed:", e);
    scene.animating = false;
    resumeWorldFor(scene, "shop");
    return;
  }

  if (items.length === 0) {
    scene.showMessage(`${spawn.name} has nothing for sale.`);
    scene.time.delayedCall(1500, () => {
      scene.hideMessage();
      scene.animating = false;
      resumeWorldFor(scene, "shop");
    });
    return;
  }

  const overlay = [];
  let listGroup = [];
  let pickerGroup = [];
  let currentTab = "weapons";
  const tabButtons = [];
  const tabs = [
    { label: "Weapons", key: "weapons" },
    { label: "Armor", key: "armor" },
    { label: "Items", key: "consumables" },
    { label: "Spells", key: "spells" },
  ];

  const bg = scene.add
    .rectangle(400, 300, 650, 500, 0x0a0a22, 0.95)
    .setStrokeStyle(2, 0x444488)
    .setScrollFactor(0)
    .setDepth(50)
    .setInteractive();
  overlay.push(bg);

  const title = scene.add
    .text(400, 70, `${spawn.name}`, {
      fontSize: "18px",
      color: "#ffff44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(title);

  const goldText = scene.add
    .text(400, 95, `Gold: ${scene.gameState.gold}`, {
      fontSize: "13px",
      color: "#ffcc44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(goldText);

  const destroyPicker = () => {
    pickerGroup.forEach((obj) => obj.destroy());
    pickerGroup = [];
  };

  const itemsForTab = (tabKey) => groupShopItems(items)[tabKey] || [];

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
      items = refreshed.shop_items || [];
    } catch (e) {
      console.error("[Shop] refresh failed:", e);
    }
  };

  const syncState = async (result, successMessage) => {
    if (result?.error) {
      showToast(result.error, 1500);
      return false;
    }

    scene.gameState = result;
    goldText.setText(`Gold: ${result.gold}`);
    scene.updateHUD?.();
    await refreshCatalog();
    renderList(itemsForTab(currentTab));
    updateTabButtons();
    showToast(successMessage);
    autosaveAfterPurchase(result);
    return true;
  };

  const showSpellPicker = (item) => {
    destroyPicker();

    const panel = scene.add
      .rectangle(400, 305, 470, 250, 0x111133, 0.98)
      .setStrokeStyle(2, 0x88aaff)
      .setScrollFactor(0)
      .setDepth(60)
      .setInteractive();
    pickerGroup.push(panel);

    const titleText = scene.add
      .text(400, 205, `Learn ${item.name}`, {
        fontSize: "16px",
        color: "#ffff88",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(61);
    pickerGroup.push(titleText);

    const subtitle = scene.add
      .text(400, 228, "Choose a party member.", {
        fontSize: "11px",
        color: "#aaccee",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(61);
    pickerGroup.push(subtitle);

    const choices = buildSpellLearnerChoices(item, scene.gameState.party || []);
    let y = 258;
    for (const choice of choices) {
      const triggerLearn = async () => {
        const result = await learnSpell(
          scene.gameState.id,
          choice.name,
          item.id,
        );
        const ok = await syncState(
          result,
          `${choice.name} learned ${item.name}!`,
        );
        if (ok) destroyPicker();
      };

      const label = scene.add
        .text(210, y, choice.label, {
          fontSize: "11px",
          color: choice.canLearn ? "#ffffff" : "#777777",
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(61);
      if (choice.canLearn) {
        label.setInteractive({ useHandCursor: true });
        label.on("pointerdown", triggerLearn);
      }
      pickerGroup.push(label);

      const statusText = choice.canLearn
        ? "[LEARN]"
        : choice.reason || "blocked";
      const statusColor = choice.canLearn ? "#44ff44" : "#ddaa66";
      const status = scene.add
        .text(515, y, statusText, {
          fontSize: "11px",
          color: statusColor,
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(61);
      pickerGroup.push(status);

      if (choice.canLearn) {
        status.setInteractive({ useHandCursor: true });
        status.on("pointerover", () => status.setColor("#88ff88"));
        status.on("pointerout", () => status.setColor("#44ff44"));
        status.on("pointerdown", triggerLearn);
      }

      y += 24;
    }

    const cancel = scene.add
      .text(400, 392, "[ CANCEL ]", {
        fontSize: "12px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(61)
      .setInteractive({ useHandCursor: true });
    cancel.on("pointerdown", destroyPicker);
    pickerGroup.push(cancel);
  };

  const renderList = (tabItems) => {
    destroyPicker();
    listGroup.forEach((obj) => obj.destroy());
    listGroup = [];

    let y = 145;
    const displayItems = tabItems.slice(0, 10);
    const currentGold = scene.gameState?.gold ?? 0;

    for (const item of displayItems) {
      const affordable = currentGold >= item.price;
      const color = affordable ? "#ffffff" : "#666666";

      let desc = `${item.name}`;
      if (item.power) desc += ` (Pow:${item.power})`;
      if (item.absorb) desc += ` (Abs:${item.absorb})`;
      if (item.classes) desc += ` [${item.classes}]`;
      if (item.type === "spell" && item.school) {
        desc += ` (${item.school} ${item.spell_level})`;
      }
      desc += `  ${item.price}g`;

      const text = scene.add
        .text(150, y, desc, {
          fontSize: "11px",
          color,
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(52);
      const triggerPurchase = async () => {
        if (item.type === "spell") {
          showSpellPicker(item);
          return;
        }
        const result = await buyItem(scene.gameState.id, item.id, item.type);
        await syncState(result, `Bought: ${item.name}!`);
      };
      if (affordable) {
        text.setInteractive({ useHandCursor: true });
        text.on("pointerdown", triggerPurchase);
      }
      listGroup.push(text);

      if (affordable) {
        const buyBtn = scene.add
          .text(620, y, "[BUY]", {
            fontSize: "11px",
            color: "#44ff44",
            fontFamily: "monospace",
          })
          .setScrollFactor(0)
          .setDepth(52)
          .setInteractive({ useHandCursor: true });
        buyBtn.on("pointerover", () => buyBtn.setColor("#88ff88"));
        buyBtn.on("pointerout", () => buyBtn.setColor("#44ff44"));
        buyBtn.on("pointerdown", triggerPurchase);
        listGroup.push(buyBtn);
      }

      y += 22;
    }

    if (displayItems.length === 0) {
      const empty = scene.add
        .text(400, 200, "Nothing in this category.", {
          fontSize: "12px",
          color: "#666666",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(52);
      listGroup.push(empty);
    }
  };

  const updateTabButtons = () => {
    tabButtons.forEach(({ key, button }) => {
      const active = key === currentTab;
      button.setColor(active ? "#ffffff" : "#666666");
      button.setStyle({
        backgroundColor: active ? "#333366" : "#111133",
      });
    });
  };

  let tabX = 180;
  for (const tab of tabs) {
    const tabBtn = scene.add
      .text(tabX, 118, tab.label, {
        fontSize: "12px",
        color: tab.key === currentTab ? "#ffffff" : "#666666",
        fontFamily: "monospace",
        backgroundColor: tab.key === currentTab ? "#333366" : "#111133",
        padding: { x: 6, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(51)
      .setInteractive({ useHandCursor: true });
    tabBtn.on("pointerdown", () => {
      currentTab = tab.key;
      updateTabButtons();
      renderList(itemsForTab(currentTab));
    });
    overlay.push(tabBtn);
    tabButtons.push({ key: tab.key, button: tabBtn });
    tabX += 120;
  }

  const closeShop = () => {
    destroyPicker();
    overlay.forEach((obj) => obj.destroy());
    listGroup.forEach((obj) => obj.destroy());
    if (escHandler) {
      scene.input.keyboard.off("keydown-ESC", escHandler);
      escHandler = null;
    }
    scene.animating = false;
    resumeWorldFor(scene, "shop");
  };

  const closeBtn = scene.add
    .text(400, 530, "[ LEAVE SHOP (ESC) ]", {
      fontSize: "14px",
      color: "#aaaaaa",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51)
    .setInteractive({ useHandCursor: true });
  closeBtn.on("pointerdown", closeShop);
  overlay.push(closeBtn);

  let escHandler = null;
  escHandler = () => {
    closeShop();
    scene.input.keyboard.off("keydown-ESC", escHandler);
    escHandler = null;
  };
  scene.input.keyboard.on("keydown-ESC", escHandler);

  renderList(itemsForTab(currentTab));
  updateTabButtons();
}
