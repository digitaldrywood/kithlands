import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./world_menu.js", () => ({
  showEquipPicker: vi.fn(),
}));
vi.mock("./gem_workshop.js", () => ({
  showGemWorkshop: vi.fn(),
}));
vi.mock("./equipment_screen.js", () => ({
  showEquipmentScreen: vi.fn(),
}));

import {
  buildEquipmentBreakdown,
  openCharacterDetail,
  closeCharacterDetail,
} from "./character_detail.js";
import { showEquipPicker } from "./world_menu.js";
import { showGemWorkshop } from "./gem_workshop.js";
import { showEquipmentScreen } from "./equipment_screen.js";
import { isWorldInputLocked } from "../systems/modalLock.js";

function makeRectangle() {
  const handlers = {};
  const rect = {
    __kind: "rect",
    destroyed: false,
    handlers,
    setFillStyle(fill, alpha) {
      rect.fill = fill;
      if (alpha !== undefined) rect.fillAlpha = alpha;
      return rect;
    },
    setStrokeStyle(width, color) {
      rect.strokeWidth = width;
      rect.stroke = color;
      return rect;
    },
    setScrollFactor() {
      return rect;
    },
    setDepth() {
      return rect;
    },
    setInteractive() {
      rect.interactive = true;
      return rect;
    },
    disableInteractive() {
      rect.interactive = false;
      return rect;
    },
    setOrigin(ox, oy) {
      rect.originX = ox;
      rect.originY = oy;
      return rect;
    },
    on(event, fn) {
      handlers[event] = fn;
      return rect;
    },
    destroy() {
      rect.destroyed = true;
    },
  };
  return rect;
}

function makeText(initial) {
  const handlers = {};
  const text = {
    __kind: "text",
    text: initial,
    destroyed: false,
    handlers,
    setOrigin() {
      return text;
    },
    setScrollFactor() {
      return text;
    },
    setDepth() {
      return text;
    },
    setText(next) {
      text.text = next;
      return text;
    },
    setColor(color) {
      text.color = color;
      return text;
    },
    setInteractive() {
      text.interactive = true;
      return text;
    },
    on(event, fn) {
      handlers[event] = fn;
      return text;
    },
    destroy() {
      text.destroyed = true;
    },
  };
  return text;
}

function makeImage(key) {
  const image = {
    __kind: "image",
    key,
    destroyed: false,
    setScrollFactor() {
      return image;
    },
    setDepth() {
      return image;
    },
    setScale(scale) {
      image.scale = scale;
      return image;
    },
    destroy() {
      image.destroyed = true;
    },
  };
  return image;
}

function makeParty(size = 4) {
  return Array.from({ length: size }, (_, idx) => ({
    name: `Hero ${idx + 1}`,
    class_name: idx % 2 === 0 ? "Warrior" : "Cinder",
    class_id: idx % 2 === 0 ? "warrior" : "cinder",
    level: idx + 1,
    hp: 20 + idx,
    max_hp: 30 + idx,
    mp: idx,
    max_mp: 5 + idx,
    xp: idx * 10,
    xp_next: 100,
    str: 6 + idx,
    agi: 5 + idx,
    int_stat: 4 + idx,
    status: idx === 2 ? "Poison" : "",
    spells:
      idx % 2 === 0
        ? []
        : [
            { name: "Fire", mp_cost: 2 },
            { name: "Sleep", mp_cost: 1 },
          ],
  }));
}

function makeScene(partySize = 4) {
  const keyHandlers = { on: {}, once: {} };
  const scene = {
    created: { rects: [], texts: [], images: [] },
    textures: {
      exists() {
        return false;
      },
    },
    gameState: {
      party: makeParty(partySize),
      equipment: Array.from({ length: partySize }, (_, idx) => ({
        weapon_name: `Sword ${idx + 1}`,
        weapon_power: 5 + idx,
        weapon_item: {
          id: `wpn_gear_${idx + 1}`,
          instance_id: `gear_${idx + 1}`,
          kind: "weapon",
          name: `Sword ${idx + 1}`,
          power: 5 + idx,
          sockets: [{ index: 0 }],
        },
        armor_name: `Armor ${idx + 1}`,
        armor_absorb: 2 + idx,
      })),
    },
    input: {
      keyboard: {
        on(event, fn) {
          keyHandlers.on[event] = fn;
          return fn;
        },
        once(event, fn) {
          keyHandlers.once[event] = fn;
          return fn;
        },
        off(event, fn) {
          if (keyHandlers.on[event] === fn) delete keyHandlers.on[event];
          if (keyHandlers.once[event] === fn) delete keyHandlers.once[event];
        },
      },
    },
    keyHandlers,
    add: {
      rectangle(x, y, w, h, fill, alpha) {
        const rect = makeRectangle();
        rect.x = x;
        rect.y = y;
        rect.w = w;
        rect.h = h;
        rect.fill = fill;
        rect.fillAlpha = alpha ?? 1;
        scene.created.rects.push(rect);
        return rect;
      },
      text(x, y, str) {
        const text = makeText(str);
        text.x = x;
        text.y = y;
        scene.created.texts.push(text);
        return text;
      },
      image(x, y, key) {
        const image = makeImage(key);
        image.x = x;
        image.y = y;
        scene.created.images.push(image);
        return image;
      },
    },
  };
  return scene;
}

function groupTexts(scene) {
  return (scene.characterDetailGroup || []).filter(
    (entry) => entry?.__kind === "text",
  );
}

function currentTextValues(scene) {
  return groupTexts(scene)
    .map((entry) => entry.text)
    .concat(
      (scene.characterDetailGroup || [])
        .filter((entry) => entry?.label?.text)
        .map((entry) => entry.label.text),
    );
}

function currentEquipCards(scene) {
  return (scene.characterDetailGroup || []).filter(
    (entry) => entry?.__kind === "rect" && entry.w === 220 && entry.h === 90,
  );
}

function isDestroyed(entry) {
  if (entry?.destroyed === true) return true;
  if (typeof entry?.destroy !== "function") return false;
  if (entry?.bg && entry?.label) {
    return entry.bg.destroyed === true && entry.label.destroyed === true;
  }
  return false;
}

beforeEach(() => {
  showEquipPicker.mockClear();
  showGemWorkshop.mockClear();
  showEquipmentScreen.mockClear();
});

describe("equipment stat breakdown", () => {
  it("separates the base item, affix, and socket values from the resolved total", () => {
    const breakdown = buildEquipmentBreakdown(
      {
        power: 11,
        affixes: [{ name: "Keen", stat: "power", value: 2 }],
        sockets: [
          {
            gem_id: "ember_gem",
            gem_name: "Ember Gem",
            stat: "power",
            value: 3,
          },
        ],
      },
      "weapon",
    );

    expect(breakdown).toEqual({
      kind: "weapon",
      stat: "power",
      statLabel: "POWER",
      total: 11,
      base: 6,
      additions: [
        { source: "Keen", value: 2, type: "affix" },
        { source: "Ember Gem", value: 3, type: "gem" },
      ],
    });
  });

  it("uses the resolved equipment total for catalog gear without a rolled instance", () => {
    expect(buildEquipmentBreakdown(null, "armor", 5)).toMatchObject({
      stat: "absorb",
      total: 5,
      base: 5,
      additions: [],
    });
  });
});

describe("character detail navigation", () => {
  it("renders on-screen arrows and a position indicator", () => {
    const scene = makeScene(4);

    openCharacterDetail(scene, 1);

    expect(currentTextValues(scene)).toContain("<");
    expect(currentTextValues(scene)).toContain(">");
    expect(currentTextValues(scene)).toContain("2/4");
  });

  it("ArrowRight moves to the next member and refreshes the panel in place", () => {
    const scene = makeScene(4);

    openCharacterDetail(scene, 0);
    const firstGroup = [...scene.characterDetailGroup];

    scene.keyHandlers.on["keydown-RIGHT"]();

    expect(scene.characterDetailIndex).toBe(1);
    expect(currentTextValues(scene)).toContain("Hero 2");
    expect(firstGroup.every((entry) => isDestroyed(entry))).toBe(true);
    expect(isWorldInputLocked(scene)).toBe(true);
  });

  it("wraps left from the first member to the last and right back to the first", () => {
    const scene = makeScene(4);

    openCharacterDetail(scene, 0);
    scene.keyHandlers.on["keydown-LEFT"]();
    expect(scene.characterDetailIndex).toBe(3);
    expect(currentTextValues(scene)).toContain("Hero 4");

    scene.keyHandlers.on["keydown-RIGHT"]();
    expect(scene.characterDetailIndex).toBe(0);
    expect(currentTextValues(scene)).toContain("Hero 1");
  });

  it("keeps cycling stable for a one-member party", () => {
    const scene = makeScene(1);

    openCharacterDetail(scene, 0);
    scene.keyHandlers.on["keydown-LEFT"]();

    expect(scene.characterDetailIndex).toBe(0);
    expect(currentTextValues(scene)).toContain("1/1");
    expect(currentTextValues(scene)).toContain("Hero 1");
  });

  it("detaches old keyboard handlers on reopen and on close", () => {
    const scene = makeScene(3);

    openCharacterDetail(scene, 0);
    const leftBefore = scene.keyHandlers.on["keydown-LEFT"];
    const rightBefore = scene.keyHandlers.on["keydown-RIGHT"];
    const escBefore = scene.keyHandlers.once["keydown-ESC"];

    rightBefore();

    expect(scene.keyHandlers.on["keydown-LEFT"]).not.toBe(leftBefore);
    expect(scene.keyHandlers.on["keydown-RIGHT"]).not.toBe(rightBefore);
    expect(scene.keyHandlers.once["keydown-ESC"]).not.toBe(escBefore);

    closeCharacterDetail(scene);

    expect(scene.keyHandlers.on["keydown-LEFT"]).toBeUndefined();
    expect(scene.keyHandlers.on["keydown-RIGHT"]).toBeUndefined();
    expect(scene.keyHandlers.once["keydown-ESC"]).toBeUndefined();
    expect(isWorldInputLocked(scene)).toBe(false);
  });

  it("passes the navigated member index into the equip picker return path", () => {
    const scene = makeScene(4);

    openCharacterDetail(scene, 0);
    scene.keyHandlers.on["keydown-RIGHT"]();

    const [weaponCard] = currentEquipCards(scene);
    weaponCard.handlers.pointerup();

    expect(showEquipPicker).toHaveBeenCalledWith(scene, 1, "weapon", {
      returnTo: { type: "character", index: 1 },
    });
  });

  it("opens the complete loadout manager and returns to the character", () => {
    const scene = makeScene(2);
    openCharacterDetail(scene, 1);
    const loadoutButton = scene.characterDetailGroup.find(
      (entry) => entry?.label?.text === "FULL LOADOUT",
    );

    loadoutButton.bg.handlers.pointerdown();
    loadoutButton.bg.handlers.pointerup();

    expect(showEquipmentScreen).toHaveBeenCalledTimes(1);
    expect(showEquipmentScreen.mock.calls[0][0]).toBe(scene);
    expect(showEquipmentScreen.mock.calls[0][1]).toBe(1);
    showEquipmentScreen.mock.calls[0][2].onClose();
    expect(scene.characterDetailIndex).toBe(1);
    expect(currentTextValues(scene)).toContain("Hero 2");
  });

  it("shows derived attack using the equipped weapon power", () => {
    const scene = makeScene(1);

    openCharacterDetail(scene, 0);

    expect(currentTextValues(scene)).toContain("ATK: 11");
    expect(currentTextValues(scene)).toContain("STR: 6");
  });

  it("shows the equipped weapon breakdown immediately and armor on hover", () => {
    const scene = makeScene(1);
    scene.gameState.equipment[0].weapon_item = {
      ...scene.gameState.equipment[0].weapon_item,
      rarity: "Magic",
      item_level: 1,
      required_level: 1,
      power: 10,
      affixes: [{ name: "Keen", stat: "power", value: 2 }],
      sockets: [
        {
          index: 0,
          gem_id: "ember_gem",
          gem_name: "Ember Gem",
          stat: "power",
          value: 3,
        },
      ],
    };
    scene.gameState.equipment[0].weapon_power = 10;

    openCharacterDetail(scene, 0);

    expect(currentTextValues(scene)).toEqual(
      expect.arrayContaining([
        "EQUIPMENT DETAILS",
        "MAGIC • ITEM LV.1 • REQ LV.1",
        "POWER BREAKDOWN",
        "Base item  5",
        "Keen  +2",
        "Ember Gem  +3",
        "TOTAL POWER  10",
        "ATK 16 = STR 6 + WEAPON 10",
        "STR 6 = HERO 6 + GEAR 0",
        "AGI 5 = HERO 5 + GEAR 0",
      ]),
    );

    const [, armorCard] = currentEquipCards(scene);
    armorCard.handlers.pointerover();
    expect(currentTextValues(scene)).toEqual(
      expect.arrayContaining([
        "Armor 1",
        "ABSORB BREAKDOWN",
        "Base item  2",
        "TOTAL ABSORB  2",
        "DAMAGE ABSORB 2 = ARMOR 2",
      ]),
    );

    armorCard.handlers.pointerout();
    expect(currentTextValues(scene)).toContain("POWER BREAKDOWN");
  });

  it("pins an armor inspection for touch and ignores later weapon hover", () => {
    const scene = makeScene(1);
    openCharacterDetail(scene, 0);
    const detailsButtons = scene.characterDetailGroup.filter(
      (entry) => entry?.label?.text === "DETAILS",
    );
    expect(detailsButtons).toHaveLength(2);

    detailsButtons[1].bg.handlers.pointerdown();
    detailsButtons[1].bg.handlers.pointerup();
    expect(scene.characterEquipmentInspector.state.pinnedSlot).toBe("armor");
    expect(currentTextValues(scene)).toContain("PINNED • TAP TO RELEASE");
    expect(currentTextValues(scene)).toContain("ABSORB BREAKDOWN");

    const [weaponCard] = currentEquipCards(scene);
    weaponCard.handlers.pointerover();
    expect(currentTextValues(scene)).toContain("ABSORB BREAKDOWN");

    detailsButtons[1].bg.handlers.pointerdown();
    detailsButtons[1].bg.handlers.pointerup();
    expect(scene.characterEquipmentInspector.state.pinnedSlot).toBeNull();
    expect(currentTextValues(scene)).toContain("HOVER • TAP DETAILS");
  });

  it("opens socketing directly from the equipped weapon and returns to the character", () => {
    const scene = makeScene(1);

    openCharacterDetail(scene, 0);
    const socketButton = scene.characterDetailGroup.find(
      (entry) => entry?.label?.text === "SOCKET",
    );
    expect(socketButton).toBeTruthy();

    socketButton.bg.handlers.pointerdown();
    socketButton.bg.handlers.pointerup();

    expect(showGemWorkshop).toHaveBeenCalledTimes(1);
    expect(showGemWorkshop.mock.calls[0][0]).toBe(scene);
    expect(showGemWorkshop.mock.calls[0][1].preselectedInstanceID).toBe(
      "gear_1",
    );

    showGemWorkshop.mock.calls[0][1].onClose();
    expect(scene.characterDetailIndex).toBe(0);
    expect(currentTextValues(scene)).toContain("Hero 1");
  });

  it("shows the applied gem by name instead of another socket action", () => {
    const scene = makeScene(1);
    scene.gameState.equipment[0].weapon_item.sockets = [
      { index: 0, gem_id: "ember_gem", gem_name: "Ember Gem" },
    ];

    openCharacterDetail(scene, 0);

    expect(currentTextValues(scene)).toContain("◆ EMBER GEM");
    expect(
      scene.characterDetailGroup.some(
        (entry) => entry?.label?.text === "SOCKET",
      ),
    ).toBe(false);
  });

  it("keeps field healing selectable and explains the next step", () => {
    const scene = makeScene(2);
    scene.gameState.party = [
      {
        ...scene.gameState.party[0],
        class_id: "mender",
        class_name: "Mender",
        hp: 30,
        max_hp: 30,
        mp: 8,
        max_mp: 10,
        spells: [
          {
            id: "cure",
            name: "Cure",
            effect: "heal",
            target: "single_ally",
            mp_cost: 2,
          },
        ],
      },
      {
        ...scene.gameState.party[1],
        hp: 31,
        max_hp: 31,
        status: "",
        spells: [],
      },
    ];

    openCharacterDetail(scene, 0);

    expect(currentTextValues(scene)).toContain(
      "Select a spell, then choose a valid target.",
    );
    const cureRow = groupTexts(scene).find(
      (entry) => entry.text === "Cure (2)",
    );
    expect(cureRow?.interactive).toBe(true);
  });
});
