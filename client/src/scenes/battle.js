import { showDefeatReceipt } from "./defeat_receipt.js";
import { portraitFontSize } from "../systems/gameplayViewport.js";
import { combatReadTime } from "../ui/combat_read_time.js";
import { oncePerKeyEvent } from "../systems/keyboard_events.js";
import { meleeContactDetails } from "./battle_contact_fx.js";
import {
  beginBattleAction,
  physicalAttackState,
  physicalHitPresentations,
} from "./battle_action_playback.js";
import fieldPresentation from "../../../shared/field_presentation.json";
import abilityDefinitions from "../../../shared/abilities.json";
import { roundedRectangle } from "../ui/theme.js";
import { claimChest, gameAction, getGame } from "../api.js";
import { createBattleCharacterSprite } from "../sprites/battleCharacterSprite.js";
import { initAudio, playMusic, playSFX, stopMusic } from "../systems/audio.js";
import { shouldAcceptEnemySpriteClick } from "../systems/battleTargeting.js";
import {
  defaultSpellTargetMode,
  isGroupTargetMode,
  targetModeSide,
} from "../systems/battleSpellTargeting.js";
import { buildItemList, canUseOnTarget, itemUseContext } from "./item_menu.js";
import { battleChoicePanel } from "../ui/battle_choice_panel.js";
import {
  closeEquipmentScreen,
  showEquipmentScreen,
} from "./equipment_screen.js";
import {
  applyDamage,
  applyHeal,
  formatHPLabel,
  combatantConditionLabel,
  hpBarColorPct,
  hpBarFillWidth,
} from "../systems/hpBar.js";
import { showVictoryReceipt } from "./victory_receipt.js";
import {
  pendingEquipmentDrops,
  showPostBattleLoot,
} from "./post_battle_loot.js";
import { FloatingTextPool } from "../ui/floating_text.js";
import { MessageWindow } from "../ui/message_window.js";
import { TargetCursor } from "../ui/target_cursor.js";
import { drawBattlePartyStatus } from "../ui/battle_party_status.js";
import { monsterSpriteKey } from "../data/monsterSprites.js";
import {
  battleSpeedMul,
  getLongCinematicMode,
  messageCharMs,
} from "../systems/prefs.js";
import { toggleDebugPanel, closeDebugPanel } from "./debug_panel.js";
import {
  buildEnemyBattleLayout,
  buildPartyBattleLayout,
  floatingTextAnchorForEntry,
} from "./battle_layout.js";
import { battleHudLayout } from "./battle_hud_layout.js";
import {
  createBattleAuditSelection,
  currentBattleAuditSelection,
  cycleBattleAuditSelection,
} from "./battle_character_audit.js";
import {
  buildBattleActionButtons,
  planSmartRound,
  resolveAction,
} from "../systems/auto_battle.js";
import { drawButton, drawFF6BottomStrip, drawPanel } from "../ui/panel.js";
import { TILE_COLORS, TILE_IDS } from "./tileConstants.js";
import { battleBackdropFrame, pickBackgroundKey } from "./battleBackgrounds.js";
import {
  battleElementStyle,
  battleCastOrigin,
  buildAttackMotionPath,
  cinematicActionKey,
  prefersReducedBattleMotion,
  shouldPlayMajorCinematic,
  spellTravelDuration,
} from "./battle_cinematics.js";
import {
  battleEffectPresentation,
  playBattleEffectRelease,
  playBattleEffectToTarget,
} from "./battle_effects.js";

const ENEMY_COLORS = {
  Slime: 0x42a5f5,
  Goblin: 0x66bb6a,
  Wolf: 0x8d6e63,
  Skeleton: 0xeeeeee,
  "Dark Knight": 0x512da8,
};
const STATUS_ICONS = {
  poison: "icon_poison",
  sleep: "icon_sleep",
  silence: "icon_mute",
  stone: "icon_paralyze",
  confuse: "icon_confuse",
};
const ELEMENT_COLORS = {
  fire: 0xff4444,
  ice: 0x44aaff,
  lightning: 0xffff44,
  holy: 0xffffff,
  dark: 0x8844aa,
};
const ELEMENT_SFX = {
  fire: "sfx_fire",
  ice: "sfx_ice",
  lightning: "sfx_lightning",
};
const ACTION_TRACER_COLORS = {
  enemyToParty: 0xff8800,
  partyToEnemy: 0xffffff,
  magical: 0xbb88ff,
};
const ACTION_RETICLE_COLORS = {
  actor: 0xffff88,
  partyTarget: 0xff6666,
  enemyTarget: 0xffffff,
  magicalTarget: 0xbb88ff,
};
const CURSOR_TINTS = {
  actor: 0xffd36b,
  enemy: 0xff6666,
  ally: 0x66ff99,
};
const ACTION_BEAT_MS = {
  titleDisplay: 680,
  titleLead: 100,
  physicalAnticipation: 80,
  physicalLaunch: 160,
  spellCharge: 190,
  preImpact: 120,
  postDamage: 220,
  interAction: 160,
  multiTargetGap: 140,
  briefStatus: 300,
  infoPause: 350,
  recovery: 100,
  critShake: 80,
  majorPrelude: 1250,
};
const CLASS_SPRITES = {
  warrior: "warrior",
  cinder: "cinder",
  mender: "mender",
  rogue: "rogue",
  brawler: "brawler",
  wayfarer: "wayfarer",
  // Promoted classes
  knight: "knight",
  pyromancer: "pyromancer",
  sage: "sage",
  shadow: "shadow",
  champion: "champion",
  wanderer: "wanderer",
};

const DEFAULT_BATTLE_TILE = TILE_IDS.grass;
function mixColor(colorA, colorB, ratio = 0.5) {
  const mix = clamp(ratio, 0, 1);
  const a = Phaser.Display.Color.IntegerToColor(colorA);
  const b = Phaser.Display.Color.IntegerToColor(colorB);
  return Phaser.Display.Color.GetColor(
    Math.round(a.red + (b.red - a.red) * mix),
    Math.round(a.green + (b.green - a.green) * mix),
    Math.round(a.blue + (b.blue - a.blue) * mix),
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isLiquidTileType(tileType) {
  return (
    tileType === TILE_IDS.water ||
    tileType === TILE_IDS.lake ||
    tileType === TILE_IDS.river
  );
}

function resolvePortraitTextureKey(scene, member = {}) {
  const candidates = [
    member.sprite_id,
    member.class_id,
    String(member.class_name || "")
      .trim()
      .toLowerCase(),
  ];
  return candidates.find((key) => key && scene.textures.exists(key)) || null;
}

function battleThemeForTile(tileType, inTown = false) {
  const fallbackType = Number.isFinite(tileType)
    ? tileType
    : DEFAULT_BATTLE_TILE;
  const base = TILE_COLORS[fallbackType] ?? TILE_COLORS[DEFAULT_BATTLE_TILE];
  const skyTop = mixColor(base, inTown ? 0x1e2433 : 0x20304c, 0.78);
  const skyBottom = mixColor(base, inTown ? 0x684d3b : 0xb88652, 0.36);
  const far = mixColor(base, inTown ? 0x131925 : 0x182235, 0.68);
  const near = mixColor(base, inTown ? 0x0c1320 : 0x0c1422, 0.8);
  const ground = mixColor(base, inTown ? 0x27170f : 0x1a140e, 0.62);
  const haze = mixColor(base, 0xf2d99b, 0.26);
  const shadow = mixColor(base, 0x000000, 0.82);

  let motif = "plains";
  if (inTown) motif = "interior";
  else if (
    fallbackType === TILE_IDS.forest ||
    fallbackType === TILE_IDS.darkGrass
  )
    motif = "forest";
  else if (fallbackType === TILE_IDS.sand) motif = "dunes";
  else if (fallbackType === TILE_IDS.hill || fallbackType === TILE_IDS.mountain)
    motif = "mountains";
  else if (fallbackType === TILE_IDS.snow) motif = "snow";
  else if (fallbackType === TILE_IDS.marsh) motif = "marsh";
  else if (isLiquidTileType(fallbackType)) motif = "shore";

  return {
    tileType: fallbackType,
    motif,
    skyTop,
    skyBottom,
    far,
    near,
    ground,
    haze,
    shadow,
  };
}

function polygonPoints(values) {
  const points = [];
  for (let i = 0; i < values.length; i += 2) {
    points.push(new Phaser.Geom.Point(values[i], values[i + 1]));
  }
  return points;
}

function normalizeLastRoundActions(actions) {
  return Array.isArray(actions) && actions.length > 0 ? actions : null;
}

function isLowHpDanger(nextHP, maxHP) {
  return Number.isFinite(nextHP) && Number.isFinite(maxHP) && maxHP > 0
    ? nextHP / maxHP < 0.25
    : false;
}

export class BattleScene extends Phaser.Scene {
  constructor() {
    super("Battle");
  }

  init(data) {
    this.gameState = data.gameState;
    this.victoryContinueShown = false;
    this.victoryFastForwarded = false;
    this.victoryReceipt = null;
    // Only round restarts carry presentation forward; a new encounter starts fresh.
    this.battlePresentation = data.battlePresentation ?? {
      formation: (data.gameState?.enemies ?? []).map((enemy) => ({ ...enemy })),
    };
    this._lastRoundActions = normalizeLastRoundActions(
      data.lastRoundActions ?? data.gameState?.last_round_actions,
    );
    this._autoMode = data.autoMode || false;
    this._seenMajorCinematics = new Set(data.seenMajorCinematics || []);
    this.returnScene = data.returnScene || null;
    this.encounterTileType =
      data.encounterTileType ??
      data.gameState?.tile_type ??
      this.encounterTileType ??
      null;
    // Building type forwarded by Town (e.g. "temple", "inn", "shop", "house")
    // so interior battles can pick the matching pre-rendered background.
    this.buildingType =
      data.buildingType ?? data.returnScene?.spawn?.building_type ?? null;
  }

  restartBattle(data) {
    this.scene.restart({
      ...data,
      buildingType: this.buildingType,
      battlePresentation: this.battlePresentation,
    });
  }

  create() {
    // Clear previous keyboard listeners to prevent duplicates on scene restart
    this.input.keyboard.removeAllListeners();

    this.animating = false;
    this.enemySprites = {};
    this.partySprites = {};
    this.pendingAction = null;
    this.pendingSpellId = null;
    this.pendingSpellEffect = null;
    this.actionBtns = null;
    this.autoStopButton = null;
    this.autoStopHint = null;
    this.actionHudObjects = [];
    this.combatShadows = [];
    this.backdropObjects = [];
    this.activeMajorCinematic = null;
    this.lastMajorCinematicResult = null;

    // Per-member action collection
    this.memberActions = []; // array of {slot, type, target_id, spell_id}
    this.currentMemberIdx = 0;
    this.livingMembers = [];

    // Auto-battle / repeat-last-round state (issue #99)
    this.lastRoundActions = this._lastRoundActions;
    this.autoMode = this._autoMode;

    // Keyboard targeting state. `targetingMode` is false when not targeting,
    // "enemy" when picking an enemy (attack, damage spell), or "party" when
    // picking an ally (heal, buff, cure-status).
    this.targetingMode = false;
    this.selectedTargetIdx = 0;
    this.selectedPartyIdx = 0;
    this.livingEnemies = [];
    this.livingPartyTargets = [];
    this.enemyNumbers = [];
    this.targetHighlight = null;
    this.targetHighlightTween = null;
    this.pickerOverlay = null;
    this.pickerItems = [];
    this.actorCursor = null;
    this.targetCursor = null;
    this.hudLayout = battleHudLayout({
      viewportWidth: globalThis.window?.innerWidth ?? 800,
      viewportHeight: globalThis.window?.innerHeight ?? 600,
    });
    if (this.scale.gameSize.height !== this.hudLayout.gameHeight) {
      this.scale.setGameSize(
        this.hudLayout.gameWidth,
        this.hudLayout.gameHeight,
      );
    }

    // Floating text pool for damage/heal numbers
    if (this.floatingText) this.floatingText.destroy();
    this.floatingText = new FloatingTextPool(this);
    if (this.messageWindow) this.messageWindow.destroy();
    const messageBounds = this.hudLayout.message;
    this.messageWindow = new MessageWindow(this, {
      ...messageBounds,
      minHeight: Math.min(
        messageBounds.height,
        this.hudLayout.mode === "mobile" ? 360 : 92,
      ),
      maxHeight: messageBounds.height,
      anchorBottom: false,
      depth: 20,
      fontSize: `${Math.max(15, parseInt(portraitFontSize(this, 16)))}px`,
      lineSpacing: this.hudLayout.mode === "mobile" ? 6 : 2,
    });
    this.promptText = this.messageWindow;
    this.actorCursor = new TargetCursor(this, {
      depth: 12,
      tag: "actor-cursor",
      variant: "actor",
      label: "ACTING",
    });
    this.targetCursor = new TargetCursor(this, {
      depth: 15,
      variant: "target",
      label: "TARGET",
    });
    this.events.once("shutdown", () => {
      this.closePicker();
      this.floatingText?.destroy();
      this.messageWindow?.destroy();
      this.actorCursor?.destroy();
      this.targetCursor?.destroy();
      this.partyStatus?.destroy();
      this.destroyGroupTargetCursor();
      this.finishMajorCinematic?.(true);
      closeEquipmentScreen(this, { callOnClose: false });
      this.postBattleLootDialog?.dispose();
      this.victoryReceipt?.dialog.dispose();
      this.victoryReceipt = null;
      if (this.scale.gameSize.height !== 600) {
        this.scale.setGameSize(800, 600);
      }
    });

    const gs = this.gameState;
    if (!gs || gs.phase !== "combat" || !gs.enemies?.length) {
      if (gs?.combat_log?.length) this.showVictoryResults(gs);
      else this.returnFromBattle(gs);
      return;
    }

    // Find living party members
    for (let i = 0; i < gs.party.length; i++) {
      if (gs.party[i].hp > 0) this.livingMembers.push(i);
    }
    this.currentMemberIdx = 0;

    initAudio(this);

    // Play battle music (boss if size=boss, normal otherwise)
    const isBoss = gs.enemies.some((e) => e.size === "boss");
    playMusic(isBoss ? "music_boss" : "music_battle");

    this.drawBattleBackdrop();
    this.drawShowcaseBanner(gs);
    this.drawBottomStrip_();

    this.drawEnemies(gs);
    this.drawParty(gs);
    const syncShadows = () => {
      for (const entry of [
        ...Object.values(this.partySprites),
        ...Object.values(this.enemySprites),
      ]) {
        const sprite = entry.sprite,
          shadow = sprite?.battleShadow;
        if (!shadow?.active) continue;
        shadow.setPosition(
          sprite.x,
          sprite.y + (sprite.feetAnchored ? 0 : sprite.displayHeight / 2 - 4),
        );
        shadow.setVisible(sprite.visible && !entry.dead);
        shadow.setAlpha(sprite.alpha * (entry.row === "back" ? 0.24 : 0.32));
      }
    };
    this.events.on("postupdate", syncShadows);
    this.events.once("shutdown", () => {
      this.events.off("postupdate", syncShadows);
      for (const entry of Object.values(this.partySprites))
        entry.battleAction?.resume();
    });
    this.drawPartyStatus(gs);
    this.setupBattleCharacterAudit(gs);
    this.createLowHpVignette();

    this.setupKeyboard();

    // Boss intro animation
    if (isBoss) {
      this.animating = true;
      const boss = gs.enemies.find((e) => e.size === "boss");
      const overlay = this.add
        .rectangle(400, 300, 800, 600, 0x000000, 0.8)
        .setDepth(30);
      this.cameras.main.shake(200, 0.01);
      const bossText = this.add
        .text(400, 260, boss.name, {
          fontSize: "28px",
          color: "#ff4444",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(31)
        .setScale(0.5)
        .setAlpha(0);
      this.tweens.add({
        targets: bossText,
        scaleX: 1,
        scaleY: 1,
        alpha: 1,
        duration: 400,
        ease: "Back.easeOut",
      });
      this.tweens.add({
        targets: overlay,
        alpha: 0,
        duration: 600,
        delay: 600,
        onComplete: () => overlay.destroy(),
      });
      this.tweens.add({
        targets: bossText,
        alpha: 0,
        duration: 300,
        delay: 800,
        onComplete: () => bossText.destroy(),
      });
      this.time.delayedCall(1000, () => {
        this.animating = false;
        this.startTurnOrBanner();
      });
    } else {
      this.startTurnOrBanner();
    }

    if (gs.showcase_mode) {
      this.time.delayedCall(100, () => {
        if (this.scene.isActive() && !this.equipmentScreenState) {
          showEquipmentScreen(this, 0);
        }
      });
    }
  }

  // startTurnOrBanner routes the post-intro flow based on encounter_start.
  // Preemptive: show banner, then hand control to the player (enemies skip).
  // Ambush: show banner, then auto-submit a wait turn (party skips).
  // Normal: go straight to player input.
  startTurnOrBanner() {
    const kind = this.gameState?.encounter_start || "";
    if (kind !== "preemptive" && kind !== "ambush") {
      this.showCurrentMemberTurn();
      return;
    }
    this.animating = true;
    this.showEncounterStartBanner(kind, () => {
      this.animating = false;
      if (kind === "ambush") {
        this.submitWaitAction();
      } else {
        this.showCurrentMemberTurn();
      }
    });
  }

  // showEncounterStartBanner renders a one-shot full-screen banner declaring
  // the surprise outcome. Clones the boss-intro structure: dim overlay,
  // Back.easeOut zoom-in text, hold, fade. Gold/triumphant for preemptive,
  // red/alarm for ambush. Fires onComplete after ~1.2s.
  showEncounterStartBanner(kind, onComplete) {
    const isPreemptive = kind === "preemptive";
    const label = isPreemptive ? "PREEMPTIVE STRIKE!" : "AMBUSHED!";
    const color = isPreemptive ? "#ffcc00" : "#ff4444";
    const stroke = isPreemptive ? "#442200" : "#440000";

    const overlay = this.add
      .rectangle(400, 300, 800, 600, 0x000000, 0.6)
      .setDepth(9000);
    const text = this.add
      .text(400, 300, label, {
        fontFamily: "Arial, sans-serif",
        fontSize: "40px",
        color,
        stroke,
        strokeThickness: 6,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(9001)
      .setScale(0.3)
      .setAlpha(0);

    this.cameras.main.shake(
      isPreemptive ? 180 : 320,
      isPreemptive ? 0.006 : 0.012,
    );

    this.tweens.add({
      targets: text,
      scale: 1,
      alpha: 1,
      duration: 350,
      ease: "Back.easeOut",
      onComplete: () => {
        this.time.delayedCall(700, () => {
          this.tweens.add({
            targets: [text, overlay],
            alpha: 0,
            duration: 250,
            onComplete: () => {
              text.destroy();
              overlay.destroy();
              if (onComplete) onComplete();
            },
          });
        });
      },
    });
  }

  // submitWaitAction posts a server-authoritative "wait" turn so the party
  // sits out round 1 of an ambush. Server runs enemy actions only.
  async submitWaitAction() {
    this.animating = true;
    this.promptText.setText("You have been ambushed...").setColor("#ff4444");
    try {
      const result = await gameAction(this.gameState.id, { type: "wait" });
      if (result.error) {
        console.error("[Battle] wait error:", result.error);
        this.animating = false;
        return;
      }
      const log = result.combat_log || [];
      const actions = result.combat_actions || [];
      await this.animateCombatLog(log, actions);
      if (this.returnFromDungeonDefeat(result)) return;
      await this.reconcileEnemySprites(result.enemies || []);
      this.gameState = result;
      if (
        this.gameState.phase !== "combat" &&
        this.gameState.phase !== "defeat"
      ) {
        await this.playPartyVictoryBeat();
      }
      this.time.delayedCall(400, () => {
        this.animating = false;
        if (this.gameState.phase !== "combat") {
          this.showVictoryResults(this.gameState);
        } else {
          this.restartBattle({
            gameState: this.gameState,
            returnScene: this.returnScene,
            encounterTileType: this.encounterTileType,
            seenMajorCinematics: this.majorCinematicsSeen(),
          });
        }
      });
    } catch (e) {
      console.error("[Battle] wait failed:", e);
      this.animating = false;
    }
  }

  setupKeyboard() {
    // Action hotkeys (A/S/I/F) — any manual action cancels auto-mode (#99)
    this.input.keyboard.on(
      "keydown-A",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (this.currentMemberIdx >= this.livingMembers.length) return;
        this.autoMode = false;
        const slot = this.livingMembers[this.currentMemberIdx];
        const member = this.gameState.party[slot];
        this.pendingAction = "attack";
        this.enterTargetingMode();
        this.promptText
          .setText(`${member.name}: Select a target to attack!`)
          .setColor("#ff4444");
      }),
    );

    this.input.keyboard.on(
      "keydown-S",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (this.currentMemberIdx >= this.livingMembers.length) return;
        this.autoMode = false;
        const slot = this.livingMembers[this.currentMemberIdx];
        this.showSpellPicker(slot);
      }),
    );

    this.input.keyboard.on(
      "keydown-I",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (this.currentMemberIdx >= this.livingMembers.length) return;
        this.autoMode = false;
        const slot = this.livingMembers[this.currentMemberIdx];
        this.showItemPicker(slot);
      }),
    );

    this.input.keyboard.on(
      "keydown-M",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (this.currentMemberIdx >= this.livingMembers.length) return;
        this.autoMode = false;
        this.executeSmartAttack();
      }),
    );

    this.input.keyboard.on(
      "keydown-B",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (this.currentMemberIdx >= this.livingMembers.length) return;
        this.autoMode = false;
        const slot = this.livingMembers[this.currentMemberIdx];
        this.showAbilityPicker(slot);
      }),
    );

    this.input.keyboard.on(
      "keydown-D",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        const slot = this.livingMembers[this.currentMemberIdx];
        if (slot === undefined) return;
        this.handleActionButton(
          { type: "defend" },
          this.gameState.party[slot],
          this.gameState,
          slot,
        );
      }),
    );

    this.input.keyboard.on(
      "keydown-F",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (this.currentMemberIdx >= this.livingMembers.length) return;
        this.autoMode = false;
        this.doFlee();
      }),
    );

    // Major cinematics remain skippable after they begin. SPACE is a no-op
    // during normal battle input so it cannot accidentally select an action.
    this.input.keyboard.on("keydown-SPACE", () => {
      this.requestCinematicSkip();
    });

    // REPEAT last round's actions (issue #99)
    this.input.keyboard.on(
      "keydown-R",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (!this.lastRoundActions) return;
        this.executeRepeat();
      }),
    );

    // Toggle AUTO-BATTLE mode (issue #99)
    this.input.keyboard.on(
      "keydown-Q",
      oncePerKeyEvent((event) => {
        if (event.repeat) return;
        if (this.autoMode) {
          this.stopAutoAfterRound();
          return;
        }
        if (this.animating || this.targetingMode || this.pickerOverlay) return;
        if (!this.lastRoundActions) return;
        this.autoMode = true;
        this.executeRepeat();
      }),
    );

    // Number keys 1-9 for target/picker selection
    const numKeys = [
      "ONE",
      "TWO",
      "THREE",
      "FOUR",
      "FIVE",
      "SIX",
      "SEVEN",
      "EIGHT",
      "NINE",
    ];
    for (let n = 0; n < numKeys.length; n++) {
      this.input.keyboard.on(`keydown-${numKeys[n]}`, () => {
        if (this.animating) return;
        if (this.pickerOverlay && this.pickerItems.length > 0) {
          if (n < this.pickerItems.length) {
            this.pickerItems[n].action();
          }
          return;
        }
        if (this.targetingMode === "enemy") {
          // Match the displayed number (1-based position in full enemy list)
          const enemies = this.gameState.enemies;
          if (n < enemies.length && enemies[n].hp > 0) {
            this.exitTargetingMode();
            this.onEnemyClick(enemies[n].id);
          }
          return;
        }
        if (this.targetingMode === "party") {
          const party = this.gameState.party;
          if (n < party.length && party[n].hp > 0) {
            this.exitTargetingMode();
            this.onPartyClick(n);
          }
          return;
        }
      });
    }

    // Arrow keys to cycle targets
    this.input.keyboard.on("keydown-LEFT", () => {
      if (this.targetingMode === "enemy" && this.livingEnemies.length > 0) {
        this.selectedTargetIdx =
          (this.selectedTargetIdx - 1 + this.livingEnemies.length) %
          this.livingEnemies.length;
        this.updateTargetHighlight();
      } else if (
        this.targetingMode === "party" &&
        this.livingPartyTargets.length > 0
      ) {
        this.selectedPartyIdx =
          (this.selectedPartyIdx - 1 + this.livingPartyTargets.length) %
          this.livingPartyTargets.length;
        this.updatePartyTargetHighlight();
      }
    });

    this.input.keyboard.on("keydown-RIGHT", () => {
      if (this.targetingMode === "enemy" && this.livingEnemies.length > 0) {
        this.selectedTargetIdx =
          (this.selectedTargetIdx + 1) % this.livingEnemies.length;
        this.updateTargetHighlight();
      } else if (
        this.targetingMode === "party" &&
        this.livingPartyTargets.length > 0
      ) {
        this.selectedPartyIdx =
          (this.selectedPartyIdx + 1) % this.livingPartyTargets.length;
        this.updatePartyTargetHighlight();
      }
    });

    // Enter to confirm target
    this.input.keyboard.on("keydown-ENTER", () => {
      if (this.targetingMode === "enemy" && this.livingEnemies.length > 0) {
        const enemy = this.livingEnemies[this.selectedTargetIdx];
        this.exitTargetingMode();
        this.onEnemyClick(enemy.id);
      } else if (
        this.targetingMode === "party" &&
        this.livingPartyTargets.length > 0
      ) {
        const member = this.livingPartyTargets[this.selectedPartyIdx];
        this.exitTargetingMode();
        this.onPartyClick(member.slot);
      }
    });

    // Escape to cancel
    this.input.keyboard.on("keydown-ESC", () => {
      if (this.debugPanelOpen) {
        closeDebugPanel(this);
        return;
      }
      if (this.pickerOverlay) {
        this.closePicker();
        return;
      }
      if (this.targetingMode) {
        this.exitTargetingMode();
        this.pendingAction = null;
        this.pendingSpellId = null;
        this.pendingSpellEffect = null;
        this.pendingSpellTargetMode = null;
        const slot = this.livingMembers[this.currentMemberIdx];
        const member = this.gameState.party[slot];
        this.promptText
          .setText(this.memberTurnPrompt(member))
          .setColor("#ffff44");
        return;
      }
    });

    // Dev-only debug panel (#145). See world.js for the gating rationale.
    if (import.meta.env && import.meta.env.DEV) {
      if (this.battleAuditSelection) {
        this.input.keyboard.on("keydown-J", () =>
          this.cycleBattleCharacterAudit("identity", -1),
        );
        this.input.keyboard.on("keydown-K", () =>
          this.cycleBattleCharacterAudit("identity", 1),
        );
        this.input.keyboard.on("keydown-E", () =>
          this.cycleBattleCharacterAudit("equipment", 1),
        );
        this.input.keyboard.on("keydown-N", () =>
          this.cycleBattleCharacterAudit("animation", 1),
        );
        this.input.keyboard.on("keydown-V", () =>
          this.cycleBattleCharacterAudit("effect", 1),
        );
        this.input.keyboard.on("keydown-B", () =>
          this.cycleBattleCharacterAudit("family", 1),
        );
        this.input.keyboard.on("keydown-T", () =>
          this.cycleBattleCharacterAudit("intensity", 1),
        );
        this.input.keyboard.on("keydown-P", () =>
          this.playBattleCharacterAudit(),
        );
      }
      this.input.keyboard.on("keydown-BACKTICK", () => toggleDebugPanel(this));
    }
  }

  memberTurnPrompt(member) {
    const plans = new Map();
    for (const enemy of this.gameState.enemies || []) {
      if (enemy.hp <= 0 || !enemy.intent?.label) continue;
      // Group equal plans without claiming a target or predicting damage.
      const label = enemy.intent.label.replace(/^Plans: /, "").split(":")[0];
      plans.set(label, (plans.get(label) || 0) + 1);
    }
    if (!plans.size) return `${member.name}'s turn -- choose an action`;
    return `${member.name}'s turn -- choose an action\nEnemy plans: ${[...plans].map(([label, count]) => `${label}${count > 1 ? ` ×${count}` : ""}`).join(" · ")}`;
  }

  showCurrentMemberTurn() {
    const gs = this.gameState;
    if (this.currentMemberIdx >= this.livingMembers.length) {
      // All members have chosen -- send all actions to server
      this.submitAllActions();
      return;
    }

    // Auto-mode: auto-submit REPEAT every round (issue #99)
    if (this.autoMode && this.lastRoundActions) {
      this.executeRepeat();
      return;
    }

    const slot = this.livingMembers[this.currentMemberIdx];
    const member = gs.party[slot];

    this.promptText.setText(this.memberTurnPrompt(member)).setColor("#ffff44");
    this.pendingAction = null;
    this.pendingSpellId = null;
    this.pendingSpellEffect = null;
    this.targetCursor?.hide();
    this.showActorCursor(this.partySprites[member.name]);
    this.partyStatus?.setActive(slot);

    // Draw action buttons for this member
    this.drawActions(gs, slot);
  }

  drawBattleBackdrop() {
    const theme = battleThemeForTile(
      this.encounterTileType,
      this.returnScene?.sceneKey === "Town",
    );
    this.backdropTheme = theme;

    // Prefer a pre-rendered Gemini background when the motif's texture exists.
    // Seed from tile + enemy composition so distinct encounters pick distinct
    // variants while the same line-up on the same tile is reproducible. The
    // server-side GameState does not expose a per-encounter counter, so the
    // enemy id list is the best available signal. Falls back to the procedural
    // path below when the PNG is missing (e.g. before the generator script
    // has been run, or when the fallback test renames the folder out).
    const gs = this.gameState;
    const enemyFingerprint = Array.isArray(this.battlePresentation.formation)
      ? this.battlePresentation.formation
          .map((e) => `${e?.id ?? ""}:${e?.name ?? ""}`)
          .join(",")
      : "";
    const seedParts = [
      this.encounterTileType ?? "x",
      this.buildingType ?? "",
      enemyFingerprint,
    ].join("|");
    const key = (this.battlePresentation.backgroundKey ??=
      (gs.final_encounter?.active && gs.final_encounter.battle_background) ||
      gs.dungeon?.battle_background ||
      (theme.motif === "plains" ? fieldPresentation.meadow.battle.key : null) ||
      pickBackgroundKey(theme.motif, seedParts, this.buildingType));
    if (key && this.textures.exists(key)) {
      const bg = this.add
        .image(
          0,
          0,
          key,
          key === fieldPresentation.meadow.battle.key
            ? undefined
            : battleBackdropFrame(this.textures.get(key)),
        )
        .setOrigin(0, 0)
        .setDepth(-5)
        .setDisplaySize(
          800,
          this.hudLayout.battlefield.y + this.hudLayout.battlefield.height,
        );
      bg._combatFxTag = "battle-backdrop";
      bg._combatFxVariant = "image";
      this.backdropObjects.push(bg);
      return;
    }
    this.drawProceduralBackdrop_(theme);
  }

  drawShowcaseBanner(gs) {
    if (!gs?.showcase_mode) return;

    const title = gs.showcase_title || "SYSTEMS SHOWCASE";
    const hasBattleAudit =
      import.meta.env?.DEV && !!gs.battle_character_audit?.identities?.length;
    const tips = (gs.showcase_tips || []).slice(0, 3);
    if (tips.length === 0) tips.push("Dev-only disposable battle");
    const panel = this.add.graphics().setDepth(11).setScrollFactor(0);
    panel._combatFxTag = "showcase-banner";
    panel.fillStyle(0x151e2b, 0.9);
    panel.fillRoundedRect(12, 10, 520, 76, 7);
    panel.lineStyle(2, 0xff66cc, 0.9);
    panel.strokeRoundedRect(12, 10, 520, 76, 7);
    this.add
      .text(24, 17, title, {
        fontSize: "12px",
        color: "#ff88dd",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setDepth(12)
      .setScrollFactor(0);
    const detailText = hasBattleAudit
      ? "Loading server-authorized battle audit..."
      : tips.join("\n");
    const detail = this.add
      .text(24, 34, detailText, {
        fontSize: "8px",
        color: "#e8d6ea",
        fontFamily: "Arial, sans-serif",
        lineSpacing: 2,
      })
      .setDepth(12)
      .setScrollFactor(0);
    if (hasBattleAudit) {
      detail._combatFxTag = "battle-character-audit-readout";
      this.battleAuditReadout = detail;
    }
  }

  setupBattleCharacterAudit(gs) {
    if (!import.meta.env?.DEV || !gs?.battle_character_audit) return;
    this.battleAuditSelection = createBattleAuditSelection(
      gs.battle_character_audit,
    );
    this.refreshBattleCharacterAudit(true);
  }

  refreshBattleCharacterAudit(rebuildSprite = false) {
    const selection = currentBattleAuditSelection(this.battleAuditSelection);
    const identity = selection.identity;
    const equipment = selection.equipment;
    const lead = this.gameState?.party?.[0];
    const entry = lead ? this.partySprites?.[lead.name] : null;
    if (!identity || !equipment || !entry) return null;

    if (rebuildSprite) {
      const shadow = entry.sprite?.battleShadow;
      entry.sprite?.removeInteractive?.();
      entry.sprite?.destroy?.();
      const sprite = createBattleCharacterSprite(
        this,
        entry.x,
        entry.y,
        equipment.composition,
        {
          alive: entry.alive,
          targetSize: 108,
          fallbackKey: CLASS_SPRITES[identity.id] || identity.id,
        },
      );
      sprite.battleShadow = shadow;
      sprite.setDepth(4);
      if (entry.alive) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => {
          if (this.targetingMode === "party") this.onPartyClick(entry.slot);
        });
      }
      entry.sprite = sprite;
      entry.classId = identity.id;
      entry.baseTextureKey = CLASS_SPRITES[identity.id] || identity.id;
      this.showActorCursor(entry);
    }

    const layerLabel = entry.sprite?.isBattleCharacter
      ? "LAYERED"
      : equipment.type === "unarmed"
        ? "BODY"
        : "GOLD SLICE PENDING";
    const shieldLabel = identity.supports_shield ? " · SHIELD SLOT" : "";
    this.battleAuditReadout?.setText(
      [
        `AUDIT ${this.battleAuditSelection.identityIndex + 1}/${this.battleAuditSelection.catalog.identities.length}  ${identity.name.toUpperCase()} · ${equipment.type.toUpperCase()} [${layerLabel}${shieldLabel}]`,
        `STATE ${String(selection.animationState).toUpperCase()} · SCOPE ${String(selection.effectMode).toUpperCase()}`,
        `VFX ${String(selection.effectFamily).toUpperCase()} · TIER ${selection.intensityTier}`,
        "J/K class · E gear · N state · V scope · B family · T tier · P play",
      ].join("\n"),
    );
    return selection;
  }

  cycleBattleCharacterAudit(kind, direction = 1) {
    if (!this.battleAuditSelection) return null;
    cycleBattleAuditSelection(this.battleAuditSelection, kind, direction);
    return this.refreshBattleCharacterAudit(
      kind === "identity" || kind === "equipment",
    );
  }

  resetBattleCharacterAuditSprite(entry) {
    const sprite = entry?.sprite;
    if (!sprite) return;
    this.tweens.killTweensOf(sprite);
    this.setSpritePosition(sprite, entry.x, entry.y);
    sprite.resetBattlePose?.();
    sprite.clearTint?.();
    sprite.setAlpha?.(1);
    sprite.setAngle?.(0);
  }

  playBattleCharacterAudit() {
    const selection = this.refreshBattleCharacterAudit(false);
    const lead = this.gameState?.party?.[0];
    const actor = lead ? this.partySprites?.[lead.name] : null;
    if (!selection || !actor?.sprite) return null;
    this.resetBattleCharacterAuditSprite(actor);
    const effectPresentation = battleEffectPresentation({
      presentation: {
        effect_family: selection.effectFamily,
        intensity_tier: selection.intensityTier,
      },
    });

    const state = selection.animationState;
    if (state === "physical_attack") {
      if (actor.sprite.playBattleAttack) {
        void actor.sprite.playBattleAttack({
          reducedMotion: this.reducedBattleMotion(),
          speedMultiplier: battleSpeedMul(),
        });
      } else {
        this.tweens.add({
          targets: actor.sprite,
          x: actor.x - 34,
          duration: this.scaledMs(160),
          yoyo: true,
          ease: "Quad.Out",
        });
      }
    } else if (state === "cast_class_ability") {
      void actor.sprite.playBattleCast?.({
        reducedMotion: this.reducedBattleMotion(),
        speedMultiplier: battleSpeedMul(),
      });
      this.spawnCastAura(actor, "holy");
      void playBattleEffectRelease(
        this,
        this.resolveVisualEntry(actor),
        effectPresentation,
      );
      void this.showActionTitle(actor, "CLASS ABILITY", "#fff2bd");
    } else if (state === "defend") {
      if (actor.sprite.playBattleDefend) {
        void actor.sprite.playBattleDefend({
          reducedMotion: this.reducedBattleMotion(),
          speedMultiplier: battleSpeedMul(),
        });
      } else {
        actor.sprite.setTint?.(0x88ccff);
        this.spawnActionReticle(actor, 0x88ccff, 480);
        this.scaledDelay(480, () => actor.sprite?.clearTint?.());
      }
    } else if (state === "hit_reaction") {
      if (actor.sprite.playBattleHitReaction) {
        void actor.sprite.playBattleHitReaction({
          reducedMotion: this.reducedBattleMotion(),
          speedMultiplier: battleSpeedMul(),
        });
      } else {
        this.playCombatantHitReaction(actor, { isParty: true });
      }
    } else if (state === "item_use") {
      void actor.sprite.playBattleItemUse?.({
        reducedMotion: this.reducedBattleMotion(),
        speedMultiplier: battleSpeedMul(),
      });
      this.spawnSpellImpact(actor, "holy");
      void this.showActionTitle(actor, "ITEM", "#66ff99");
    } else if (state === "victory") {
      if (actor.sprite.playBattleVictory) {
        void actor.sprite.playBattleVictory({
          reducedMotion: this.reducedBattleMotion(),
          speedMultiplier: battleSpeedMul(),
        });
      } else {
        this.tweens.add({
          targets: actor.sprite,
          y: actor.y - 18,
          duration: this.scaledMs(180),
          yoyo: true,
          repeat: 1,
          ease: "Sine.Out",
        });
      }
    } else if (state === "ko_defeated") {
      if (actor.sprite.playBattleKO) {
        void actor.sprite.playBattleKO({
          reducedMotion: this.reducedBattleMotion(),
          speedMultiplier: battleSpeedMul(),
        });
      } else {
        actor.sprite.setTint?.(0x444444);
        actor.sprite.setAngle?.(90);
        actor.sprite.setAlpha?.(0.68);
      }
    }

    const enemies = Object.values(this.enemySprites || {}).filter(
      (entry) => entry && !entry.dead && !entry.dying,
    );
    const allies = Object.values(this.partySprites || {}).filter(
      (entry) => entry && entry.alive,
    );
    this.targetCursor?.hide();
    this.destroyGroupTargetCursor();
    const playPreview = (entry, fallbackElement) => {
      const customEffect = playBattleEffectToTarget(
        this,
        this.resolveVisualEntry(actor),
        this.resolveVisualEntry(entry),
        effectPresentation,
      );
      if (!customEffect) this.spawnSpellImpact(entry, fallbackElement);
    };
    if (selection.effectMode === "single_target" && enemies[0]) {
      this.showTargetCursor(enemies[0], "enemy");
      playPreview(enemies[0], "holy");
    } else if (selection.effectMode === "all_enemies") {
      this.showGroupTargetCursor(enemies, "enemy");
      enemies.forEach((entry) => playPreview(entry, "fire"));
    } else if (selection.effectMode === "all_allies") {
      this.showGroupTargetCursor(allies, "party");
      allies.forEach((entry) => playPreview(entry, "holy"));
    }
    return selection;
  }

  battleCharacterAuditSnapshot() {
    const current = currentBattleAuditSelection(this.battleAuditSelection);
    const catalog = this.battleAuditSelection?.catalog;
    if (!catalog || !current.identity) return null;
    const lead = this.gameState?.party?.[0];
    const entry = lead ? this.partySprites?.[lead.name] : null;
    return {
      identityCount: catalog.identities.length,
      identityIDs: catalog.identities.map((identity) => identity.id),
      equipmentTypes: [
        ...new Set(
          catalog.identities.flatMap((identity) =>
            identity.equipment.map((equipment) => equipment.type),
          ),
        ),
      ],
      animationStates: [...catalog.animation_states],
      effectModes: [...catalog.effect_modes],
      effectFamilies: [...catalog.effect_families],
      intensityTiers: [...catalog.intensity_tiers],
      identityIndex: this.battleAuditSelection.identityIndex,
      identityID: current.identity.id,
      equipmentType: current.equipment?.type || null,
      layerAvailable: entry?.sprite?.isBattleCharacter || false,
      supportsShield: current.identity.supports_shield || false,
      animationState: current.animationState,
      availableStates: [...(entry?.sprite?.battleAvailableStates || [])],
      effectMode: current.effectMode,
      effectFamily: current.effectFamily,
      intensityTier: current.intensityTier,
      textureKey:
        entry?.sprite?.battleTextureKey ?? entry?.sprite?.texture?.key ?? null,
      weaponTextureKey: entry?.sprite?.weaponTextureKey ?? null,
      shieldTextureKey: entry?.sprite?.shieldTextureKey ?? null,
    };
  }

  // Opaque FF6-style strip that occludes the bottom third of the (pre-rendered
  // or procedural) backdrop, so the MessageWindow + ACTION_HUD panels above
  // never have to fight the background for contrast. Placed at depth 6, which
  // is above the backdrop image (-5) but below combatants (party sprites run
  // at depth 4 for torsos but their own shadows are at 1 — strip at 6 covers
  // the painted lower third, and combatant sprites still render in front
  // because their bodies extend up into the non-strip region. Party sprite
  // feet around y=420 are at the top of the strip, which is visually correct
  // for a JRPG — they appear to stand at the strip edge.)
  drawBottomStrip_() {
    // Depth 2 places the strip above the backdrop image (-5) and the
    // procedural ground layer (0), but BELOW party sprites (depth 4) and the
    // HUD/MessageWindow panels (depth 16+) so combatants and UI render in
    // front. y=470 aligns the top edge with the MessageWindow at y=478 so
    // the message panel reads as a cell within the strip.
    const stripBounds = this.hudLayout?.strip || {
      x: 0,
      y: 432,
      width: 800,
      height: 168,
    };
    const strip = drawFF6BottomStrip(this, {
      ...stripBounds,
      depth: 2,
    });
    strip._combatFxTag = "bottom-strip";
    this.backdropObjects.push(strip);
  }

  drawProceduralBackdrop_(theme) {
    const stripeHeight = 44;
    for (let i = 0; i < 8; i++) {
      const ratio = i / 7;
      const stripe = this.add
        .rectangle(
          400,
          24 + i * stripeHeight + stripeHeight / 2,
          800,
          stripeHeight + 2,
          mixColor(theme.skyTop, theme.skyBottom, ratio),
          1,
        )
        .setDepth(-5);
      stripe._combatFxTag = "battle-backdrop";
      this.backdropObjects.push(stripe);
    }

    const glow = this.add
      .circle(
        theme.motif === "dunes" ? 636 : 158,
        theme.motif === "snow" ? 114 : 138,
        theme.motif === "interior" ? 52 : 74,
        mixColor(theme.haze, 0xffffff, 0.18),
        theme.motif === "interior" ? 0.2 : 0.3,
      )
      .setDepth(-4);
    glow._combatFxTag = "battle-backdrop";
    this.backdropObjects.push(glow);

    const hazeBand = this.add
      .rectangle(400, 256, 800, 120, theme.haze, 0.16)
      .setDepth(-3);
    hazeBand._combatFxTag = "battle-backdrop";
    this.backdropObjects.push(hazeBand);

    const farLayer = this.add.graphics().setDepth(-2);
    farLayer._combatFxTag = "battle-backdrop";
    farLayer.fillStyle(theme.far, 0.96);
    const farPoints =
      theme.motif === "forest"
        ? [
            0, 312, 60, 250, 138, 290, 216, 214, 316, 286, 418, 212, 530, 294,
            618, 232, 726, 282, 800, 238, 800, 600, 0, 600,
          ]
        : [
            0, 318, 92, 264, 188, 286, 286, 228, 392, 276, 506, 224, 624, 278,
            728, 234, 800, 256, 800, 600, 0, 600,
          ];
    farLayer.fillPoints(polygonPoints(farPoints), true);
    this.backdropObjects.push(farLayer);

    const nearLayer = this.add.graphics().setDepth(-1);
    nearLayer._combatFxTag = "battle-backdrop";
    nearLayer.fillStyle(theme.near, 0.98);
    const nearPoints =
      theme.motif === "marsh"
        ? [
            0, 366, 84, 346, 168, 358, 246, 332, 336, 350, 432, 324, 540, 348,
            646, 324, 744, 340, 800, 330, 800, 600, 0, 600,
          ]
        : [
            0, 378, 96, 336, 186, 358, 280, 320, 386, 356, 484, 316, 590, 350,
            694, 318, 800, 346, 800, 600, 0, 600,
          ];
    nearLayer.fillPoints(polygonPoints(nearPoints), true);
    this.backdropObjects.push(nearLayer);

    const groundBand = this.add.graphics().setDepth(0);
    groundBand._combatFxTag = "ground-plane";
    groundBand.fillStyle(theme.ground, 0.9);
    groundBand.fillRoundedRect(16, 302, 768, 126, 22);
    groundBand.fillStyle(mixColor(theme.ground, 0xffffff, 0.1), 0.1);
    groundBand.fillRoundedRect(16, 302, 768, 24, 22);
    this.backdropObjects.push(groundBand);
  }

  addCombatShadow(x, y, width, height, alpha = 0.3) {
    const shadow = this.add
      .ellipse(
        x,
        y,
        Math.max(36, width),
        Math.max(12, height),
        this.backdropTheme?.shadow ?? 0x000000,
        1,
      )
      .setDepth(1)
      .setAlpha(alpha);
    shadow._combatFxTag = "combat-shadow";
    this.combatShadows.push(shadow);
    return shadow;
  }

  drawEnemies(gs) {
    const enemies = gs.enemies;
    const enemyLayout = buildEnemyBattleLayout(
      enemies,
      {
        height: this.hudLayout.mode === "mobile" ? 500 : 320,
        compact: this.hudLayout.mode === "mobile",
        groundBottom:
          this.hudLayout.battlefield.y + this.hudLayout.battlefield.height - 10,
      },
      this.battlePresentation.formation,
    );
    this.enemyNumbers = [];

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const placement = enemyLayout[i];
      const x = placement.x;
      const y = placement.y;
      const sz = placement.spriteSize;

      const key = monsterSpriteKey(e);
      let sprite;
      if (key && this.textures.exists(key)) {
        sprite = this.add.image(x, y, key);
        sprite.setScale(sz / Math.max(sprite.width, sprite.height));
      } else {
        sprite = this.add.rectangle(
          x,
          y,
          sz,
          sz,
          ENEMY_COLORS[e.name] || 0xff5722,
        );
      }
      sprite.battleShadow = this.addCombatShadow(
        x,
        y + sprite.displayHeight / 2 - 4,
        sprite.displayWidth * 0.75,
        12,
        0.28,
      );
      sprite.setDepth(3);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => {
        if (
          shouldAcceptEnemySpriteClick(
            this.targetingMode,
            this.pendingSpellEffect,
            e.is_undead,
          )
        ) {
          this.onEnemyClick(e.id);
        }
      });
      sprite.on("pointerover", () => {
        sprite.setAlpha(0.7);
        if (
          this.pendingAction &&
          shouldAcceptEnemySpriteClick(
            this.targetingMode,
            this.pendingSpellEffect,
            e.is_undead,
          )
        ) {
          this.promptText.setText(
            [`Target: ${e.name}`, e.intent?.label].filter(Boolean).join("\n"),
          );
        }
      });
      sprite.on("pointerout", () => {
        if (!this.enemySprites[e.id]?.dying) sprite.setAlpha(1);
      });
      this.enemySprites[e.id] = {
        sprite,
        x,
        y,
        name: e.name,
        id: e.id,
        // Keep presentation-time HP authoritative without drawing another
        // meter over the battlefield. Combat animation code consumes this
        // state while the dedicated party panel owns all visible meters.
        hpBar: {
          currentHP: Math.max(0, e.hp | 0),
          maxHP: Math.max(0, e.max_hp | 0),
        },
      };

      const nameText = this.add
        .text(x, placement.nameY, e.name, {
          fontSize: `${Math.max(11, parseInt(portraitFontSize(this, 12)))}px`,
          wordWrap: { width: placement.lane.width - 14 },
          align: "center",
          color: "#ffffff",
          stroke: "#101820",
          strokeThickness: 3,
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      nameText.setDepth(10);
      this.enemySprites[e.id].nameText = nameText;

      // Number indicator for keyboard targeting
      const numText = this.add
        .text(x, placement.numberY, `${i + 1}`, {
          fontSize: "10px",
          color: "#ffff44",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(10)
        .setAlpha(0.3);
      this.enemyNumbers.push({ text: numText, enemyId: e.id });

      // Status effect icon
      if (e.status && STATUS_ICONS[e.status]) {
        const iconKey = STATUS_ICONS[e.status];
        if (this.textures.exists(iconKey)) {
          const icon = this.add
            .image(x + sz / 2 + 2, y - sz / 2 - 2, iconKey)
            .setDepth(10);
          icon.setScale(16 / Math.max(icon.width, icon.height));
          this.enemySprites[e.id].statusIcon = icon;
        }
      }
    }
  }

  drawParty(gs) {
    const compact = this.hudLayout.mode === "mobile";
    const layout = buildPartyBattleLayout(gs.party, { compact });
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const placement = layout[i];
      const alive = p.hp > 0;

      const fallbackKey = CLASS_SPRITES[p.sprite_id || p.class_id];
      const classId = p.sprite_id || p.class_id || fallbackKey;
      const composition = p.composition || {
        base_sprite: fallbackKey || "",
      };
      const sprite = createBattleCharacterSprite(
        this,
        placement.spriteX,
        placement.spriteY,
        composition,
        {
          alive,
          targetSize: 108,
          fallbackKey,
        },
      );
      sprite.battleShadow = this.addCombatShadow(
        placement.spriteX,
        placement.spriteY,
        62,
        16,
        placement.row === "front" ? 0.32 : 0.24,
      );
      sprite.setDepth(4);
      this.partySprites[p.name] = {
        sprite,
        x: placement.spriteX,
        y: placement.spriteY,
        name: p.name,
        alive,
        slot: i,
        row: placement.row,
        classId,
        baseTextureKey: fallbackKey,
      };

      if (alive) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => {
          if (this.targetingMode === "party") {
            this.onPartyClick(i);
          }
        });
      }
    }
  }

  drawPartyStatus(gs) {
    this.partyStatus?.destroy();
    this.partyStatus = drawBattlePartyStatus(
      this,
      this.hudLayout.party,
      gs.party,
      { compact: this.hudLayout.mode === "mobile" },
    );
    this.partyStatus.rows.forEach((row, slot) => {
      const member = gs.party[slot];
      const entry = this.partySprites[member.name];
      if (!entry) return;
      entry.hpBar = row.hpBar;
      entry.mpBar = row.mpBar;
      entry.statusRowBounds = row.bounds;
    });
  }

  drawLog(gs) {
    this.add.rectangle(400, 430, 780, 55, 0x000000, 0.78);
    const log = gs.combat_log || [];
    for (let i = 0; i < Math.min(log.length, 3); i++) {
      this.add.text(20, 440 - i * 16, log[log.length - 1 - i], {
        fontSize: "10px",
        color: "#cccccc",
        fontFamily: "Arial, sans-serif",
        wordWrap: { width: 760 },
      });
    }
  }

  createLowHpVignette() {
    if (this.lowHpVignette) {
      this.lowHpVignette.destroy();
    }
    const g = this.add.graphics().setDepth(18).setAlpha(0);
    g.fillStyle(0x660000, 0.12);
    g.fillRect(0, 0, 800, 600);
    g.lineStyle(56, 0xaa0000, 0.22);
    g.strokeRect(0, 0, 800, 600);
    g.lineStyle(24, 0xff4444, 0.2);
    g.strokeRect(20, 20, 760, 560);
    this.lowHpVignette = g;
  }

  scaledMs(ms) {
    return Math.max(0, ms * battleSpeedMul());
  }

  setSpritePosition(sprite, x, y) {
    if (!sprite) return;
    if (typeof sprite.setPosition === "function") {
      sprite.setPosition(x, y);
      return;
    }
    sprite.x = x;
    sprite.y = y;
  }

  resolveVisualEntry(entry) {
    if (!entry) return null;
    const sprite = entry.sprite || entry;
    const x = sprite.x ?? entry.x;
    const feetY = sprite.y ?? entry.y;
    const y = feetY - (sprite.feetAnchored ? sprite.displayHeight / 2 : 0);
    if (typeof x !== "number" || typeof y !== "number") return null;

    return {
      sprite,
      x,
      y,
      feetY: sprite.feetAnchored
        ? feetY
        : feetY + (sprite.displayHeight || 56) / 2,
      width: Math.max(
        42,
        Math.round((sprite.displayWidth || sprite.width || 56) * 0.72),
      ),
      height: Math.max(
        42,
        Math.round((sprite.displayHeight || sprite.height || 56) * 0.72),
      ),
    };
  }

  findEnemySpriteForAction(action, fallbackName = "") {
    if (action?.actor_id != null && this.enemySprites[action.actor_id]) {
      const entry = this.enemySprites[action.actor_id];
      if (entry?.dead || entry?.dying) {
        return null;
      }
      return entry;
    }
    if (!fallbackName) return null;
    return (
      Object.values(this.enemySprites).find(
        (entry) =>
          entry && !entry.dead && !entry.dying && entry.name === fallbackName,
      ) || null
    );
  }

  isDefeatedEnemyActor(action) {
    if (action?.actor_id == null) {
      return false;
    }
    const entry = this.enemySprites[action.actor_id];
    return !!(entry && (entry.dead || entry.dying));
  }

  findPartySpriteForTarget(targetName, targetId, fallbackName = "") {
    if (targetName && this.partySprites[targetName]) {
      return this.partySprites[targetName];
    }
    if (fallbackName && this.partySprites[fallbackName]) {
      return this.partySprites[fallbackName];
    }
    if (
      typeof targetId === "number" &&
      Array.isArray(this.gameState?.party) &&
      this.gameState.party[targetId]
    ) {
      return this.partySprites[this.gameState.party[targetId].name] || null;
    }
    return null;
  }

  spawnActionReticle(entry, color, duration = 320) {
    const visual = this.resolveVisualEntry(entry);
    if (!visual) return null;

    const g = this.add.graphics().setDepth(14);
    g._combatFxTag = "reticle";
    const { x, y, width, height } = visual;
    const halfW = width / 2;
    const halfH = height / 2;
    const corner = Math.max(10, Math.min(width, height) * 0.28);

    g.lineStyle(2, color, 0.95);
    g.lineBetween(x - halfW, y - halfH, x - halfW + corner, y - halfH);
    g.lineBetween(x - halfW, y - halfH, x - halfW, y - halfH + corner);
    g.lineBetween(x + halfW, y - halfH, x + halfW - corner, y - halfH);
    g.lineBetween(x + halfW, y - halfH, x + halfW, y - halfH + corner);
    g.lineBetween(x - halfW, y + halfH, x - halfW + corner, y + halfH);
    g.lineBetween(x - halfW, y + halfH, x - halfW, y + halfH - corner);
    g.lineBetween(x + halfW, y + halfH, x + halfW - corner, y + halfH);
    g.lineBetween(x + halfW, y + halfH, x + halfW, y + halfH - corner);

    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0.25 },
      duration: this.scaledMs(duration / 2),
      yoyo: true,
      repeat: 1,
      onComplete: () => g.destroy(),
    });
    return g;
  }

  spawnActionTracer(fromEntry, toEntry, color, duration = 320) {
    const from = this.resolveVisualEntry(fromEntry);
    const to = this.resolveVisualEntry(toEntry);
    if (!from || !to) return null;

    const g = this.add.graphics().setDepth(6);
    g._combatFxTag = "tracer";
    g.lineStyle(3, color, 0.9);
    g.lineBetween(from.x, from.y, to.x, to.y);

    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = 14;
    const wing = Math.PI / 7;
    g.lineStyle(2, color, 0.9);
    g.lineBetween(
      to.x,
      to.y,
      to.x - Math.cos(angle - wing) * head,
      to.y - Math.sin(angle - wing) * head,
    );
    g.lineBetween(
      to.x,
      to.y,
      to.x - Math.cos(angle + wing) * head,
      to.y - Math.sin(angle + wing) * head,
    );

    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: this.scaledMs(duration),
      ease: "Quad.Out",
      onComplete: () => g.destroy(),
    });
    return g;
  }

  showActionFocus(
    actorEntry,
    targetEntry,
    { tracerColor, actorColor, targetColor, duration = 320 } = {},
  ) {
    if (actorEntry) {
      this.spawnActionReticle(
        actorEntry,
        actorColor || ACTION_RETICLE_COLORS.actor,
        duration,
      );
    }
    if (targetEntry) {
      this.spawnActionReticle(
        targetEntry,
        targetColor || tracerColor || ACTION_RETICLE_COLORS.enemyTarget,
        duration,
      );
    }
    if (actorEntry && targetEntry && tracerColor) {
      this.spawnActionTracer(actorEntry, targetEntry, tracerColor, duration);
    }
  }

  spawnPartyImpactBurst(x, y, color = 0xff6633, duration = 200) {
    const g = this.add.graphics().setDepth(21);
    g._combatFxTag = "burst";
    g.lineStyle(2, color, 1);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const inner = 7;
      const outer = 22;
      g.lineBetween(
        x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner,
        x + Math.cos(angle) * outer,
        y + Math.sin(angle) * outer,
      );
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: this.scaledMs(duration),
      ease: "Quad.Out",
      onComplete: () => g.destroy(),
    });
  }

  pulseLowHpVignette() {
    if (!this.lowHpVignette) return;
    this.tweens.killTweensOf(this.lowHpVignette);
    this.lowHpVignette.setAlpha(0);
    this.tweens.add({
      targets: this.lowHpVignette,
      alpha: 1,
      duration: this.scaledMs(90),
      hold: this.scaledMs(40),
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => this.lowHpVignette?.setAlpha(0),
    });
  }

  playCombatantHitReaction(
    targetEntry,
    { newHP, maxHP, isParty = false } = {},
  ) {
    const visual = this.resolveVisualEntry(targetEntry);
    if (!visual) return;

    const { sprite, x } = visual;
    const y = sprite.y;
    const defeated = isParty && Number.isFinite(newHP) && newHP <= 0;

    this.tweens.killTweensOf(sprite);
    this.setSpritePosition(sprite, x, y);

    if (defeated) {
      targetEntry.alive = false;
      sprite.disableInteractive?.();
      sprite.clearTint?.();
      if (sprite.playBattleKO) {
        void sprite
          .playBattleKO({
            reducedMotion: this.reducedBattleMotion(),
            speedMultiplier: battleSpeedMul(),
          })
          .then(() => sprite.setTint?.(0x555b66));
      } else {
        sprite.setTint?.(0x555b66);
        sprite.setAngle?.(90);
        sprite.setAlpha?.(0.68);
      }
      return;
    }

    void sprite?.playBattleHitReaction?.({
      reducedMotion: this.reducedBattleMotion(),
      speedMultiplier: battleSpeedMul(),
    });

    if (sprite?.setTint) {
      sprite.setTint(0xff0000);
      this.scaledDelay(120, () => sprite.setTint?.(0xff8888));
      this.scaledDelay(320, () => sprite.clearTint?.());
    }

    this.tweens.add({
      targets: sprite,
      x: x + 3,
      duration: this.scaledMs(40),
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
      onStart: () => this.setSpritePosition(sprite, x - 3, y),
      onComplete: () => this.setSpritePosition(sprite, x, y),
    });

    if (!this.reducedBattleMotion()) {
      this.cameras.main.shake(this.scaledMs(150), 0.003);
    }
    if (isParty && isLowHpDanger(newHP, maxHP)) {
      this.pulseLowHpVignette();
    }
  }

  async playPartyVictoryBeat() {
    const animations = Object.values(this.partySprites || {})
      .filter(
        (entry) => entry?.alive !== false && entry?.sprite?.playBattleVictory,
      )
      .map((entry) =>
        entry.sprite.playBattleVictory({
          reducedMotion: this.reducedBattleMotion(),
          speedMultiplier: battleSpeedMul(),
        }),
      );
    if (animations.length === 0) return false;
    await Promise.all(animations);
    return true;
  }

  playPartyHitReaction(targetEntry, { newHP, maxHP } = {}) {
    this.playCombatantHitReaction(targetEntry, {
      newHP,
      maxHP,
      isParty: true,
    });
  }

  playEnemyHitReaction(targetEntry, { newHP, maxHP } = {}) {
    this.playCombatantHitReaction(targetEntry, {
      newHP,
      maxHP,
      isParty: false,
    });
  }

  showActorCursor(entry) {
    const visual = this.resolveVisualEntry(entry);
    if (!visual || !this.actorCursor) return;
    this.actorCursor.showFor(visual, {
      tint: CURSOR_TINTS.actor,
      label: "ACTING",
    });
  }

  showTargetCursor(entry, mode = "enemy") {
    const visual = this.resolveVisualEntry(entry);
    if (!visual || !this.targetCursor) return;
    const isPartyTarget = mode === "party";
    this.targetCursor.showFor(
      {
        ...visual,
        nameTop: entry.nameText?.visible
          ? entry.nameText.getBounds().top
          : undefined,
      },
      {
        tint: isPartyTarget ? CURSOR_TINTS.ally : CURSOR_TINTS.enemy,
        label: isPartyTarget ? "ALLY TARGET" : "TARGET",
      },
    );
  }

  showGroupTargetCursor(entries, mode = "enemy") {
    const visuals = (entries || [])
      .map((entry) => this.resolveVisualEntry(entry))
      .filter(Boolean);
    if (visuals.length === 0) return;

    if (!this.groupTargetCursor) {
      const graphics = this.add.graphics().setDepth(15);
      graphics._combatFxTag = "group-target-cursor";
      const label = this.add
        .text(0, 0, "", {
          fontSize: "10px",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#111111",
          padding: { x: 5, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(16);
      label._combatFxTag = "group-target-cursor-label";
      this.groupTargetCursor = { graphics, label };
    }

    const left = Math.min(...visuals.map((v) => v.x - v.width / 2)) - 12;
    const right = Math.max(...visuals.map((v) => v.x + v.width / 2)) + 12;
    const top = Math.min(...visuals.map((v) => v.y - v.height / 2)) - 14;
    const bottom = Math.max(...visuals.map((v) => v.y + v.height / 2)) + 12;
    const color = mode === "party" ? CURSOR_TINTS.ally : CURSOR_TINTS.enemy;
    const labelText = mode === "party" ? "ALL ALLIES" : "ALL ENEMIES";
    const { graphics, label } = this.groupTargetCursor;
    this.tweens.killTweensOf([graphics, label]);
    graphics.clear().setVisible(true).setAlpha(1);
    graphics.lineStyle(3, color, 1);
    graphics.strokeRoundedRect(left, top, right - left, bottom - top, 12);
    graphics.lineStyle(1, 0xffffff, 0.5);
    graphics.strokeRoundedRect(
      left + 5,
      top + 5,
      right - left - 10,
      bottom - top - 10,
      9,
    );
    const crowdedEnemyGroup = mode === "enemy" && visuals.length > 3;
    label
      .setText(labelText)
      .setFontSize(
        crowdedEnemyGroup
          ? Math.max(10, parseInt(portraitFontSize(this, 12)))
          : 10,
      );
    const labelBottom = crowdedEnemyGroup
      ? Math.min(
          this.hudLayout.battlefield.y + this.hudLayout.battlefield.height - 6,
          bottom + label.height + 8,
        )
      : top - 4;
    label
      .setColor(`#${color.toString(16).padStart(6, "0")}`)
      .setPosition((left + right) / 2, labelBottom)
      .setVisible(true)
      .setAlpha(1);
    this.tweens.add({
      targets: [graphics, label],
      alpha: { from: 1, to: 0.68 },
      duration: 470,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  hideGroupTargetCursor() {
    if (!this.groupTargetCursor) return;
    this.tweens.killTweensOf([
      this.groupTargetCursor.graphics,
      this.groupTargetCursor.label,
    ]);
    this.groupTargetCursor.graphics.setVisible(false);
    this.groupTargetCursor.label.setVisible(false);
  }

  destroyGroupTargetCursor() {
    if (!this.groupTargetCursor) return;
    this.hideGroupTargetCursor();
    this.groupTargetCursor.graphics.destroy();
    this.groupTargetCursor.label.destroy();
    this.groupTargetCursor = null;
  }

  hideAllCursors() {
    this.actorCursor?.hide();
    this.targetCursor?.hide();
    this.hideGroupTargetCursor();
  }

  actionTitleFor(action, line) {
    if (action?.action_name) return action.action_name;
    if (action?.spell_name) return action.spell_name;
    if (action?.kind === "counter") return "COUNTER";
    if (action?.kind === "attack") {
      return "ATTACK";
    }
    if (action?.kind === "ability") {
      const match = line?.match(/\b(?:uses|used) (.+?)(?: on| for|!|$)/i);
      return match?.[1] || "ABILITY";
    }
    return "";
  }

  showActionTitle(anchorEntry, label, color = "#ffffff") {
    const title = String(label || "")
      .trim()
      .toUpperCase();
    if (!title) return Promise.resolve();

    const anchor = this.resolveVisualEntry(anchorEntry) || {
      x: 400,
      y: 250,
      height: 56,
    };
    const actorName = String(anchorEntry?.name || "")
      .trim()
      .toUpperCase();
    const width = Math.max(
      112,
      title.length * 11 + 30,
      actorName.length * 8 + 30,
    );
    const panelY = Math.max(48, anchor.y - anchor.height / 2 - 42);
    const bg = this.add
      .rectangle(anchor.x, panelY, width, 42, 0x151e2b, 0.94)
      .setDepth(23)
      .setStrokeStyle(2, 0x2f3444)
      .setAlpha(0);
    bg._combatFxTag = "title-card";
    const accent = this.add
      .rectangle(anchor.x - width / 2 + 10, panelY, 6, 32, 0xffffff, 1)
      .setDepth(24)
      .setAlpha(0);
    const actorText = this.add
      .text(anchor.x, panelY - 10, actorName, {
        fontSize: "9px",
        color: "#d6deef",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(24)
      .setAlpha(0);
    actorText._combatFxTag = "title-actor";
    const actionText = this.add
      .text(anchor.x, panelY + 8, title, {
        fontSize: "15px",
        color,
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(24)
      .setAlpha(0);
    actionText._combatFxTag = "title-action";

    this.tweens.add({
      targets: [bg, accent, actorText, actionText],
      alpha: 1,
      duration: this.scaledMs(120),
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: [bg, accent, actorText, actionText],
      y: "-=4",
      duration: this.scaledMs(120),
      ease: "Back.easeOut",
    });
    this.scaledDelay(ACTION_BEAT_MS.titleDisplay, () => {
      this.tweens.add({
        targets: [bg, accent, actorText, actionText],
        alpha: 0,
        y: "-=8",
        duration: this.scaledMs(180),
        ease: "Quad.In",
        onComplete: () => {
          bg.destroy();
          accent.destroy();
          actorText.destroy();
          actionText.destroy();
        },
      });
    });
    return this.wait(ACTION_BEAT_MS.titleLead);
  }

  async lungePartySprite(actorEntry, targetEntry, { crit = false } = {}) {
    if (!actorEntry?.sprite || !targetEntry) return;
    const actor = this.resolveVisualEntry(actorEntry);
    const target = this.resolveVisualEntry(targetEntry);
    if (!actor || !target) return;
    const reducedMotion = this.reducedBattleMotion();
    const path = buildAttackMotionPath(actor, target, reducedMotion);
    this.tweens.killTweensOf(actor.sprite);
    if (actor.sprite.playBattleState) {
      const stateID = physicalAttackState(actor.sprite, crit);
      actorEntry.battleAction?.resume();
      actorEntry.battleAction = beginBattleAction(actor.sprite, stateID, {
        reducedMotion,
        speedMultiplier: battleSpeedMul(),
        holdRecovery: true,
        onFrame: ({ frame, duration, cueFrame }) => {
          if (frame === cueFrame) {
            this.setSpritePosition(actor.sprite, path.strike.x, path.strike.y);
            this.spawnMeleeSwing(actorEntry);
          }
          const dest =
            frame < cueFrame
              ? frame === 0
                ? path.approach
                : frame === 1 && !reducedMotion
                  ? path.windup
                  : path.strike
              : frame === actor.sprite.battleStates[stateID].frames.at(-1).frame
                ? { x: actorEntry.x, y: actorEntry.y }
                : null;
          if (dest)
            return this.tweenP(actor.sprite, {
              ...dest,
              duration,
              ease: "Sine.InOut",
            });
        },
      });
      await actorEntry.battleAction.cue;
      return;
    }
    await this.tweenP(actor.sprite, {
      x: path.strike.x,
      y:
        path.strike.y -
        (actor.sprite.feetAnchored ? 0 : actor.sprite.displayHeight / 2),
      duration: reducedMotion ? 110 : 240,
      ease: "Sine.InOut",
    });
  }

  reducedBattleMotion() {
    return this._forceReducedMotion ?? prefersReducedBattleMotion();
  }

  spawnMeleeSwing(actorEntry) {
    if (this.reducedBattleMotion()) return;
    const sprite = actorEntry.sprite;
    const layer = sprite.battleAttachmentLayers?.find(
      (entry) => entry.channel === "weapon",
    );
    const weapon = layer && (layer.front.visible ? layer.front : layer.back);
    if (!weapon) return;
    const arc = this.add.graphics().setPosition(weapon.x, weapon.y);
    arc._combatFxTag = "melee-swing";
    arc.lineStyle(5, 0xf4e4b0, 0.75);
    arc.beginPath();
    arc.arc(0, 0, weapon.height * 0.42, Math.PI * 0.65, Math.PI * 1.35);
    arc.strokePath();
    sprite.add(arc);
    this.tweens.add({
      targets: arc,
      alpha: 0,
      angle: 18,
      duration: this.scaledMs(140),
      onComplete: () => arc.destroy(),
    });
  }

  majorCinematicsSeen() {
    return [...(this._seenMajorCinematics || [])];
  }

  shouldPlayMajorAction(action) {
    const key = cinematicActionKey(action);
    return shouldPlayMajorCinematic({
      tier: action?.cinematic_tier,
      mode: getLongCinematicMode(),
      alreadySeen: this._seenMajorCinematics?.has(key) || false,
      reducedMotion: this.reducedBattleMotion(),
    });
  }

  requestCinematicSkip() {
    const session = this.activeMajorCinematic;
    if (!session || session.finished || session.skipped) return false;
    session.skipped = true;
    for (const settle of [...session.skipWaiters]) settle(true);
    return true;
  }

  waitForMajorCinematic(ms, session) {
    if (!session || session.skipped) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (skipped) => {
        if (settled) return;
        settled = true;
        session.skipWaiters.delete(finish);
        timer?.remove?.(false);
        resolve(skipped);
      };
      const timer = this.scaledDelay(ms, () => finish(false));
      session.skipWaiters.add(finish);
    });
  }

  finishMajorCinematic(force = false) {
    const session = this.activeMajorCinematic;
    if (!session || session.finished) return;
    if (force && !session.skipped) {
      session.skipped = true;
      for (const settle of [...session.skipWaiters]) settle(true);
    }
    session.finished = true;
    for (const target of session.fx) {
      this.tweens.killTweensOf(target);
      target?.destroy?.();
    }
    session.skipButton?.destroy?.();
    session.actorSprite?.clearTint?.();
    this.activeMajorCinematic = null;
  }

  async playMajorCinematicPrelude(action, actorEntry, element = "none") {
    const key = cinematicActionKey(action);
    if (!this.shouldPlayMajorAction(action)) {
      const result = { key, played: false, skipped: false };
      this.lastMajorCinematicResult = result;
      return result;
    }

    this._seenMajorCinematics.add(key);
    const actor = this.resolveVisualEntry(actorEntry) || {
      x: 400,
      y: 260,
      width: 60,
      height: 60,
      sprite: null,
    };
    const style = battleElementStyle(element);
    const dimmer = this.add
      .rectangle(400, 300, 800, 600, 0x151e2b, 0.5)
      .setDepth(12)
      .setAlpha(0);
    dimmer._combatFxTag = "major-cinematic";
    const aura = this.add.graphics().setDepth(15).setAlpha(0).setScale(0.45);
    aura._combatFxTag = "major-aura";
    aura.setPosition(actor.x, actor.y);
    aura.lineStyle(5, style.core, 0.95);
    aura.strokeCircle(0, 0, Math.max(38, actor.width * 0.62));
    aura.lineStyle(2, style.accent, 0.9);
    aura.strokeCircle(0, 0, Math.max(54, actor.width * 0.86));
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      aura.lineBetween(
        Math.cos(angle) * 44,
        Math.sin(angle) * 44,
        Math.cos(angle) * 72,
        Math.sin(angle) * 72,
      );
    }
    const majorLabel = this.add
      .text(400, 72, "MAJOR TECHNIQUE", {
        fontSize: "13px",
        color: `#${style.accent.toString(16).padStart(6, "0")}`,
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setAlpha(0);
    majorLabel._combatFxTag = "major-label";

    const session = {
      key,
      skipped: false,
      finished: false,
      skipWaiters: new Set(),
      fx: [dimmer, aura, majorLabel],
      actorSprite: actor.sprite,
      skipButton: null,
    };
    this.activeMajorCinematic = session;
    const compactViewport =
      Number.isFinite(globalThis.innerWidth) && globalThis.innerWidth <= 480;
    const skipButton = drawButton(
      this,
      compactViewport ? 650 : 690,
      compactViewport ? 64 : 38,
      compactViewport ? 260 : 188,
      compactViewport ? 96 : 36,
      compactViewport ? "SKIP CINEMATIC" : "SKIP  [SPACE]",
      () => this.requestCinematicSkip(),
      {
        depth: 80,
        fontSize: compactViewport ? "20px" : "12px",
        fill: 0x151e2b,
        stroke: 0xf8d477,
        textColor: "#fff2bd",
      },
    );
    skipButton.bg._combatFxTag = "cinematic-skip";
    skipButton.label._combatFxTag = "cinematic-skip-label";
    session.skipButton = skipButton;

    actor.sprite?.setTint?.(style.core);
    this.tweens.add({
      targets: dimmer,
      alpha: 0.5,
      duration: this.scaledMs(180),
    });
    this.tweens.add({
      targets: [aura, majorLabel],
      alpha: 1,
      duration: this.scaledMs(220),
      ease: "Quad.Out",
    });
    this.tweens.add({
      targets: aura,
      scaleX: 1.25,
      scaleY: 1.25,
      angle: 135,
      duration: this.scaledMs(ACTION_BEAT_MS.majorPrelude),
      ease: "Sine.InOut",
    });

    const skipped = await this.waitForMajorCinematic(
      ACTION_BEAT_MS.majorPrelude,
      session,
    );
    const result = { key, played: true, skipped: !!skipped };
    this.lastMajorCinematicResult = result;
    this.finishMajorCinematic();
    return result;
  }

  spawnCastAura(actorEntry, element = "none") {
    const actor = this.resolveVisualEntry(actorEntry);
    if (!actor) return null;
    const style = battleElementStyle(element);
    const reducedMotion = this.reducedBattleMotion();
    const aura = this.add
      .graphics()
      .setDepth((actor.sprite?.depth ?? 4) - 1)
      .setAlpha(0)
      .setScale(reducedMotion ? 1 : 0.65);
    aura._combatFxTag = "cast-aura";
    aura.setPosition(actor.x, actor.feetY);
    aura.lineStyle(3, style.core, 0.95);
    aura.strokeEllipse(0, 0, actor.width * 1.05, 24);
    aura.lineStyle(2, style.accent, 0.75);
    aura.strokeEllipse(0, 0, actor.width * 0.72, 15);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      aura.lineBetween(
        Math.cos(angle) * 25,
        Math.sin(angle) * 8,
        Math.cos(angle) * 34,
        Math.sin(angle) * 12,
      );
    }

    this.tweens.add({
      targets: aura,
      alpha: 0.95,
      scaleX: 1,
      scaleY: 1,
      angle: reducedMotion ? 0 : 45,
      duration: this.scaledMs(reducedMotion ? 90 : 160),
      ease: "Back.Out",
    });
    this.scaledDelay(520, () => {
      if (!aura.active) return;
      this.tweens.add({
        targets: aura,
        alpha: 0,
        scaleX: reducedMotion ? 1 : 1.25,
        scaleY: reducedMotion ? 1 : 1.25,
        angle: reducedMotion ? 0 : 120,
        duration: this.scaledMs(reducedMotion ? 100 : 180),
        onComplete: () => aura.destroy(),
      });
    });
    return aura;
  }

  async playCastAnticipation(actorEntry, element = "none") {
    const actor = this.resolveVisualEntry(actorEntry);
    if (!actor) return;
    actor.sprite.battleCastSource = null;
    const reducedMotion = this.reducedBattleMotion();
    this.spawnCastAura(actorEntry, element);
    if (actor.sprite.playBattleState) {
      actorEntry.battleAction?.resume();
      actorEntry.battleAction = beginBattleAction(
        actor.sprite,
        "cast_class_ability",
        {
          reducedMotion,
          speedMultiplier: battleSpeedMul(),
          holdRecovery: true,
        },
      );
      await actorEntry.battleAction.cue;
      actor.sprite.battleCastSource = battleCastOrigin(
        this.resolveVisualEntry(actorEntry),
      );
    } else {
      await this.wait(reducedMotion ? 80 : ACTION_BEAT_MS.spellCharge);
    }
  }

  spawnSpellImpact(targetEntry, element = "none") {
    const target = this.resolveVisualEntry(targetEntry);
    if (!target) return null;
    const style = battleElementStyle(element);
    const reducedMotion = this.reducedBattleMotion();
    const impact = this.add
      .graphics()
      .setDepth(21)
      .setScale(reducedMotion ? 1 : 0.35);
    impact._combatFxTag = "spell-impact";
    impact.setPosition(target.x, target.y);
    impact.fillStyle(style.glow, 0.22);
    impact.fillCircle(0, 0, Math.max(28, target.width * 0.5));
    impact.lineStyle(4, style.core, 1);
    impact.strokeCircle(0, 0, Math.max(20, target.width * 0.38));
    impact.lineStyle(2, style.accent, 0.95);
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      impact.lineBetween(
        Math.cos(angle) * 16,
        Math.sin(angle) * 16,
        Math.cos(angle) * 42,
        Math.sin(angle) * 42,
      );
    }
    this.tweens.add({
      targets: impact,
      alpha: 0,
      scaleX: reducedMotion ? 1 : 1.45,
      scaleY: reducedMotion ? 1 : 1.45,
      angle: reducedMotion ? 0 : 35,
      duration: this.scaledMs(reducedMotion ? 140 : 300),
      ease: "Quad.Out",
      onComplete: () => impact.destroy(),
    });
    return impact;
  }

  continueCastMotion(actorEntry) {
    const actor = actorEntry?.battleAction
      ? actorEntry
      : [
          ...Object.values(this.partySprites),
          ...Object.values(this.enemySprites),
        ].find((entry) => entry.sprite === actorEntry?.sprite);
    actor?.battleAction?.followThrough();
  }

  spawnAbilityCue(actorEntry, targetEntry, color) {
    const point = this.resolveVisualEntry(targetEntry || actorEntry);
    if (!point) return;
    const cue = this.add.graphics().setPosition(point.x, point.y).setDepth(20);
    cue._combatFxTag = "ability-cue";
    cue.lineStyle(2, color, 0.9);
    cue.strokePoints(
      [
        { x: 0, y: -10 },
        { x: 8, y: 0 },
        { x: 0, y: 10 },
        { x: -8, y: 0 },
      ],
      true,
    );
    this.tweens.add({
      targets: cue,
      alpha: 0,
      duration: this.scaledMs(180),
      onComplete: () => cue.destroy(),
    });
  }

  async playUtilityAbility(actorEntry, action) {
    if (!actorEntry?.sprite) return;
    const presentation = abilityDefinitions.find(
      (ability) => ability.id === action.action_id,
    )?.choreography;
    const stateID = presentation?.state || "cast_class_ability";
    const sprite = actorEntry.sprite;
    const state = sprite.battleStates?.[stateID];
    if (!state) {
      // Monsters have their own sprite pipeline; still show resolved preparation.
      if (action.action_id === "focus" && this.enemySprites[action.actor_id]) {
        this.spawnAbilityCue(actorEntry, null, 0xf1d58a);
        await this.wait(ACTION_BEAT_MS.briefStatus);
      }
      return;
    }
    const target =
      presentation?.motion === "reach"
        ? this.enemySprites[action.target_id]
        : null;
    if (target) this.showActionFocus(actorEntry, target);
    const path =
      target &&
      buildAttackMotionPath(
        this.resolveVisualEntry(actorEntry),
        this.resolveVisualEntry(target),
        this.reducedBattleMotion(),
      );
    const cueIndex =
      state.cue_frame == null
        ? Math.floor(state.frames.length / 2)
        : state.frames.findIndex((pose) => pose.frame === state.cue_frame);
    await sprite.playBattleState(stateID, {
      reducedMotion: this.reducedBattleMotion(),
      speedMultiplier: battleSpeedMul(),
      onFrame: ({ index, duration }) => {
        if (presentation?.hide_weapon)
          for (const layer of sprite.battleAttachmentLayers) {
            if (layer.channel === "weapon") {
              layer.front.setVisible(false);
              layer.back.setVisible(false);
            }
          }
        if (index === cueIndex)
          this.spawnAbilityCue(
            actorEntry,
            target,
            Number.parseInt((presentation?.color || "#f1d58a").slice(1), 16),
          );
        if (!path) return;
        if (index === cueIndex)
          this.setSpritePosition(sprite, path.strike.x, path.strike.y);
        const destination =
          index < cueIndex
            ? path.strike
            : index === state.frames.length - 1
              ? path.origin
              : null;
        if (destination)
          return this.tweenP(sprite, {
            ...destination,
            duration,
            ease: "Sine.InOut",
          });
      },
    });
    this.setSpritePosition(sprite, actorEntry.x, actorEntry.y);
  }

  launchSpellProjectile(actorEntry, targetEntry, element = "none", opts = {}) {
    const visual = this.resolveVisualEntry(actorEntry);
    const actor = visual && { ...visual, ...battleCastOrigin(visual) };
    const target = this.resolveVisualEntry(targetEntry);
    if (!actor || !target) return Promise.resolve();
    const style = battleElementStyle(element);
    actorEntry?.battleAction?.followThrough();
    const reducedMotion = this.reducedBattleMotion();
    if (reducedMotion) {
      const cue = this.add
        .circle(target.x, target.y, 12, style.core, 0.9)
        .setDepth(20);
      cue._combatFxTag = "spell-projectile";
      this.spawnSpellImpact(targetEntry, element);
      return new Promise((resolve) => {
        this.scaledDelay(90, () => {
          cue.destroy();
          resolve();
        });
      });
    }
    const projectile = this.add
      .container(actor.x, actor.y)
      .setDepth(20)
      .setScale(0.8);
    projectile._combatFxTag = "spell-projectile";
    const halo = this.add.circle(0, 0, 14, style.glow, 0.42);
    const core = this.add.circle(0, 0, 7, style.core, 1);
    core.setStrokeStyle(2, style.accent, 0.95);
    projectile.add([halo, core]);

    const duration =
      opts.duration ?? spellTravelDuration(actor, target, reducedMotion);
    let trailTick = 0;
    return new Promise((resolve) => {
      this.tweens.add({
        targets: projectile,
        x: target.x,
        y: target.y,
        scaleX: 1.2,
        scaleY: 1.2,
        angle: 180,
        duration: this.scaledMs(duration),
        ease: reducedMotion ? "Linear" : "Sine.InOut",
        onUpdate: () => {
          trailTick++;
          if (reducedMotion || trailTick % 3 !== 0) return;
          const trail = this.add
            .circle(projectile.x, projectile.y, 5, style.glow, 0.45)
            .setDepth(19);
          trail._combatFxTag = "spell-trail";
          this.tweens.add({
            targets: trail,
            alpha: 0,
            scaleX: 0.25,
            scaleY: 0.25,
            duration: this.scaledMs(150),
            onComplete: () => trail.destroy(),
          });
        },
        onComplete: () => {
          this.spawnSpellImpact(targetEntry, element);
          projectile.destroy();
          resolve();
        },
      });
    });
  }

  async resetPartySprite(actorEntry) {
    if (!actorEntry?.sprite) return;
    if (actorEntry.battleAction) {
      const action = actorEntry.battleAction;
      actorEntry.battleAction = null;
      action.resume();
      await action.finished;
    }
    await this.tweenP(actorEntry.sprite, {
      x: actorEntry.x,
      y: actorEntry.y,
      duration: ACTION_BEAT_MS.recovery,
      ease: "Power1",
    });
    actorEntry.sprite.resetBattlePose?.();
    actorEntry.sprite.battleCastSource = null;
  }

  drawActions(gs, slot) {
    if (this.actionBtns) {
      this.actionBtns.forEach((o) => o?.destroy?.());
    }
    this.actionBtns = [];

    const member = gs.party[slot];
    const btns = buildBattleActionButtons({
      member,
      gameState: gs,
      hasLastRound: !!this.lastRoundActions,
      autoMode: this.autoMode,
    });
    const bounds = this.hudLayout.command;
    const compact = this.hudLayout.mode === "mobile";
    const portraitX = bounds.x + (compact ? 64 : 36);
    const portraitY = bounds.y + (compact ? 90 : 52);
    const portraitFrameSize = compact ? 100 : 54;
    const portraitSize = portraitFrameSize - 8;
    const buttonColumns = compact ? 3 : 2;
    const buttonGapX = compact ? 16 : 6;
    const denseCommands = btns.length > 8;
    const buttonGapY = compact ? 12 : denseCommands ? 3 : 6;
    const buttonAreaX = bounds.x + (compact ? 130 : 76);
    const buttonAreaWidth = bounds.width - (compact ? 146 : 84);
    const buttonWidth =
      (buttonAreaWidth - buttonGapX * (buttonColumns - 1)) / buttonColumns;
    const buttonHeight = compact ? 96 : denseCommands ? 21 : 25;
    const buttonStartY = bounds.y + (compact ? 100 : 39);
    const frame = drawPanel(
      this,
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width,
      bounds.height,
      {
        variant: "ff6",
        radius: 8,
        innerInset: 5,
        outerFill: 0x384859,
        innerTop: 0x1c2736,
        innerBottom: 0x151e2b,
        outerStroke: 0xbfdcff,
        innerStroke: 0x6ea8ff,
        depth: 16,
      },
    );
    frame.bg._combatFxTag = "action-panel";
    this.actionBtns.push(frame.bg);

    const portraitFrame = roundedRectangle(
      this,
      portraitX,
      portraitY,
      portraitFrameSize,
      portraitFrameSize,
      0x1c2736,
      1,
    )
      .setStrokeStyle(2, 0x88ccff)
      .setDepth(17);
    portraitFrame._combatFxTag = "active-portrait-frame";
    this.actionBtns.push(portraitFrame);

    const portraitKey = resolvePortraitTextureKey(this, member);
    if (portraitKey) {
      const portrait = this.add
        .image(portraitX, portraitY, portraitKey)
        .setDepth(18);
      portrait._combatFxTag = "active-portrait";
      const srcSize = Math.max(portrait.width || 64, portrait.height || 64);
      portrait.setScale(portraitSize / srcSize);
      this.actionBtns.push(portrait);
    } else {
      const fallback = this.add
        .text(portraitX, portraitY, member.name[0] || "?", {
          fontSize: "28px",
          color: "#88ccff",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(18);
      fallback._combatFxTag = "active-portrait";
      this.actionBtns.push(fallback);
    }

    this.actionBtns.push(
      this.add
        .text(portraitX, bounds.y + (compact ? 155 : 85), member.name, {
          fontSize: compact ? "24px" : "10px",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(18),
      this.add
        .text(portraitX, bounds.y + (compact ? 190 : 99), member.class_name, {
          fontSize: compact ? "20px" : "8px",
          color: "#ffcc66",
          fontFamily: "Arial, sans-serif",
        })
        .setOrigin(0.5)
        .setDepth(18),
      this.add
        .text(bounds.x + 12, bounds.y + 8, "COMMAND", {
          fontSize: compact ? "28px" : "11px",
          color: "#cfe6ff",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setDepth(18),
    );

    const commandHandles = [];
    let defaultCommandHandle = null;
    for (let i = 0; i < btns.length; i++) {
      const button = btns[i];
      const row = Math.floor(i / buttonColumns);
      const col = i % buttonColumns;
      const x =
        buttonAreaX + buttonWidth / 2 + col * (buttonWidth + buttonGapX);
      const y = buttonStartY + row * (buttonHeight + buttonGapY);
      let handle = null;
      handle = drawButton(
        this,
        x,
        y,
        buttonWidth,
        buttonHeight,
        button.label,
        () => this.handleActionButton(button, member, gs, slot),
        {
          depth: 17,
          fontSize: compact ? "28px" : "10px",
          fontFamily: "Arial, sans-serif",
          textColor: button.color,
          textColorDisabled: "#6e7d91",
          fill: 0x1c2736,
          fillHover: 0x1c2736,
          fillPress: 0x384859,
          fillActive: 0x384859,
          stroke: 0x384859,
          strokeActive: 0xffd36b,
          onFocus: () => {
            for (const commandHandle of commandHandles) {
              commandHandle.setActive(false);
            }
            handle?.setActive(true);
            this.promptText
              ?.setText(button.description || button.label)
              .setColor("#dcecff");
          },
          onBlur: () => {
            handle?.setActive(false);
            defaultCommandHandle?.setActive(true);
            this.promptText
              ?.setText(this.memberTurnPrompt(member))
              .setColor("#ffffff");
          },
        },
      );
      handle.actionType = button.type;
      commandHandles.push(handle);
      this.actionBtns.push(handle);
    }

    defaultCommandHandle =
      commandHandles.find(
        (handle) => handle.actionType === "auto" && this.autoMode,
      ) || commandHandles[0];
    defaultCommandHandle?.setActive(true);
  }

  handleActionButton(button, member, gs, slot) {
    if (
      this.animating ||
      this.pickerOverlay ||
      this.targetingMode ||
      slot !== this.livingMembers[this.currentMemberIdx]
    )
      return;
    if (button.type !== "repeat" && button.type !== "auto" && this.autoMode) {
      this.autoMode = false;
    }
    if (button.type === "attack") {
      this.pendingAction = "attack";
      this.enterTargetingMode();
      this.promptText
        .setText(`${member.name}: Select a target to attack!`)
        .setColor("#ff4444");
    } else if (button.type === "spell") {
      this.showSpellPicker(slot);
    } else if (button.type === "ability") {
      this.showAbilityPicker(slot);
    } else if (button.type === "item") {
      this.showItemPicker(slot);
    } else if (button.type === "defend") {
      this.recordAction(slot, { slot, type: "defend" });
    } else if (button.type === "smart") {
      this.executeSmartAttack();
    } else if (button.type === "flee") {
      this.doFlee();
    } else if (button.type === "repeat") {
      this.executeRepeat();
    } else if (button.type === "auto") {
      this.autoMode = !this.autoMode;
      if (this.autoMode) {
        this.executeRepeat();
      } else {
        this.drawActions(gs, slot);
      }
    }
  }

  onEnemyClick(enemyId) {
    if (this.animating) return;
    // Defensive: if we're still in party targeting mode here, the only
    // legal caller is an undead-heal sprite click (see sprite handler
    // above). Everything else would be a stale click bleed-through.
    if (this.targetingMode === "party") {
      const enemy = this.gameState.enemies.find((en) => en.id === enemyId);
      if (!(this.pendingSpellEffect === "heal" && enemy && enemy.is_undead)) {
        return;
      }
    }
    if (this.targetingMode) this.exitTargetingMode();
    const slot = this.livingMembers[this.currentMemberIdx];

    if (this.pendingAction === "attack") {
      this.pendingAction = null;
      this.recordAction(slot, { slot, type: "attack", target_id: enemyId });
    } else if (this.pendingAction === "spell") {
      this.pendingAction = null;
      const targetMode = this.pendingSpellTargetMode;
      this.pendingSpellTargetMode = null;
      this.recordAction(slot, {
        slot,
        type: "spell",
        target_id: enemyId,
        spell_id: this.pendingSpellId,
        target_mode: targetMode,
      });
    } else if (this.pendingAction === "ability") {
      this.pendingAction = null;
      this.recordAction(slot, {
        slot,
        type: "ability",
        target_id: enemyId,
        ability_id: this.pendingAbilityId,
      });
    }
  }

  onPartyClick(targetSlot) {
    if (this.animating) return;
    if (this.targetingMode) this.exitTargetingMode();
    const slot = this.livingMembers[this.currentMemberIdx];

    if (this.pendingAction === "spell") {
      this.pendingAction = null;
      const targetMode = this.pendingSpellTargetMode;
      this.pendingSpellTargetMode = null;
      this.recordAction(slot, {
        slot,
        type: "spell",
        target_id: targetSlot,
        spell_id: this.pendingSpellId,
        target_mode: targetMode,
      });
    }
  }

  recordAction(slot, action) {
    this.closePicker();
    const member = this.gameState.party[slot];
    const actionName =
      action.type === "spell"
        ? "casts spell"
        : action.type === "item"
          ? "uses potion"
          : action.type === "defend"
            ? "defends"
            : "attacks";
    this.promptText
      .setText(`${member.name} ${actionName}!`)
      .setColor("#44ff44");

    this.memberActions.push(action);
    this.currentMemberIdx++;

    // Brief pause then show next member's turn
    const nextMemberIdx = this.currentMemberIdx;
    this.scaledDelay(400, () => {
      if (!this.animating && this.currentMemberIdx === nextMemberIdx)
        this.showCurrentMemberTurn();
    });
  }

  executeSmartAttack() {
    const remainingSlots = this.livingMembers.slice(this.currentMemberIdx);
    const { actions, preview } = planSmartRound(this.gameState, remainingSlots);
    if (actions.length === 0) {
      this.showCurrentMemberTurn();
      return;
    }

    this.memberActions.push(...actions);
    if (import.meta.env?.DEV && preview.length > 0) {
      console.debug("[SmartAttack]", preview);
    }

    if (this.actionBtns) {
      this.actionBtns.forEach((o) => o.destroy());
      this.actionBtns = [];
    }

    this.promptText.setText("SMART ATTACK...").setColor("#88ffaa");
    this.currentMemberIdx = this.livingMembers.length;
    this.submitAllActions();
  }

  // Resolve all living members' previous actions through the smart fallback
  // resolver, then submit the round immediately. Used by both REPEAT and AUTO.
  executeRepeat() {
    const gs = this.gameState;
    this.memberActions = [];
    for (const slot of this.livingMembers) {
      // Find the previous action for this slot, if any
      const prev = this.lastRoundActions.find((a) => a.slot === slot);
      if (!prev) {
        // No previous action for this member — default to attack
        const target = gs.enemies.find((e) => e.hp > 0);
        if (target) {
          this.memberActions.push({
            slot,
            type: "attack",
            target_id: target.id,
          });
        }
        continue;
      }
      const resolved = resolveAction(prev, gs.party[slot], gs);
      if (resolved) {
        this.memberActions.push(resolved);
      }
    }

    if (this.memberActions.length === 0) {
      // Nothing valid to submit — cancel auto-mode and let player choose
      this.autoMode = false;
      this.showCurrentMemberTurn();
      return;
    }

    // A restarted Auto round has no manual buttons yet. Always initialize
    // the list before adding the Stop control for this round.
    if (this.actionBtns) {
      this.actionBtns.forEach((o) => o.destroy());
    }
    this.actionBtns = [];

    this.promptText
      .setText(this.autoMode ? "AUTO-BATTLE..." : "REPEAT!")
      .setColor(this.autoMode ? "#ff8844" : "#94a8bd");
    this.currentMemberIdx = this.livingMembers.length; // skip per-member UI
    this.showAutoStopControl();
    this.submitAllActions();
  }

  // Stopping only changes the next round; the submitted server round and its
  // presentation finish normally, including victory and error recovery.
  stopAutoAfterRound() {
    if (!this.autoMode) return;
    this.autoMode = false;
    this.autoStopButton?.setLabel("AUTO STOPPED");
    this.autoStopButton?.setEnabled(false);
    this.autoStopHint?.setText("Finishing this round");
  }

  showAutoStopControl() {
    if (!this.autoMode) return;
    const bounds = this.hudLayout.command;
    const mobile = this.hudLayout.mode === "mobile";
    this.autoStopButton = drawButton(
      this,
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2 - (mobile ? 24 : 12),
      bounds.width - 24,
      mobile ? 88 : 44,
      "STOP AUTO (Q)",
      () => this.stopAutoAfterRound(),
      { depth: 30, fontSize: mobile ? "25px" : "16px" },
    );
    this.autoStopHint = this.add
      .text(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2 + (mobile ? 46 : 26),
        "Stop after this round",
        {
          fontFamily: "Arial, sans-serif",
          fontSize: mobile ? "23px" : "14px",
          color: "#dcecff",
        },
      )
      .setOrigin(0.5)
      .setDepth(30);
    this.actionBtns.push(this.autoStopButton, this.autoStopHint);
  }

  enterTargetingMode() {
    this.targetingMode = "enemy";
    this.livingEnemies = this.gameState.enemies.filter((e) => e.hp > 0);
    this.selectedTargetIdx = 0;

    // Brighten number indicators
    for (const en of this.enemyNumbers) {
      const isLiving = this.livingEnemies.some((e) => e.id === en.enemyId);
      en.text.setAlpha(isLiving ? 1.0 : 0.1);
    }

    this.updateTargetHighlight();
    this.showBattleTargets("enemy");
  }

  enterPartyTargetingMode() {
    this.targetingMode = "party";
    this.livingPartyTargets = this.gameState.party
      .map((p, idx) => ({ ...p, slot: idx }))
      .filter((p) => p.hp > 0);
    // Default to the caster themselves if they're in the list.
    const casterSlot = this.livingMembers[this.currentMemberIdx];
    const casterIdx = this.livingPartyTargets.findIndex(
      (p) => p.slot === casterSlot,
    );
    this.selectedPartyIdx = casterIdx >= 0 ? casterIdx : 0;
    this.updatePartyTargetHighlight();
    this.showBattleTargets("party");
  }

  showBattleTargets(side) {
    const slot = this.livingMembers[this.currentMemberIdx];
    const actor = this.gameState.party[slot];
    const kind = this.pendingAction;
    const targets =
      side === "enemy" ? this.livingEnemies : this.livingPartyTargets;
    this.showBattleChoices(
      `${actor.name} · Choose ${side === "enemy" ? "enemy" : "ally"}`,
      targets.map((target, index) => ({
        label: target.name,
        detail:
          side === "party"
            ? `${target.hp}/${target.max_hp} HP · ${target.mp ?? 0}/${target.max_mp ?? 0} MP`
            : target.intent?.label ||
              `${kind === "spell" ? "Cast magic" : kind === "ability" ? "Use ability" : "Attack"} on ${target.name}`,
        onInspect: () => {
          if (side === "enemy") {
            this.selectedTargetIdx = index;
            this.updateTargetHighlight();
          } else {
            this.selectedPartyIdx = index;
            this.updatePartyTargetHighlight();
          }
        },
        action: () => {
          this.closePicker();
          if (side === "enemy") this.onEnemyClick(target.id);
          else this.onPartyClick(target.slot);
        },
      })),
      () => {
        this.closePicker();
        this.exitTargetingMode();
        this.pendingAction = null;
        this.pendingSpellId = null;
        this.pendingSpellEffect = null;
        this.pendingSpellTargetMode = null;
        this.pendingAbilityId = null;
        if (kind === "spell") this.showSpellPicker(slot);
        else if (kind === "ability") this.showAbilityPicker(slot);
        else
          this.promptText
            .setText(this.memberTurnPrompt(actor))
            .setColor("#ffff44");
      },
    );
  }

  exitTargetingMode() {
    this.targetingMode = false;
    this.livingEnemies = [];
    this.livingPartyTargets = [];

    // Dim enemy number indicators
    for (const en of this.enemyNumbers) {
      en.text.setAlpha(0.3);
    }

    this.targetCursor?.hide();
    this.hideGroupTargetCursor();
  }

  updateTargetHighlight() {
    if (this.targetingMode !== "enemy" || this.livingEnemies.length === 0)
      return;

    const enemy = this.livingEnemies[this.selectedTargetIdx];
    const es = this.enemySprites[enemy.id];
    if (!es) return;

    this.showTargetCursor(es, "enemy");

    // Show the position number from the full enemy list (matches displayed number)
    const fullIdx = this.gameState.enemies.findIndex((e) => e.id === enemy.id);
    this.promptText.setText(
      [`Target: ${enemy.name} [${fullIdx + 1}]`, enemy.intent?.label]
        .filter(Boolean)
        .join("\n"),
    );
    this.promptText.setColor("#ff6666");
  }

  updatePartyTargetHighlight() {
    if (this.targetingMode !== "party" || this.livingPartyTargets.length === 0)
      return;

    const target = this.livingPartyTargets[this.selectedPartyIdx];
    const ps = this.partySprites[target.name];
    if (!ps) return;

    this.showTargetCursor(ps, "party");

    this.promptText.setText(`Target: ${target.name} [${target.slot + 1}]`);
    this.promptText.setColor("#66ff99");
  }

  beginSpellTargeting(slot, member, spell) {
    const mode = defaultSpellTargetMode(spell);
    this.pendingAction = "spell";
    this.pendingSpellId = spell.id;
    this.pendingSpellEffect = spell.effect;
    this.pendingSpellTargetMode = mode;

    if (isGroupTargetMode(mode)) {
      this.pendingAction = null;
      this.pendingSpellId = null;
      this.pendingSpellEffect = null;
      this.pendingSpellTargetMode = null;
      this.recordAction(slot, {
        slot,
        type: "spell",
        target_id: -1,
        spell_id: spell.id,
        target_mode: mode,
      });
      return;
    }
    if (targetModeSide(mode) === "party") {
      this.enterPartyTargetingMode();
      this.promptText
        .setText(`${member.name}: Cast ${spell.name} on one ally`)
        .setColor("#88ff88");
      return;
    }
    this.enterTargetingMode();
    this.promptText
      .setText(`${member.name}: Cast ${spell.name} on one enemy`)
      .setColor("#8888ff");
  }

  showBattleChoices(title, choices, onBack = () => this.closePicker()) {
    this.closePicker();
    this.pickerItems = choices.map((choice) => ({
      action: () => {
        if (!choice.disabled) choice.action();
      },
    }));
    this.pickerOverlay = [battleChoicePanel(this, { title, choices, onBack })];
  }

  showSpellPicker(slot) {
    const member = this.gameState.party[slot];
    if (!member?.spells?.length) return;
    this.showBattleChoices(
      `${member.name} · Magic · ${member.mp ?? 0} MP`,
      member.spells.map((spell) => ({
        label: `${spell.name} · ${spell.mp_cost ?? 0} MP`,
        detail: `${spell.description || "Combat magic"}${spell.castable_in_combat === false ? " · Field only" : ""}`,
        disabled:
          (member.mp ?? 0) < (spell.mp_cost ?? 0) ||
          spell.castable_in_combat === false,
        action: () => {
          this.closePicker();
          this.beginSpellTargeting(slot, member, spell);
        },
      })),
    );
  }

  showAbilityPicker(slot) {
    const gs = this.gameState;
    const member = gs.party[slot];
    const abilities = member?.abilities || [];
    if (abilities.length === 0) return;

    // Metadata for labels and whether the ability needs a target.
    const meta = {
      focus: {
        label: "Focus",
        desc: "Self: boost next attacks",
        targeted: false,
      },
      counter: {
        label: "Counter",
        desc: "Self: counter-attack when hit",
        targeted: false,
      },
      inspire: {
        label: "Inspire",
        desc: "Party: buff all allies",
        targeted: false,
      },
      backstab: {
        label: "Backstab",
        desc: "Enemy: 3x damage strike",
        targeted: true,
      },
      steal: { label: "Steal", desc: "Enemy: steal an item", targeted: true },
    };

    this.showBattleChoices(
      `${member.name} · Abilities`,
      abilities.map((id) => {
        const ability = meta[id] || { label: id, desc: "", targeted: true };
        return {
          label: ability.label,
          detail: ability.desc,
          action: () => {
            this.closePicker();
            this.pendingAbilityId = id;
            if (ability.targeted) {
              this.pendingAction = "ability";
              this.enterTargetingMode();
              this.promptText
                .setText(`${member.name}: ${ability.label} — select a target`)
                .setColor("#ff88ff");
            } else {
              this.recordAction(slot, {
                slot,
                type: "ability",
                target_id: 0,
                ability_id: id,
              });
            }
          },
        };
      }),
    );
  }

  showItemPicker(slot) {
    const member = this.gameState.party[slot];
    this.showBattleChoices(
      `${member.name} · Items`,
      buildItemList(this.gameState, "combat").map((item) => ({
        label: `${item.name} ×${item.count}`,
        detail: `${item.description} · ${itemUseContext(item, "combat")}`,
        disabled: item.greyed,
        action: () =>
          this.showBattleChoices(
            `${item.name} · Choose ally`,
            this.gameState.party.map((target, targetSlot) => ({
              label: `${target.name} · ${target.hp}/${target.max_hp} HP`,
              detail: `${item.description} · ${target.mp ?? 0}/${target.max_mp ?? 0} MP`,
              disabled: !canUseOnTarget(item, target),
              action: () => {
                this.closePicker();
                this.recordAction(slot, {
                  slot,
                  type: item.id === "phoenix_down" ? "revive" : "item",
                  target_id: targetSlot,
                  item_id: item.id,
                });
              },
            })),
            () => this.showItemPicker(slot),
          ),
      })),
    );
  }

  closePicker() {
    if (this.pickerOverlay) {
      this.pickerOverlay.forEach((o) => o.destroy());
      this.pickerOverlay = null;
    }
    this.pickerItems = [];
  }

  async doFlee() {
    this.animating = true;
    this.hideAllCursors();
    this.promptText.setText("");
    const result = await gameAction(this.gameState.id, { type: "flee" });
    this.gameState = result;
    this.scaledDelay(300, () => {
      this.animating = false;
      if (result.phase !== "combat") {
        this.returnFromBattle(result);
      } else {
        this.restartBattle({
          gameState: result,
          returnScene: this.returnScene,
          encounterTileType: this.encounterTileType,
          seenMajorCinematics: this.majorCinematicsSeen(),
        });
      }
    });
  }

  async submitAllActions() {
    this.animating = true;
    this.hideAllCursors();
    this.promptText.setText("Resolving combat...").setColor("#ffffff");

    try {
      const result = await gameAction(this.gameState.id, {
        type: "combat_round",
        actions: this.memberActions,
      });

      if (result.error) {
        console.error("[Battle] error:", result.error);
        // Issue #138: if the server returns an error mid-combat, the
        // player was previously stuck in a locked battle scene with no way
        // out. Recover by fetching the authoritative game state and
        // re-routing the scene so the player can keep playing.
        await this.recoverFromCombatError();
        return;
      }

      // Animate each line of the combat log with structured action data
      const log = result.combat_log || [];
      const actions = result.combat_actions || [];
      await this.animateCombatLog(log, actions);
      if (this.returnFromDungeonDefeat(result)) return;

      // Reconcile enemy sprites with the authoritative server state BEFORE
      // we restart the scene. The server only sends living enemies in
      // result.enemies, so any sprite whose id is missing from that list
      // has been defeated — even if no action carried `Killed: true` for
      // it (e.g. a poison-tick kill paired with a parser miss). Without
      // this pass, the sprite would linger until scene.restart fires,
      // which is exactly the "enemy with 1 HP after a fatal hit" visual
      // the user filed in issue #69.
      await this.reconcileEnemySprites(result.enemies || []);

      const finalResult = await this.resolvePendingTownChestClaim(result);
      this.gameState = finalResult;

      if (finalResult.phase !== "combat" && finalResult.phase !== "defeat") {
        await this.playPartyVictoryBeat();
      }

      // Persist this round's actions for REPEAT / AUTO from the
      // authoritative server state, not browser storage.
      const savedActions = normalizeLastRoundActions(
        finalResult.last_round_actions,
      );

      this.scaledDelay(400, () => {
        this.animating = false;
        if (this.gameState.phase !== "combat") {
          this.autoMode = false;
          this.showVictoryResults(this.gameState);
        } else {
          this.restartBattle({
            gameState: this.gameState,
            lastRoundActions: savedActions,
            autoMode: this.autoMode,
            returnScene: this.returnScene,
            encounterTileType: this.encounterTileType,
            seenMajorCinematics: this.majorCinematicsSeen(),
          });
        }
      });
    } catch (e) {
      console.error("[Battle] failed:", e);
      await this.recoverFromCombatError();
    }
  }

  // recoverFromCombatError handles the issue #138 lock-up: when the server
  // returns an error (500, empty body, network failure) the battle scene
  // used to sit with no valid actions and no way out. We refetch the
  // authoritative game state and either rehydrate combat with whatever the
  // server believes is true, or punt back to the World scene if combat is
  // already resolved.
  async recoverFromCombatError() {
    this.hideAllCursors();
    this.promptText.setText("Combat error — recovering...").setColor("#ff8844");
    try {
      const fresh = await getGame(this.gameState.id);
      if (fresh && !fresh.error) {
        this.gameState = fresh;
        this.time.delayedCall(600, () => {
          this.animating = false;
          if (fresh.phase === "combat") {
            this.restartBattle({
              gameState: fresh,
              returnScene: this.returnScene,
              encounterTileType: this.encounterTileType,
              seenMajorCinematics: this.majorCinematicsSeen(),
            });
          } else {
            this.returnFromBattle(fresh);
          }
        });
        return;
      }
    } catch (err) {
      console.error("[Battle] recovery fetch failed:", err);
    }
    // As a last resort, return to the world scene with the stale state so
    // the player isn't trapped.
    this.time.delayedCall(600, () => {
      this.animating = false;
      this.returnFromBattle(this.gameState);
    });
  }

  async resolvePendingTownChestClaim(result) {
    if (
      !this.returnScene ||
      this.returnScene.sceneKey !== "Town" ||
      result?.phase === "combat" ||
      !result?.pending_chest_claim
    ) {
      return result;
    }
    const pending = result.pending_chest_claim;
    const claimed = await claimChest(
      result.id,
      pending.node_id,
      pending.chest_id,
    );
    if (!claimed?.error) {
      if (claimed.message) {
        this.returnScene = {
          ...this.returnScene,
          entryMessage: claimed.message,
        };
      }
      return claimed;
    }
    return result;
  }

  returnFromDungeonDefeat(gs) {
    const finalDefeat =
      this.gameState?.final_encounter?.active &&
      gs?.final_encounter?.recovery === "defeat";
    const questDefeat =
      gs?.phase === "world" &&
      gs?.quests?.[gs.current_quest]?.objectives?.recovery === "defeat";
    if (
      gs?.dungeon?.recovered_from_defeat !== true &&
      !finalDefeat &&
      !questDefeat
    )
      return false;
    this.gameState = gs;
    this.autoMode = false;
    this.animating = false;
    this.returnFromBattle(gs);
    return true;
  }

  returnFromBattle(gs) {
    if (
      gs.current_location?.kind === "dungeon" &&
      !["defeat", "victory", "promotion"].includes(gs.phase)
    ) {
      this.scene.start("Dungeon", { gameState: gs });
      return;
    }
    if (this.returnScene?.sceneKey === "Town") {
      this.scene.start("Town", {
        gameState: gs,
        spawn: this.returnScene.spawn,
        floorIndex: this.returnScene.floorIndex || 0,
        playerStart: this.returnScene.playerStart || null,
        entryMessage: this.returnScene.entryMessage || "",
      });
      return;
    }
    this.scene.start("World", { gameState: gs });
  }

  async animateCombatLog(log, actions) {
    for (let i = 0; i < log.length; i++) {
      if (i > 0) await this.waitForCombatRead();
      const line = log[i];
      const action = actions[i] || {};

      // Parse attack: "Hero attacks Goblin[102] for 24 damage"
      const attackMatch = line.match(/^(.+?) attacks (.+?)\[(\d+)\] for (\d+)/);
      // Parse spell: "Mage casts Spark on Goblin[102] for 11 damage"
      const spellMatch = line.match(
        /^(.+?) casts (.+?) on (.+?)\[?(\d*)\]? for (\d+)/,
      );
      // Parse counter/backstab with damage
      const counterMatch = line.match(
        /^(.+?) (counter-attacks|backstabs) (.+?)(?:\[(\d+)\])? for (\d+)/,
      );
      const defeatMatch = line.includes("DEFEATED");

      if (
        action.kind === "attack" ||
        action.kind === "counter" ||
        counterMatch ||
        (attackMatch && action.kind !== "spell")
      ) {
        if (this.isDefeatedEnemyActor(action)) {
          continue;
        }
        const attacker =
          action.actor_name || attackMatch?.[1] || counterMatch?.[1];
        const counter =
          action.kind === "counter" || counterMatch?.[2] === "counter-attacks";
        const verb = counter ? "counters" : counterMatch?.[2] || "attacks";
        const attackerEnemy = this.findEnemySpriteForAction(action, attacker);
        const targetId =
          action.target_id ??
          (attackMatch
            ? parseInt(attackMatch[3])
            : parseInt(counterMatch?.[4]));
        const dmg =
          action.damage ??
          (attackMatch
            ? parseInt(attackMatch[4])
            : parseInt(counterMatch?.[5])) ??
          0;
        const dmgType = action.damage_type || "physical";
        const attackTitle =
          this.actionTitleFor(action, line) ||
          (counter ? "COUNTER" : counterMatch ? "BACKSTAB" : "ATTACK");
        const hits = physicalHitPresentations(action, dmg, defeatMatch);
        const attackCaption = (target) =>
          hits.length > 1
            ? `${attacker} ${counter ? "counters" : "→"} ${target || action.target_name}: strike 1/${hits.length}`
            : target
              ? `${attacker} ${verb} ${target}!`
              : `${attacker} ${verb}!`;

        const pe = this.partySprites[attacker];
        const ee = this.enemySprites[targetId];
        const pt = this.findPartySpriteForTarget(
          action.target_name,
          targetId,
          attackMatch?.[2],
        );
        if (pe && ee) {
          this.showActionFocus(pe, ee, {
            tracerColor: ACTION_TRACER_COLORS.partyToEnemy,
            targetColor: ACTION_RETICLE_COLORS.enemyTarget,
          });
          this.revealLine(attackCaption(ee.name), "#ff8844");
          await this.showActionTitle(pe, attackTitle, "#ffcc66");
          await this.playMajorCinematicPrelude(action, pe, "none");
          await this.lungePartySprite(pe, ee, { crit: hits[0].crit });
          if (!pe?.battleAction && !attackerEnemy?.battleAction)
            await this.wait(ACTION_BEAT_MS.preImpact);
        } else if (pe) {
          this.revealLine(attackCaption(), "#ff8844");
          await this.showActionTitle(pe, attackTitle, "#ffcc66");
          await this.playMajorCinematicPrelude(action, pe, "none");
          if (!pe?.battleAction && !attackerEnemy?.battleAction)
            await this.wait(ACTION_BEAT_MS.preImpact);
        } else if (attackerEnemy && pt) {
          this.showActionFocus(attackerEnemy, pt, {
            tracerColor: ACTION_TRACER_COLORS.enemyToParty,
            targetColor: ACTION_RETICLE_COLORS.partyTarget,
          });
          this.revealLine(attackCaption(pt.name), "#ff9966");
          await this.showActionTitle(attackerEnemy, attackTitle, "#ff9966");
          await this.playMajorCinematicPrelude(action, attackerEnemy, "none");
          await this.lungePartySprite(attackerEnemy, pt, {
            crit: hits[0].crit,
          });
          if (!pe?.battleAction && !attackerEnemy?.battleAction)
            await this.wait(ACTION_BEAT_MS.preImpact);
        }

        for (const [index, hit] of hits.entries()) {
          if (index > 0) {
            await this.waitForCombatRead();
            // Start the next caption with anticipation, so contact never
            // clears the message window just as its damage number appears.
            this.revealLine(
              `${attacker} ${counter ? "counters" : "→"} ${(ee || pt)?.name || action.target_name}: strike ${index + 1}/${hits.length}`,
              "#ffcc66",
            );
            await this.lungePartySprite(pe || attackerEnemy, ee || pt, {
              crit: hit.crit,
            });
          }
          if (hits.length > 1) {
            this.combatReadUntil = Math.max(
              this.combatReadUntil || 0,
              performance.now() + (hit.crit ? 1500 : 1200),
            );
          }
          playSFX("sfx_slash");
          if (ee) {
            const targetKey = `enemy_${targetId}`;
            if (!hit.missed) playSFX(hit.defeated ? "sfx_death" : "sfx_hit");
            await this.hitFx(
              ee.x,
              ee.y,
              hit.damage,
              false,
              hit.defeated,
              dmgType,
              {
                crit: hit.crit,
                guarded: action.damage_prevented > 0,
                missed: hit.missed,
                targetKey,
                entry: ee,
                replaceTarget: hits.length > 1,
              },
            );
            if (!hit.missed && ee.sprite.setTint) {
              ee.sprite.setTint(0xff4444);
              this.scaledDelay(200, () => ee.sprite.clearTint?.());
            }
            // Animate HP bar drain — integer math only, see systems/hpBar.js
            if (!hit.missed && ee.hpBar) {
              const newHP = applyDamage(ee.hpBar.currentHP, hit.damage);
              this.animateHPBar(ee.hpBar, newHP, ee.hpBar.maxHP);
              if (!hit.defeated) {
                this.playEnemyHitReaction(ee, {
                  newHP,
                  maxHP: ee.hpBar.maxHP,
                });
              }
            }
            await this.resetPartySprite(pe);
            if (hit.defeated) await this.enemyDeathFx(ee);
          } else if (pt) {
            const targetKey = `party_${action.target_name || attackMatch?.[2]}`;
            const atkName = action.actor_name || attackMatch?.[1] || attacker;
            const tgtName = action.target_name || attackMatch?.[2] || "";
            if (!attackerEnemy) {
              this.revealLine(`${atkName} attacks ${tgtName}!`, "#ff8800");
            }
            if (!hit.missed) playSFX("sfx_party_hit");
            await this.hitFx(pt.x, pt.y, hit.damage, true, false, dmgType, {
              crit: hit.crit,
              guarded: action.damage_prevented > 0,
              missed: hit.missed,
              targetKey,
              entry: pt,
              replaceTarget: hits.length > 1,
            });
            // Animate party HP bar drain — integer math only
            if (!hit.missed && pt.hpBar) {
              const newHP = applyDamage(pt.hpBar.currentHP, hit.damage);
              this.animateHPBar(pt.hpBar, newHP, pt.hpBar.maxHP);
              this.playPartyHitReaction(pt, {
                newHP,
                maxHP: pt.hpBar.maxHP,
              });
            }
            await this.resetPartySprite(attackerEnemy);
          }
        }
        if (hits.length > 1) {
          await this.waitForCombatRead();
          this.revealLine(
            `${attacker}: ${dmg} damage (${hits.length} strikes).`,
            "#ffcc66",
          );
        }
        await this.wait(ACTION_BEAT_MS.postDamage);
        await this.wait(ACTION_BEAT_MS.interAction);
      } else if (action.kind === "defend") {
        const actorEntry =
          this.partySprites[action.actor_name] ||
          this.findEnemySpriteForAction(action, action.actor_name);
        this.revealLine(line, "#88ccff");
        await this.showActionTitle(actorEntry, "DEFEND", "#88ccff");
        if (actorEntry?.sprite?.playBattleDefend) {
          await actorEntry.sprite.playBattleDefend({
            reducedMotion: this.reducedBattleMotion(),
            speedMultiplier: battleSpeedMul(),
          });
        } else if (actorEntry) {
          actorEntry.sprite?.setTint?.(0x88ccff);
          this.spawnActionReticle(actorEntry, 0x88ccff, 420);
          await this.wait(ACTION_BEAT_MS.briefStatus);
          actorEntry.sprite?.clearTint?.();
        }
        await this.wait(ACTION_BEAT_MS.interAction);
      } else if (action.kind === "spell" || spellMatch) {
        if (this.isDefeatedEnemyActor(action)) {
          continue;
        }
        const caster = action.actor_name || (spellMatch && spellMatch[1]);
        const spellName = action.spell_name || (spellMatch && spellMatch[2]);
        const targetId =
          action.target_id || (spellMatch && parseInt(spellMatch[4]));
        const dmg = action.damage ?? (spellMatch ? parseInt(spellMatch[5]) : 0);
        const element = action.element || "none";
        const dmgType = action.damage_type || "magical";

        const pe = this.partySprites[caster];
        const enemyCaster = this.findEnemySpriteForAction(action, caster);
        // Check for multi-target: group consecutive entries with same caster + spell
        const targets = [
          {
            targetId,
            targetName: action.target_name || spellMatch?.[3],
            dmg,
            missed: action.missed,
            defeated: defeatMatch,
          },
        ];
        while (i + 1 < log.length) {
          const nextAction = actions[i + 1] || {};
          if (
            nextAction.kind === "spell" &&
            nextAction.actor_name === caster &&
            nextAction.spell_name === spellName &&
            nextAction.action_id === action.action_id
          ) {
            i++;
            targets.push({
              targetId: nextAction.target_id,
              targetName: nextAction.target_name,
              dmg: nextAction.damage ?? 0,
              missed: nextAction.missed,
              defeated: log[i].includes("DEFEATED"),
            });
          } else {
            break;
          }
        }

        const actorEntry = pe || enemyCaster;
        const style = battleElementStyle(element);
        const effectPresentation = battleEffectPresentation(action);
        this.revealLine(`${caster} casts ${spellName}!`, "#88aaff");
        await this.showActionTitle(
          actorEntry,
          spellName,
          `#${style.core.toString(16).padStart(6, "0")}`,
        );
        await this.playMajorCinematicPrelude(action, actorEntry, element);
        await this.playCastAnticipation(actorEntry, element);
        await playBattleEffectRelease(
          this,
          this.resolveVisualEntry(actorEntry),
          effectPresentation,
        );
        playSFX(
          effectPresentation?.soundHook || ELEMENT_SFX[element] || "sfx_spell",
        );

        const presentations = targets.map((tgt) => {
          const ee = this.enemySprites[tgt.targetId];
          const pt = this.findPartySpriteForTarget(
            tgt.targetName,
            tgt.targetId,
            spellMatch?.[3],
          );
          return { tgt, ee, pt, targetEntry: ee || pt };
        });
        const isGroupCast =
          isGroupTargetMode(action.target_mode) && presentations.length > 1;
        if (isGroupCast) {
          this.showActorCursor(actorEntry);
          this.targetCursor?.hide();
          this.showGroupTargetCursor(
            presentations.map((entry) => entry.targetEntry),
            targetModeSide(action.target_mode),
          );
        } else {
          this.showActionFocus(actorEntry, presentations[0]?.targetEntry, {
            targetColor: ACTION_RETICLE_COLORS.magicalTarget,
          });
        }

        // One cast beat fans out to every target at once. Damage remains one
        // authoritative server entry per target, but presentation is atomic.
        await Promise.all(
          presentations.map(({ targetEntry }) => {
            const customEffect = playBattleEffectToTarget(
              this,
              this.resolveVisualEntry(actorEntry),
              this.resolveVisualEntry(targetEntry),
              effectPresentation,
            );
            return (
              customEffect ||
              this.launchSpellProjectile(actorEntry, targetEntry, element)
            );
          }),
        );
        await Promise.all(
          presentations.map(async ({ tgt, ee, pt }) => {
            if (ee) {
              const targetKey = `enemy_${tgt.targetId}`;
              await this.hitFx(
                ee.x,
                ee.y,
                tgt.dmg,
                false,
                tgt.defeated,
                dmgType,
                {
                  targetKey,
                  element,
                  missed: tgt.missed,
                  entry: ee,
                  groupResult: isGroupCast,
                },
              );
              if (!tgt.missed && ee.hpBar) {
                const newHP = applyDamage(ee.hpBar.currentHP, tgt.dmg);
                this.animateHPBar(ee.hpBar, newHP, ee.hpBar.maxHP);
                if (!tgt.defeated) {
                  this.playEnemyHitReaction(ee, {
                    newHP,
                    maxHP: ee.hpBar.maxHP,
                  });
                }
              }
              if (tgt.defeated) await this.enemyDeathFx(ee);
            } else if (pt) {
              if (!(tgt.dmg > 0)) return;
              const targetKey = `party_${tgt.targetName || spellMatch?.[3]}`;
              await this.hitFx(pt.x, pt.y, tgt.dmg, true, false, dmgType, {
                targetKey,
                element,
                missed: tgt.missed,
                entry: pt,
                groupResult: isGroupCast,
              });
              if (!tgt.missed && pt.hpBar) {
                const newHP = applyDamage(pt.hpBar.currentHP, tgt.dmg);
                this.animateHPBar(pt.hpBar, newHP, pt.hpBar.maxHP);
                this.playPartyHitReaction(pt, {
                  newHP,
                  maxHP: pt.hpBar.maxHP,
                });
              }
            }
          }),
        );
        await this.resetPartySprite(actorEntry);
        this.hideGroupTargetCursor();
        if (isGroupCast) {
          const defeatedCount = presentations.filter(
            ({ tgt }) => tgt.defeated,
          ).length;
          if (defeatedCount) {
            await this.waitForCombatRead();
            this.revealLine(
              `${spellName}: ${defeatedCount} defeated.`,
              "#e9eef7",
            );
          }
        }
        await this.wait(ACTION_BEAT_MS.postDamage);
        await this.wait(ACTION_BEAT_MS.interAction);
      } else if (
        action.kind === "heal" ||
        (line.includes("healed") && action.kind !== "item")
      ) {
        const healActions = [{ action, line }];
        while (i + 1 < log.length) {
          const nextAction = actions[i + 1] || {};
          if (
            nextAction.kind === "heal" &&
            nextAction.actor_name === action.actor_name &&
            nextAction.action_id === action.action_id
          ) {
            i++;
            healActions.push({ action: nextAction, line: log[i] });
          } else {
            break;
          }
        }
        this.revealLine(
          `${action.actor_name} casts ${action.spell_name || "Heal"}!`,
          "#44ff44",
        );
        const casterEntry =
          this.partySprites[action.actor_name] ||
          this.findEnemySpriteForAction(action, action.actor_name);
        const presentation = battleEffectPresentation(action);
        let healPresentations = healActions.map((entry) => ({
          ...entry,
          target:
            this.partySprites[entry.action.target_name] ||
            this.partySprites[action.actor_name],
        }));
        if (
          isGroupTargetMode(action.target_mode) &&
          healPresentations.length === 1 &&
          !action.target_name
        ) {
          healPresentations = this.gameState.party
            .filter((member) => member.hp > 0)
            .map((member) => ({
              action: { ...action, target_name: member.name, damage: 0 },
              line,
              target: this.partySprites[member.name],
            }));
        }
        await this.showActionTitle(
          casterEntry,
          action.spell_name || "HEAL",
          "#fff4bd",
        );
        await this.playMajorCinematicPrelude(action, casterEntry, "holy");
        await this.playCastAnticipation(casterEntry, "holy");
        await playBattleEffectRelease(
          this,
          this.resolveVisualEntry(casterEntry),
          presentation,
        );
        if (
          isGroupTargetMode(action.target_mode) &&
          healPresentations.length > 1
        ) {
          this.showActorCursor(casterEntry);
          this.targetCursor?.hide();
          this.showGroupTargetCursor(
            healPresentations.map((entry) => entry.target),
            "party",
          );
        } else {
          this.showActionFocus(casterEntry, healPresentations[0]?.target, {
            targetColor: CURSOR_TINTS.ally,
          });
        }
        await Promise.all(
          healPresentations.map((entry) => {
            const customEffect = playBattleEffectToTarget(
              this,
              this.resolveVisualEntry(casterEntry),
              this.resolveVisualEntry(entry.target),
              presentation,
            );
            return (
              customEffect ||
              this.launchSpellProjectile(casterEntry, entry.target, "holy")
            );
          }),
        );
        playSFX(presentation?.soundHook || "sfx_heal");
        for (const presentation of healPresentations) {
          const amount =
            presentation.action.damage ||
            Number(presentation.line.match(/healed (\d+)/)?.[1] || 0);
          if (amount <= 0) continue;
          const anchor = floatingTextAnchorForEntry(presentation.target, {
            x: presentation.target?.x ?? 600,
            y: presentation.target?.y ?? 220,
          });
          const targetKey = `party_${presentation.action.target_name || action.actor_name}`;
          this.floatingText.spawn(
            anchor.x,
            anchor.y,
            amount,
            "heal",
            targetKey,
            { maxBottom: anchor.maxBottom },
          );
          if (presentation.target?.hpBar) {
            const newHP = applyHeal(
              presentation.target.hpBar.currentHP,
              amount,
              presentation.target.hpBar.maxHP,
            );
            this.animateHPBar(
              presentation.target.hpBar,
              newHP,
              presentation.target.hpBar.maxHP,
            );
          }
        }
        await this.resetPartySprite(casterEntry);
        this.hideGroupTargetCursor();
        await this.wait(ACTION_BEAT_MS.briefStatus);
      } else if (action.kind === "item") {
        const actorEntry = this.partySprites[action.actor_name];
        const targetEntry =
          this.partySprites[action.target_name] || actorEntry || null;
        this.revealLine(line, "#66ff99");
        await this.showActionTitle(actorEntry, "ITEM", "#66ff99");
        if (actorEntry?.sprite?.playBattleItemUse) {
          await actorEntry.sprite.playBattleItemUse({
            reducedMotion: this.reducedBattleMotion(),
            speedMultiplier: battleSpeedMul(),
          });
        }
        if (targetEntry) {
          this.showActionFocus(actorEntry, targetEntry, {
            targetColor: CURSOR_TINTS.ally,
          });
          this.spawnSpellImpact(targetEntry, "holy");
          if (
            line.includes("healed") &&
            action.damage > 0 &&
            targetEntry.hpBar
          ) {
            const newHP = applyHeal(
              targetEntry.hpBar.currentHP,
              action.damage,
              targetEntry.hpBar.maxHP,
            );
            this.animateHPBar(
              targetEntry.hpBar,
              newHP,
              targetEntry.hpBar.maxHP,
            );
          }
          if (line.includes("revived")) {
            targetEntry.alive = true;
            targetEntry.sprite?.resetBattlePose?.();
            targetEntry.sprite?.clearTint?.();
            targetEntry.sprite?.setAngle?.(0);
            targetEntry.sprite?.setAlpha?.(1);
            targetEntry.sprite?.setInteractive?.({ useHandCursor: true });
          }
        }
        await this.wait(ACTION_BEAT_MS.briefStatus);
      } else if (line.includes("Found:")) {
        this.revealLine(line, "#44ff44");
        await this.wait(ACTION_BEAT_MS.infoPause);
      } else if (action.kind === "poison_tick") {
        // Poison damage at start of round
        const targetId = action.target_id;
        const dmg = action.damage || action.total_damage;
        this.revealLine(line, "#44bb44");
        const ee = this.enemySprites[targetId];
        const pt = this.partySprites[action.actor_name];
        const sprite = ee || pt;
        if (sprite) {
          if (sprite.sprite?.setTint) {
            sprite.sprite.setTint(0x44bb44);
            this.scaledDelay(300, () => sprite.sprite.clearTint?.());
          }
          const px = sprite.x || sprite.sprite?.x;
          const py = sprite.y || sprite.sprite?.y;
          if (px != null && py != null) {
            const nt = this.add
              .text(px, py - 20, `-${dmg}`, {
                fontSize: "14px",
                color: "#44bb44",
                fontFamily: "monospace",
                fontStyle: "bold",
              })
              .setOrigin(0.5)
              .setDepth(25);
            this.tweens.add({
              targets: nt,
              y: nt.y - 25,
              alpha: 0,
              duration: 600,
              onComplete: () => nt.destroy(),
            });
          }
          // Issue #69: poison ticks used to skip the HP bar + death FX
          // entirely, so a tick that killed an enemy left the bar at the
          // pre-tick value and the sprite visible. Apply both here.
          let newHP;
          if (sprite.hpBar) {
            newHP = applyDamage(sprite.hpBar.currentHP, dmg);
            this.animateHPBar(sprite.hpBar, newHP, sprite.hpBar.maxHP);
          }
          if (pt && newHP != null) {
            this.playPartyHitReaction(pt, {
              newHP,
              maxHP: pt.hpBar.maxHP,
            });
          }
          if (ee && defeatMatch) await this.enemyDeathFx(ee);
        }
        await this.wait(ACTION_BEAT_MS.briefStatus);
      } else if (action.kind === "confusion") {
        if (this.isDefeatedEnemyActor(action)) {
          continue;
        }
        // Confused actor attacks randomly — target may be ally or enemy
        const targetId = action.target_id;
        const dmg = action.damage;
        this.revealLine(line, "#dddd44");
        playSFX("sfx_hit");
        const actorEntry =
          this.partySprites[action.actor_name] ||
          this.findEnemySpriteForAction(action, action.actor_name);
        await this.showActionTitle(actorEntry, "CONFUSE", "#dddd44");
        await this.wait(ACTION_BEAT_MS.preImpact);
        const ee = this.enemySprites[targetId];
        if (ee) {
          this.showActionFocus(actorEntry, ee, {
            tracerColor: ACTION_TRACER_COLORS.partyToEnemy,
            targetColor: ACTION_RETICLE_COLORS.enemyTarget,
          });
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch, "physical", {
            entry: ee,
          });
          if (defeatMatch) await this.enemyDeathFx(ee);
        } else {
          // Target is a party member — find by slot ID
          const gs = this.gameState;
          const targetMember =
            gs.party && gs.party[targetId]
              ? this.partySprites[gs.party[targetId].name]
              : null;
          if (targetMember) {
            this.showActionFocus(actorEntry, targetMember, {
              tracerColor: ACTION_TRACER_COLORS.enemyToParty,
              targetColor: ACTION_RETICLE_COLORS.partyTarget,
            });
            await this.hitFx(
              targetMember.x,
              targetMember.y,
              dmg,
              true,
              false,
              "physical",
              { entry: targetMember },
            );
            if (targetMember.hpBar) {
              const newHP = applyDamage(targetMember.hpBar.currentHP, dmg);
              this.animateHPBar(
                targetMember.hpBar,
                newHP,
                targetMember.hpBar.maxHP,
              );
              this.playPartyHitReaction(targetMember, {
                newHP,
                maxHP: targetMember.hpBar.maxHP,
              });
            }
          }
        }
        await this.wait(ACTION_BEAT_MS.postDamage);
        await this.wait(ACTION_BEAT_MS.interAction);
      } else if (action.kind === "status_effect") {
        // Status spell landed or resisted
        this.revealLine(line, "#cc88ff");
        const casterEntry =
          this.partySprites[action.actor_name] ||
          this.findEnemySpriteForAction(action, action.actor_name);
        const targetEntry = this.enemySprites[action.target_id];
        await this.showActionTitle(
          casterEntry,
          action.spell_name || "STATUS",
          "#c27aff",
        );
        await this.playMajorCinematicPrelude(action, casterEntry, "dark");
        await this.playCastAnticipation(casterEntry, "dark");
        this.showActionFocus(casterEntry, targetEntry, {
          targetColor: ACTION_RETICLE_COLORS.magicalTarget,
        });
        await this.launchSpellProjectile(casterEntry, targetEntry, "dark");
        await this.resetPartySprite(casterEntry);
        await this.wait(ACTION_BEAT_MS.briefStatus);
      } else if (action.kind === "ability") {
        if (this.isDefeatedEnemyActor(action)) {
          continue;
        }
        this.revealLine(line, "#ff88ff");
        const actorEntry =
          this.partySprites[action.actor_name] ||
          this.findEnemySpriteForAction(action, action.actor_name);
        await this.showActionTitle(
          actorEntry,
          this.actionTitleFor(action, line),
          "#ff88ff",
        );
        await this.playMajorCinematicPrelude(action, actorEntry, "dark");
        if (isGroupTargetMode(action.target_mode) && !(action.damage > 0)) {
          const targets = (this.gameState.party || [])
            .filter((member) => member.hp > 0)
            .map((member) => this.partySprites[member.name])
            .filter(Boolean);
          await this.playCastAnticipation(actorEntry, "holy");
          this.showActorCursor(actorEntry);
          this.targetCursor?.hide();
          this.showGroupTargetCursor(targets, "party");
          await Promise.all(
            targets.map((target) =>
              this.launchSpellProjectile(actorEntry, target, "holy"),
            ),
          );
          await this.resetPartySprite(actorEntry);
          this.hideGroupTargetCursor();
        } else if (!(action.damage > 0)) {
          await this.playUtilityAbility(actorEntry, action);
        }
        // Backstab with damage gets hit effect
        if (action.damage > 0) {
          playSFX("sfx_slash");
          const ee = this.enemySprites[action.target_id];
          if (ee) {
            this.showActionFocus(actorEntry, ee, {
              tracerColor:
                action.damage_type === "magical"
                  ? ACTION_TRACER_COLORS.magical
                  : ACTION_TRACER_COLORS.partyToEnemy,
              targetColor:
                action.damage_type === "magical"
                  ? ACTION_RETICLE_COLORS.magicalTarget
                  : ACTION_RETICLE_COLORS.enemyTarget,
            });
            await this.lungePartySprite(actorEntry, ee, { crit: action.crit });
            if (!actorEntry?.battleAction)
              await this.wait(ACTION_BEAT_MS.preImpact);
            const targetKey = `enemy_${action.target_id}`;
            await this.hitFx(
              ee.x,
              ee.y,
              action.damage,
              false,
              defeatMatch,
              action.damage_type || "physical",
              {
                crit: action.crit,
                guarded: action.damage_prevented > 0,
                targetKey,
                entry: ee,
              },
            );
            if (ee.hpBar) {
              const newHP = applyDamage(ee.hpBar.currentHP, action.damage);
              this.animateHPBar(ee.hpBar, newHP, ee.hpBar.maxHP);
              if (!defeatMatch) {
                this.playEnemyHitReaction(ee, {
                  newHP,
                  maxHP: ee.hpBar.maxHP,
                });
              }
            }
            await this.resetPartySprite(actorEntry);
            if (defeatMatch) await this.enemyDeathFx(ee);
          }
        }
        await this.wait(ACTION_BEAT_MS.postDamage);
        await this.wait(ACTION_BEAT_MS.interAction);
      }
    }
    await this.waitForCombatRead();
  }

  // The final result also stays readable before victory or command selection.
  async waitForCombatRead() {
    const remaining = Math.max(
      0,
      (this.combatReadUntil || 0) - performance.now(),
    );
    if (remaining)
      await new Promise((resolve) => this.time.delayedCall(remaining, resolve));
  }

  async runCinematicProofDemo() {
    const partyEntries = Object.values(this.partySprites || {}).sort(
      (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
    );
    const enemyEntries = Object.values(this.enemySprites || {}).filter(
      (entry) => entry && !entry.dead && !entry.dying,
    );
    const actorEntry = partyEntries[0];
    const targetEntry = enemyEntries[0];
    if (!actorEntry || !targetEntry) {
      return {
        total: 0,
        titleLead: 0,
        preImpact: 0,
        postDamage: 0,
      };
    }

    const now = () => globalThis.performance?.now?.() ?? Date.now();
    const start = now();
    const targetKey = `proof_cinematic_${Date.now()}`;

    this.showActorCursor(actorEntry);
    this.showTargetCursor(targetEntry, "enemy");
    this.showActionFocus(actorEntry, targetEntry, {
      tracerColor: ACTION_TRACER_COLORS.partyToEnemy,
      targetColor: ACTION_RETICLE_COLORS.enemyTarget,
    });
    this.revealLine(
      `${actorEntry.name} attacks ${targetEntry.name}!`,
      "#ff8844",
    );
    await this.showActionTitle(actorEntry, "SLASH", "#ffcc66");
    const afterTitle = now();
    await this.lungePartySprite(actorEntry, targetEntry);
    const lungePeak = now();
    if (!actorEntry.battleAction) await this.wait(ACTION_BEAT_MS.preImpact);
    const impactStart = now();
    playSFX("sfx_slash");
    await this.hitFx(
      targetEntry.x,
      targetEntry.y,
      42,
      false,
      false,
      "physical",
      {
        crit: true,
        targetKey,
        entry: targetEntry,
      },
    );
    await this.resetPartySprite(actorEntry);
    await this.wait(ACTION_BEAT_MS.postDamage);
    const afterDamageHold = now();
    await this.wait(ACTION_BEAT_MS.interAction);
    const done = now();

    return {
      titleLead: afterTitle - start,
      preImpact: impactStart - lungePeak,
      postDamage: afterDamageHold - impactStart,
      total: done - start,
    };
  }

  async runCinematicProofFrame() {
    const partyEntries = Object.values(this.partySprites || {}).sort(
      (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
    );
    const enemyEntries = Object.values(this.enemySprites || {}).filter(
      (entry) => entry && !entry.dead && !entry.dying,
    );
    const actorEntry = partyEntries[0];
    const targetEntry = enemyEntries[0];
    if (!actorEntry || !targetEntry) {
      return null;
    }

    this.showActorCursor(actorEntry);
    this.showTargetCursor(targetEntry, "enemy");
    this.showActionFocus(actorEntry, targetEntry, {
      tracerColor: ACTION_TRACER_COLORS.partyToEnemy,
      targetColor: ACTION_RETICLE_COLORS.enemyTarget,
    });
    this.revealLine(
      `${actorEntry.name} attacks ${targetEntry.name}!`,
      "#ff8844",
    );
    void this.showActionTitle(actorEntry, "SLASH", "#ffcc66");
    await this.lungePartySprite(actorEntry, targetEntry);
    await this.wait(120);
    return {
      actorX: actorEntry.sprite?.x ?? actorEntry.x,
      targetX: targetEntry.x,
    };
  }

  async runEnemyAttackProofFrame() {
    const partyEntries = Object.values(this.partySprites || {}).sort(
      (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
    );
    const enemyEntries = Object.values(this.enemySprites || {}).filter(
      (entry) => entry && !entry.dead && !entry.dying,
    );
    const actorEntry = enemyEntries[0];
    const targetEntry = partyEntries[0];
    if (!actorEntry || !targetEntry) return null;

    this.showActorCursor(actorEntry);
    this.showTargetCursor(targetEntry, "party");
    this.showActionFocus(actorEntry, targetEntry, {
      tracerColor: ACTION_TRACER_COLORS.enemyToParty,
      targetColor: ACTION_RETICLE_COLORS.partyTarget,
    });
    this.revealLine(
      `${actorEntry.name} attacks ${targetEntry.name}!`,
      "#ff9966",
    );
    void this.showActionTitle(actorEntry, "ATTACK", "#ff9966");
    await this.lungePartySprite(actorEntry, targetEntry);
    await this.wait(120);
    return {
      actorX: actorEntry.sprite?.x ?? actorEntry.x,
      targetX: targetEntry.x,
    };
  }

  async runSpellProofFrame(phase = "flight") {
    const partyEntries = Object.values(this.partySprites || {}).sort(
      (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
    );
    const enemyEntries = Object.values(this.enemySprites || {}).filter(
      (entry) => entry && !entry.dead && !entry.dying,
    );
    const actorEntry = partyEntries[1] || partyEntries[0];
    const targetEntry = enemyEntries[0];
    if (!actorEntry || !targetEntry) return null;

    this.showActorCursor(actorEntry);
    this.showTargetCursor(targetEntry, "enemy");
    this.showActionFocus(actorEntry, targetEntry, {
      targetColor: ACTION_RETICLE_COLORS.magicalTarget,
    });
    this.revealLine(
      `${actorEntry.name} casts Spark on ${targetEntry.name}!`,
      "#88aaff",
    );
    void this.showActionTitle(actorEntry, "SPARK", "#ff7a45");
    await this.playCastAnticipation(actorEntry, "fire");
    if (phase === "charge") {
      return { phase, actorX: actorEntry.sprite?.x ?? actorEntry.x };
    }

    void this.launchSpellProjectile(actorEntry, targetEntry, "fire", {
      duration: 900,
    });
    // Keep the audit hook inside the flight window even when a tall mobile
    // canvas causes Phaser to refresh its Scale Manager during scene entry.
    await this.wait(120);
    return {
      phase,
      actorX: actorEntry.sprite?.x ?? actorEntry.x,
      targetX: targetEntry.x,
    };
  }

  async runMajorCinematicProofFrame() {
    const partyEntries = Object.values(this.partySprites || {}).sort(
      (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
    );
    const actorEntry = partyEntries[1] || partyEntries[0];
    if (!actorEntry) return null;

    const action = {
      kind: "spell",
      action_id: "fireball",
      action_name: "Fireball",
      spell_name: "Fireball",
      cinematic_tier: "major",
    };
    this._seenMajorCinematics.delete(cinematicActionKey(action));
    this.revealLine(`${actorEntry.name} casts Fireball!`, "#88aaff");
    void this.showActionTitle(actorEntry, "FIREBALL", "#ff7a45");
    this.majorProofPromise = this.playMajorCinematicPrelude(
      action,
      actorEntry,
      "fire",
    );
    await this.wait(220);
    return {
      active: !!this.activeMajorCinematic,
      key: cinematicActionKey(action),
    };
  }

  async runMajorCinematicPolicyProof() {
    this._seenMajorCinematics.clear();
    const partyEntries = Object.values(this.partySprites || {}).sort(
      (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
    );
    const actorEntry = partyEntries[1] || partyEntries[0];
    const action = {
      kind: "spell",
      action_id: "fireball",
      action_name: "Fireball",
      cinematic_tier: "major",
    };
    const first = await this.playMajorCinematicPrelude(
      action,
      actorEntry,
      "fire",
    );
    const second = await this.playMajorCinematicPrelude(
      action,
      actorEntry,
      "fire",
    );
    return { first, second };
  }

  hitFx(x, y, dmg, isParty, defeated, damageType, opts = {}) {
    for (const actor of [
      ...Object.values(this.partySprites),
      ...Object.values(this.enemySprites),
    ]) {
      if (
        actor.battleAction &&
        actor.sprite.battleState === "physical_attack"
      ) {
        const action = actor.battleAction;
        this.scaledDelay(this.reducedBattleMotion() ? 0 : 55, () =>
          action.followThrough(),
        );
      }
    }
    return new Promise((resolve) => {
      if (opts.missed) {
        playSFX("sfx_miss");
      } else if (opts.crit) {
        playSFX("sfx_crit");
        if (!this.reducedBattleMotion()) {
          this.cameras.main.shake(
            this.scaledMs(ACTION_BEAT_MS.critShake),
            0.0045,
          );
        }
      }
      if (opts.missed) {
        // A miss must not draw the same contact slash as a landed blow.
      } else if (damageType === "physical") {
        meleeContactDetails(this, x, y, opts);
        if (isParty) this.spawnPartyImpactBurst(x, y);
      } else if (isParty) {
        this.spawnPartyImpactBurst(x, y);
      } else {
        const g = this.add.graphics().setDepth(20);
        g.lineStyle(3, damageType === "magical" ? 0xbb88ff : 0xffffff, 1);
        g.lineBetween(x - 20, y - 15, x + 20, y + 15);
        this.scaledDelay(150, () => g.destroy());
      }

      const targetKey = opts.targetKey || `pos_${x}_${y}`;
      const gap = Math.max(10, parseInt(portraitFontSize(this, 6)));
      const textAnchor = floatingTextAnchorForEntry(opts.entry, { x, y, gap });
      const type = opts.missed
        ? "miss"
        : opts.crit
          ? "crit"
          : isParty
            ? "party_hit"
            : damageType === "magical"
              ? "magical"
              : "physical";
      this.floatingText.spawnResult(
        textAnchor.x,
        textAnchor.y,
        dmg,
        type,
        targetKey,
        {
          element: opts.element,
          guarded: opts.guarded,
          defeated: defeated && !opts.missed,
          groupResult: opts.groupResult,
          replaceTarget: opts.replaceTarget,
          maxBottom: textAnchor.maxBottom,
          gap,
        },
      );

      this.scaledDelay(opts.crit ? 180 : 150, resolve);
    });
  }

  // hideEnemyElements hides every visual element associated with an enemy
  // sprite entry: the sprite itself, name text, HP bar, and number indicator.
  hideEnemyElements(ee) {
    if (ee.sprite) {
      ee.sprite.setVisible(false);
      ee.sprite.removeInteractive();
    }
    if (ee.nameText) ee.nameText.setVisible(false);
    if (ee.statusIcon) ee.statusIcon.setVisible(false);
    if (ee.hpBar) {
      ee.hpBar.bg?.setVisible(false);
      ee.hpBar.ghost?.setVisible(false);
      ee.hpBar.fill?.setVisible(false);
      ee.hpBar.label?.setVisible(false);
      if (ee.hpBar.fill) ee.hpBar.fill.width = 0;
      if (ee.hpBar.ghost) ee.hpBar.ghost.width = 0;
      ee.hpBar.currentHP = 0;
      ee.hpBar.label?.setText(formatHPLabel(0, ee.hpBar.maxHP));
    }
    // Hide number indicator
    const numEntry = this.enemyNumbers?.find((n) => n.enemyId === ee.id);
    if (numEntry?.text) numEntry.text.setVisible(false);
    ee.dead = true;
  }

  enemyDeathFx(ee) {
    return new Promise((resolve) => {
      if (!ee || !ee.sprite) {
        resolve();
        return;
      }
      if (ee.dying || ee.dead) {
        resolve();
        return;
      }
      ee.dying = true;
      // Disable pointer events so hover handlers can't fight the fade.
      ee.sprite.removeInteractive();
      this.tweens.add({
        targets: ee.sprite,
        alpha: 0,
        scaleY: 0.3,
        y: ee.y + 20,
        duration: 500,
        ease: "Power2",
        onComplete: () => {
          this.hideEnemyElements(ee);
          resolve();
        },
      });
      // Fallback: if the tween never completes (scene transition, engine
      // hiccup), force-hide after 600ms so the sprite never lingers.
      // resolve() is safe to call twice — second call is a no-op.
      this.time.delayedCall(600, () => {
        if (!ee.dead) this.hideEnemyElements(ee);
        resolve();
      });
    });
  }

  // reconcileEnemySprites makes sure every locally-tracked enemy sprite
  // matches the latest server state. Any sprite whose id is not in
  // liveEnemies (i.e. the server removed it because CurrentHP <= 0) gets
  // the death FX immediately, regardless of whether any per-action entry
  // in the combat log carried `Killed: true` for it. See issue #69 for
  // the repro — a poison-tick kill or a non-parsed death line could
  // otherwise leave the sprite visible with a drifted HP sliver.
  async reconcileEnemySprites(liveEnemies) {
    const liveIds = new Set(liveEnemies.map((e) => e.id));
    const fades = [];
    for (const idStr of Object.keys(this.enemySprites)) {
      const id = Number(idStr);
      const ee = this.enemySprites[id];
      if (!ee || ee.dead) continue;
      // If a death tween is in progress but the server confirms death,
      // force-hide immediately rather than waiting for the tween.
      if (ee.dying && !liveIds.has(id)) {
        this.hideEnemyElements(ee);
        continue;
      }
      if (ee.dying) continue;
      if (!liveIds.has(id)) {
        fades.push(this.enemyDeathFx(ee));
      }
    }
    if (fades.length > 0) {
      await Promise.all(fades);
    }
  }

  tweenP(target, config) {
    const mul = battleSpeedMul();
    const scaled = { ...config };
    if (typeof config.duration === "number") {
      scaled.duration = Math.max(0, config.duration * mul);
    }
    return new Promise((resolve) =>
      this.tweens.add({ targets: target, ...scaled, onComplete: resolve }),
    );
  }

  wait(ms) {
    const scaled = Math.max(0, ms * battleSpeedMul());
    return new Promise((resolve) => this.time.delayedCall(scaled, resolve));
  }

  // scaledDelay wraps time.delayedCall with the battle speed multiplier.
  // Use for raw pacing delays that aren't routed through wait() (e.g.
  // fire-and-forget tint clears inside animateCombatLog).
  scaledDelay(ms, cb) {
    const scaled = Math.max(0, ms * battleSpeedMul());
    return this.time.delayedCall(scaled, cb);
  }

  // revealLine shows `line` on this.promptText with an optional
  // typewriter effect keyed off messageSpeed. Callers do NOT need to
  // await the returned promise — if a new reveal starts while the prior
  // one is still running, the prior line is flushed to its full value
  // immediately so the player never sees a half-complete previous line.
  // At messageSpeed 6 (0ms/char) the reveal is instant, matching the
  // pre-issue-#129 behavior.
  revealLine(line, color = "#ffffff") {
    if (this.revealEvent) {
      this.revealEvent.remove(false);
      this.revealEvent = null;
      if (this.revealLastLine) {
        this.promptText.setText(this.revealLastLine);
      }
    }
    const charMs = messageCharMs();
    this.combatReadUntil = performance.now() + combatReadTime(line, charMs);
    this.promptText.setColor(color);
    this.revealLastLine = line || "";
    if (!line || charMs <= 0) {
      this.promptText.setText(line || "");
      return Promise.resolve();
    }
    this.promptText.setText("");
    return new Promise((resolve) => {
      let idx = 0;
      this.revealEvent = this.time.addEvent({
        delay: charMs,
        repeat: line.length - 1,
        callback: () => {
          idx++;
          this.promptText.setText(line.slice(0, idx));
          if (idx >= line.length) {
            this.revealEvent = null;
            resolve();
          }
        },
      });
    });
  }

  animateHPBar(hpBarData, newHP, maxHP) {
    if (!hpBarData) return;
    const clampedHP = Math.max(0, newHP | 0);
    if (clampedHP === hpBarData.currentHP) return;

    const bw = hpBarData.width || 1;
    const fillW = hpBarFillWidth(clampedHP, maxHP, bw);
    const pct = hpBarColorPct(clampedHP, maxHP);
    const bc = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;

    // Immediately update fill bar — integer pixels, no sub-pixel sliver.
    if (hpBarData.fill) {
      hpBarData.fill.setSize(fillW, hpBarData.fill.height);
      hpBarData.fill.setFillStyle(clampedHP > 0 ? bc : 0x333333);
    }

    // Update HP label — integer-only via formatHPLabel.
    hpBarData.label?.setText(formatHPLabel(clampedHP, maxHP));
    const condition = combatantConditionLabel(
      clampedHP,
      maxHP,
      hpBarData.status,
    );
    hpBarData.conditionLabel
      ?.setText(condition || "OK")
      .setColor(condition ? "#ffd36b" : "#a7b7cb")
      .setFontStyle(condition ? "bold" : "");

    // Ghost bar drains after a short delay
    if (hpBarData.ghost) {
      this.tweens.add({
        targets: hpBarData.ghost,
        width: fillW,
        onUpdate: () =>
          hpBarData.ghost.setSize(
            hpBarData.ghost.width,
            hpBarData.ghost.height,
          ),
        duration: 250,
        delay: 100,
        ease: "Quad.Out",
      });
    }

    hpBarData.currentHP = clampedHP;
  }

  showVictoryResults(gs) {
    if (this.returnFromDungeonDefeat(gs)) return;
    // Cancel the floating-text completion callbacks before destroying Text
    // textures; a late pool release would otherwise redraw a destroyed canvas.
    this.floatingText?.destroy();
    // DisplayList.removeAll(true) skips callbacks; it does not destroy actors,
    // input targets or DOM elements. Destroy a snapshot before replacing the UI.
    this.children.list.slice().forEach((child) => child.destroy());
    this.gameState = gs;
    this.defeatDialog?.dispose();
    this.victoryReceipt?.finish();
    this.victoryReceipt?.dialog.dispose();
    this.victoryFastForwarded = false;
    this.victoryContinueShown = false;
    const isDefeat = gs.phase === "defeat";
    stopMusic();
    playMusic(isDefeat ? "music_defeat" : "music_victory", false);

    if (isDefeat) {
      this.defeatDialog = showDefeatReceipt(this, gs);
      return;
    }

    this.victoryReceipt = showVictoryReceipt(this, gs, {
      onContinue: () => this.returnFromBattle(this.gameState),
      onTallyDone: () => {
        this.victoryFastForwarded = true;
      },
    });
    this.finalizeVictory(gs);
  }

  fastForwardVictoryResults() {
    this.victoryReceipt?.finish();
  }

  finalizeVictory(gs) {
    if (this.victoryContinueShown) return;
    this.victoryContinueShown = true;
    if (pendingEquipmentDrops(gs).length > 0) {
      this.victoryReceipt?.suspend();
      showPostBattleLoot(this, gs, {
        onComplete: (latest) => this.addContinueButton(latest),
        requestTimeoutMs: this.postBattleLootRequestTimeoutMs,
      });
      return;
    }
    this.addContinueButton(gs);
  }

  addContinueButton() {
    this.victoryReceipt?.enableContinue();
  }
}
