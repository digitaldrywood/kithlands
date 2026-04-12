import { getShop, buyItem, autosaveGame } from "../api.js";
import { getAutosaveEnabled } from "../systems/prefs.js";
import { pauseWorldFor, resumeWorldFor } from "../systems/modalLock.js";

export async function openShop(scene, spawn) {
  pauseWorldFor(scene, "shop");
  scene.animating = true;
  const gs = scene.gameState;

  let shopData;
  try {
    shopData = await getShop(gs.id, spawn.node_id);
  } catch (e) {
    console.error("[World] shop fetch failed:", e);
    scene.animating = false;
    resumeWorldFor(scene, "shop");
    return;
  }

  const items = shopData.shop_items || [];
  if (items.length === 0) {
    scene.showMessage(`${spawn.name} has nothing for sale.`);
    scene.time.delayedCall(1500, () => {
      scene.hideMessage();
      scene.animating = false;
      resumeWorldFor(scene, "shop");
    });
    return;
  }

  // Group items by type
  const weapons = items.filter((i) => i.type === "weapon");
  const armor = items.filter((i) => i.type === "armor");
  const consumables = items.filter((i) => i.type === "consumable");
  const spells = items.filter((i) => i.type === "spell");

  const overlay = [];
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
    .text(400, 95, `Gold: ${gs.gold}`, {
      fontSize: "13px",
      color: "#ffcc44",
      fontFamily: "monospace",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  overlay.push(goldText);

  // Tabs
  let currentTab = "weapons";
  const tabs = [
    { label: "Weapons", key: "weapons", items: weapons },
    { label: "Armor", key: "armor", items: armor },
    { label: "Items", key: "consumables", items: consumables },
    { label: "Spells", key: "spells", items: spells },
  ];

  let listGroup = [];

  const renderList = (tabItems, tabType) => {
    listGroup.forEach((o) => o.destroy());
    listGroup = [];

    let y = 145;
    const displayItems = tabItems.slice(0, 10); // max 10 items visible

    for (const item of displayItems) {
      const affordable = gs.gold >= item.price;
      const color = affordable ? "#ffffff" : "#666666";

      let desc = `${item.name}`;
      if (item.power) desc += ` (Pow:${item.power})`;
      if (item.absorb) desc += ` (Abs:${item.absorb})`;
      if (item.classes) desc += ` [${item.classes}]`;
      desc += `  ${item.price}g`;

      const text = scene.add
        .text(150, y, desc, {
          fontSize: "11px",
          color,
          fontFamily: "monospace",
        })
        .setScrollFactor(0)
        .setDepth(52);
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
        buyBtn.on("pointerdown", async () => {
          const result = await buyItem(
            gs.id,
            item.id,
            tabType === "spells"
              ? "consumable"
              : tabType === "weapons"
                ? "weapon"
                : tabType === "armor"
                  ? "armor"
                  : "consumable",
          );
          if (!result.error) {
            scene.gameState = result;
            gs.gold = result.gold;
            goldText.setText(`Gold: ${result.gold}`);
            scene.showMessage(`Bought: ${item.name}!`);
            scene.updateHUD();
            scene.time.delayedCall(1000, () => scene.hideMessage());
            renderList(tabItems, tabType);
            // Autosave after purchase
            if (getAutosaveEnabled() && result.id) {
              autosaveGame(result.id, "purchase")
                .then(() => {
                  if (scene.flashSaveIcon) scene.flashSaveIcon();
                })
                .catch((e) => console.error("[Shop] autosave failed:", e));
            }
          }
        });
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

  // Tab buttons
  let tabX = 180;
  for (const tab of tabs) {
    const isActive = tab.key === currentTab;
    const tabBtn = scene.add
      .text(tabX, 118, tab.label, {
        fontSize: "12px",
        color: isActive ? "#ffffff" : "#666666",
        fontFamily: "monospace",
        backgroundColor: isActive ? "#333366" : "#111133",
        padding: { x: 6, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(51)
      .setInteractive({ useHandCursor: true });
    tabBtn.on("pointerdown", () => {
      currentTab = tab.key;
      const type =
        tab.key === "weapons"
          ? "weapon"
          : tab.key === "armor"
            ? "armor"
            : "consumable";
      renderList(tab.items, type);
      // Refresh tab colors (hacky but works for prototype)
    });
    overlay.push(tabBtn);
    tabX += 120;
  }

  // Close button
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
  closeBtn.on("pointerdown", () => {
    overlay.forEach((o) => o.destroy());
    listGroup.forEach((o) => o.destroy());
    scene.animating = false;
    resumeWorldFor(scene, "shop");
  });
  overlay.push(closeBtn);

  // ESC to close
  const escHandler = scene.input.keyboard.on("keydown-ESC", () => {
    overlay.forEach((o) => o.destroy());
    listGroup.forEach((o) => o.destroy());
    scene.animating = false;
    resumeWorldFor(scene, "shop");
    scene.input.keyboard.off("keydown-ESC", escHandler);
  });

  // Show first tab
  renderList(weapons, "weapon");
}
