import { gameAction, getGame } from "../api.js";
import { createComposedSprite } from "../sprites/composedSprite.js";
import { initAudio, playMusic, playSFX, stopMusic } from "../systems/audio.js";
import { shouldAcceptEnemySpriteClick } from "../systems/battleTargeting.js";
import { showItemMenu } from "./item_menu.js";
import {
  applyDamage,
  applyHeal,
  formatHPLabel,
  hpBarColorPct,
  hpBarFillWidth,
} from "../systems/hpBar.js";
import { buildVictoryXPSegments } from "../systems/victoryXp.js";
import { FloatingTextPool } from "../ui/floating_text.js";
import { ENEMY_SPRITES } from "../data/monsterSprites.js";
import {
  battleSpeedMul,
  messageCharMs,
} from "../systems/prefs.js";
import { toggleDebugPanel, closeDebugPanel } from "./debug_panel.js";
import {
  buildBattleActionButtons,
  planSmartRound,
  resolveAction,
} from "../systems/auto_battle.js";

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
const ELEMENT_FLASH = {
  fire: 0xff2200,
  ice: 0x2266ff,
  lightning: 0xffee00,
  holy: 0xffffcc,
  dark: 0x442266,
};
const ELEMENT_SFX = {
  fire: "sfx_fire",
  ice: "sfx_ice",
  lightning: "sfx_lightning",
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

function normalizeLastRoundActions(actions) {
  return Array.isArray(actions) && actions.length > 0 ? actions : null;
}

export class BattleScene extends Phaser.Scene {
  constructor() {
    super("Battle");
  }

  init(data) {
    this.gameState = data.gameState;
    this._lastRoundActions = normalizeLastRoundActions(
      data.lastRoundActions ?? data.gameState?.last_round_actions,
    );
    this._autoMode = data.autoMode || false;
  }

  create() {
    // Clear previous keyboard listeners to prevent duplicates on scene restart
    this.input.keyboard.removeAllListeners();

    this.animating = false;
    this.enemySprites = {};
    this.partySprites = {};
    this.partyArrows = [];
    this.pendingAction = null;
    this.pendingSpellId = null;
    this.pendingSpellEffect = null;
    this.actionBtns = null;

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

    // Floating text pool for damage/heal numbers
    if (this.floatingText) this.floatingText.destroy();
    this.floatingText = new FloatingTextPool(this);
    this.events.once("shutdown", () => this.floatingText?.destroy());

    const gs = this.gameState;
    if (!gs || gs.phase !== "combat" || !gs.enemies?.length) {
      if (gs?.combat_log?.length) this.showVictoryResults(gs);
      else this.scene.start("World", { gameState: gs });
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

    // Background
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);
    this.add.rectangle(400, 400, 800, 200, 0x111133);

    this.drawEnemies(gs);
    this.drawParty(gs);
    this.drawLog(gs);

    this.promptText = this.add
      .text(400, 340, "", {
        fontSize: "11px",
        color: "#ffff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setDepth(5);

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
          fontFamily: "monospace",
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
        fontFamily: "monospace",
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
      await this.reconcileEnemySprites(result.enemies || []);
      this.gameState = result;
      this.time.delayedCall(400, () => {
        this.animating = false;
        if (this.gameState.phase !== "combat") {
          this.showVictoryResults(this.gameState);
        } else {
          this.scene.restart({ gameState: this.gameState });
        }
      });
    } catch (e) {
      console.error("[Battle] wait failed:", e);
      this.animating = false;
    }
  }

  setupKeyboard() {
    // Action hotkeys (A/S/I/F) — any manual action cancels auto-mode (#99)
    this.input.keyboard.on("keydown-A", () => {
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
    });

    this.input.keyboard.on("keydown-S", () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      this.autoMode = false;
      const slot = this.livingMembers[this.currentMemberIdx];
      this.showSpellPicker(slot);
    });

    this.input.keyboard.on("keydown-I", () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      this.autoMode = false;
      const slot = this.livingMembers[this.currentMemberIdx];
      this.showItemPicker(slot);
    });

    this.input.keyboard.on("keydown-M", () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      this.autoMode = false;
      this.executeSmartAttack();
    });

    this.input.keyboard.on("keydown-B", () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      this.autoMode = false;
      const slot = this.livingMembers[this.currentMemberIdx];
      this.showAbilityPicker(slot);
    });

    this.input.keyboard.on("keydown-F", () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (this.currentMemberIdx >= this.livingMembers.length) return;
      this.autoMode = false;
      this.doFlee();
    });

    // REPEAT last round's actions (issue #99)
    this.input.keyboard.on("keydown-R", () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (!this.lastRoundActions) return;
      this.executeRepeat();
    });

    // Toggle AUTO-BATTLE mode (issue #99)
    this.input.keyboard.on("keydown-Q", () => {
      if (this.animating || this.targetingMode || this.pickerOverlay) return;
      if (!this.lastRoundActions) return;
      this.autoMode = !this.autoMode;
      if (this.autoMode) {
        this.executeRepeat();
      } else {
        // Redraw buttons to update AUTO label
        const slot = this.livingMembers[this.currentMemberIdx];
        if (slot !== undefined) this.drawActions(this.gameState, slot);
      }
    });

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
        const slot = this.livingMembers[this.currentMemberIdx];
        const member = this.gameState.party[slot];
        this.promptText
          .setText(`${member.name}'s turn -- choose an action`)
          .setColor("#ffff44");
        return;
      }
    });

    // Dev-only debug panel (#145). See world.js for the gating rationale.
    if (import.meta.env && import.meta.env.DEV) {
      this.input.keyboard.on("keydown-BACKTICK", () => toggleDebugPanel(this));
    }
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

    // Move arrow to current member
    for (let i = 0; i < this.partyArrows.length; i++) {
      this.partyArrows[i].setVisible(i === slot);
    }

    this.promptText
      .setText(`${member.name}'s turn -- choose an action`)
      .setColor("#ffff44");
    this.pendingAction = null;
    this.pendingSpellId = null;
    this.pendingSpellEffect = null;

    // Draw action buttons for this member
    this.drawActions(gs, slot);
  }

  drawEnemies(gs) {
    const enemies = gs.enemies;
    const spacing = Math.min(130, 450 / Math.max(enemies.length, 1));
    const sx = 80 + (450 - enemies.length * spacing) / 2;
    this.enemyNumbers = [];

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const x = sx + i * spacing,
        y = 240;
      const sz = e.name === "Dark Knight" ? 80 : 50;

      const key = ENEMY_SPRITES[e.name];
      let sprite;
      if (key && this.textures.exists(key)) {
        sprite = this.add.image(x, y, key);
        sprite.setScale((sz / Math.max(sprite.width, sprite.height)) * 2);
      } else {
        sprite = this.add.rectangle(
          x,
          y,
          sz,
          sz,
          ENEMY_COLORS[e.name] || 0xff5722,
        );
      }
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
          this.promptText.setText(`Target: ${e.name}`);
        }
      });
      sprite.on("pointerout", () => {
        if (!this.enemySprites[e.id]?.dying) sprite.setAlpha(1);
      });
      this.enemySprites[e.id] = { sprite, x, y, name: e.name, id: e.id };

      const nameText = this.add
        .text(x, y - sz / 2 - 18, e.name, {
          fontSize: "10px",
          color: "#ffffff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);
      this.enemySprites[e.id].nameText = nameText;

      // Number indicator for keyboard targeting
      const numText = this.add
        .text(x, y + sz / 2 + 1, `${i + 1}`, {
          fontSize: "10px",
          color: "#ffff44",
          fontFamily: "monospace",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(10)
        .setAlpha(0.3);
      this.enemyNumbers.push({ text: numText, enemyId: e.id });

      const bw = 65;
      const pct = hpBarColorPct(e.hp, e.max_hp);
      const fillW = hpBarFillWidth(e.hp, e.max_hp, bw);
      const barX = x - bw / 2,
        barY = y + sz / 2 + 10;
      const bc = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;
      const bg = this.add
        .rectangle(barX, barY, bw, 7, 0x333333)
        .setOrigin(0, 0.5)
        .setDepth(8);
      const ghost = this.add
        .rectangle(barX, barY, fillW, 7, 0xff6644)
        .setOrigin(0, 0.5)
        .setDepth(9);
      const fill = this.add
        .rectangle(barX, barY, fillW, 7, pct > 0 ? bc : 0x333333)
        .setOrigin(0, 0.5)
        .setDepth(10);
      const hpLabel = this.add
        .text(x, y + sz / 2 + 22, formatHPLabel(e.hp, e.max_hp), {
          fontSize: "8px",
          color: "#aaaaaa",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);
      this.enemySprites[e.id].hpBar = {
        bg,
        ghost,
        fill,
        label: hpLabel,
        width: bw,
        // currentHP is the authoritative integer HP. animateHPBar reads
        // this (never `maxHP * currentPct`) so drifted float percentages
        // cannot resurface a dead enemy with a 1-pixel sliver. Issue #69.
        currentHP: Math.max(0, e.hp | 0),
        maxHP: e.max_hp,
      };

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
    const px = 560;
    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      const x = px,
        y = 160 + i * 85;
      const alive = p.hp > 0;

      const arrow = this.add
        .triangle(x - 18, y, 0, -8, 0, 8, 10, 0, 0xffff44)
        .setDepth(2)
        .setVisible(false);
      this.partyArrows[i] = arrow;

      const fallbackKey = CLASS_SPRITES[p.sprite_id || p.class_id];
      const composition = p.composition || {
        base_sprite: fallbackKey || "",
      };
      const sprite = createComposedSprite(this, x + 15, y, composition, {
        alive,
        targetSize: 100,
        fallbackKey,
      });
      this.partySprites[p.name] = {
        sprite,
        arrow,
        x: x + 15,
        y,
        alive,
        slot: i,
      };

      if (alive) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => {
          if (this.targetingMode === "party") {
            this.onPartyClick(i);
          }
        });
      }

      this.add.text(x + 45, y - 18, p.name, {
        fontSize: "11px",
        color: alive ? "#ffffff" : "#666666",
        fontFamily: "monospace",
      });
      this.add.text(x + 45, y - 3, `${p.class_name} Lv${p.level}`, {
        fontSize: "9px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      });

      const bw = 85;
      const hpPct = hpBarColorPct(p.hp, p.max_hp);
      const fillW = hpBarFillWidth(p.hp, p.max_hp, bw);
      const barX = x + 90,
        barY = y + 13;
      const bc = hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
      const bg = this.add
        .rectangle(barX, barY, bw, 6, 0x333333)
        .setOrigin(0, 0.5)
        .setDepth(8);
      const ghost = this.add
        .rectangle(barX, barY, fillW, 6, 0xff6644)
        .setOrigin(0, 0.5)
        .setDepth(9);
      const fill = this.add
        .rectangle(barX, barY, fillW, 6, hpPct > 0 ? bc : 0x333333)
        .setOrigin(0, 0.5)
        .setDepth(10);
      const hpLabel = this.add.text(
        x + 90 + bw + 5,
        y + 8,
        formatHPLabel(p.hp, p.max_hp),
        {
          fontSize: "8px",
          color: "#cccccc",
          fontFamily: "monospace",
        },
      );
      this.partySprites[p.name].hpBar = {
        bg,
        ghost,
        fill,
        label: hpLabel,
        width: bw,
        currentHP: Math.max(0, p.hp | 0),
        maxHP: p.max_hp,
      };

      if (p.max_mp > 0) {
        const mpBarY = barY + 8;
        const mpFillW = hpBarFillWidth(p.mp, p.max_mp, bw);
        this.add
          .rectangle(barX, mpBarY, bw, 4, 0x112244)
          .setOrigin(0, 0.5)
          .setDepth(8);
        this.add
          .rectangle(barX, mpBarY, mpFillW, 4, alive ? 0x4488ff : 0x222244)
          .setOrigin(0, 0.5)
          .setDepth(10);
        this.add.text(x + 90 + bw + 5, y + 18, `${p.mp}/${p.max_mp}`, {
          fontSize: "8px",
          color: alive ? "#88aaff" : "#444466",
          fontFamily: "monospace",
        });
      }

      // Status effect icon
      if (p.status && STATUS_ICONS[p.status]) {
        const iconKey = STATUS_ICONS[p.status];
        if (this.textures.exists(iconKey)) {
          const icon = this.add.image(x + 35, y - 20, iconKey).setDepth(10);
          icon.setScale(16 / Math.max(icon.width, icon.height));
        }
      }
    }
  }

  drawLog(gs) {
    this.add.rectangle(400, 488, 780, 55, 0x000000, 0.85);
    const log = gs.combat_log || [];
    for (let i = 0; i < Math.min(log.length, 3); i++) {
      this.add.text(20, 498 - i * 16, log[log.length - 1 - i], {
        fontSize: "10px",
        color: "#cccccc",
        fontFamily: "monospace",
        wordWrap: { width: 760 },
      });
    }
  }

  drawActions(gs, slot) {
    // Remove old buttons
    if (this.actionBtns) {
      this.actionBtns.forEach((o) => o.destroy());
    }
    this.actionBtns = [];

    const member = gs.party[slot];
    const btns = buildBattleActionButtons({
      member,
      gameState: gs,
      hasLastRound: !!this.lastRoundActions,
      autoMode: this.autoMode,
    });

    const tw = btns.length * 145,
      sx = 400 - tw / 2 + 72;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i],
        x = sx + i * 145;
      const bg = this.add
        .rectangle(x, 555, 125, 30, 0x1a1a44)
        .setStrokeStyle(1, 0x444488)
        .setInteractive({ useHandCursor: true });
      const txt = this.add
        .text(x, 555, b.label, {
          fontSize: "12px",
          color: b.color,
          fontFamily: "monospace",
        })
        .setOrigin(0.5);

      this.actionBtns.push(bg, txt);

      bg.on("pointerover", () => bg.setFillStyle(0x2a2a66));
      bg.on("pointerout", () => bg.setFillStyle(0x1a1a44));
      bg.on("pointerdown", () => {
        if (this.animating) return;
        // Any manual action cancels auto-mode (issue #99)
        if (b.type !== "repeat" && b.type !== "auto" && this.autoMode) {
          this.autoMode = false;
        }
        if (b.type === "attack") {
          this.pendingAction = "attack";
          this.enterTargetingMode();
          this.promptText
            .setText(`${member.name}: Select a target to attack!`)
            .setColor("#ff4444");
        } else if (b.type === "spell") {
          this.showSpellPicker(slot);
        } else if (b.type === "ability") {
          this.showAbilityPicker(slot);
        } else if (b.type === "item") {
          this.showItemPicker(slot);
        } else if (b.type === "smart") {
          this.executeSmartAttack();
        } else if (b.type === "flee") {
          // Flee sends immediately (whole party flees)
          this.doFlee();
        } else if (b.type === "repeat") {
          this.executeRepeat();
        } else if (b.type === "auto") {
          this.autoMode = !this.autoMode;
          if (this.autoMode) {
            this.executeRepeat();
          } else {
            // Redraw buttons to update AUTO label
            this.drawActions(gs, slot);
          }
        }
      });
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
      this.recordAction(slot, {
        slot,
        type: "spell",
        target_id: enemyId,
        spell_id: this.pendingSpellId,
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
      this.recordAction(slot, {
        slot,
        type: "spell",
        target_id: targetSlot,
        spell_id: this.pendingSpellId,
      });
    }
  }

  recordAction(slot, action) {
    const member = this.gameState.party[slot];
    const actionName =
      action.type === "spell"
        ? "casts spell"
        : action.type === "item"
          ? "uses potion"
          : "attacks";
    this.promptText
      .setText(`${member.name} ${actionName}!`)
      .setColor("#44ff44");

    this.memberActions.push(action);
    this.currentMemberIdx++;

    // Brief pause then show next member's turn
    this.scaledDelay(400, () => this.showCurrentMemberTurn());
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

    // Remove old action buttons
    if (this.actionBtns) {
      this.actionBtns.forEach((o) => o.destroy());
      this.actionBtns = [];
    }

    this.promptText
      .setText(this.autoMode ? "AUTO-BATTLE..." : "REPEAT!")
      .setColor(this.autoMode ? "#ff8844" : "#44ccff");
    this.currentMemberIdx = this.livingMembers.length; // skip per-member UI
    this.submitAllActions();
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
  }

  exitTargetingMode() {
    this.targetingMode = false;
    this.livingEnemies = [];
    this.livingPartyTargets = [];

    // Dim enemy number indicators
    for (const en of this.enemyNumbers) {
      en.text.setAlpha(0.3);
    }

    // Remove highlight
    if (this.targetHighlightTween) {
      this.targetHighlightTween.stop();
      this.targetHighlightTween = null;
    }
    if (this.targetHighlight) {
      this.targetHighlight.destroy();
      this.targetHighlight = null;
    }
  }

  updateTargetHighlight() {
    if (this.targetingMode !== "enemy" || this.livingEnemies.length === 0)
      return;

    const enemy = this.livingEnemies[this.selectedTargetIdx];
    const es = this.enemySprites[enemy.id];
    if (!es) return;

    // Remove old highlight
    if (this.targetHighlightTween) {
      this.targetHighlightTween.stop();
      this.targetHighlightTween = null;
    }
    if (this.targetHighlight) {
      this.targetHighlight.destroy();
    }

    // Create pulsing highlight around selected enemy
    const sz = enemy.name === "Dark Knight" ? 90 : 60;
    this.targetHighlight = this.add
      .rectangle(es.x, es.y, sz, sz)
      .setStrokeStyle(2, 0xffff44)
      .setFillStyle(0xffff44, 0.1)
      .setDepth(9);

    this.targetHighlightTween = this.tweens.add({
      targets: this.targetHighlight,
      alpha: { from: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Show the position number from the full enemy list (matches displayed number)
    const fullIdx = this.gameState.enemies.findIndex((e) => e.id === enemy.id);
    this.promptText.setText(`Target: ${enemy.name} [${fullIdx + 1}]`);
  }

  updatePartyTargetHighlight() {
    if (this.targetingMode !== "party" || this.livingPartyTargets.length === 0)
      return;

    const target = this.livingPartyTargets[this.selectedPartyIdx];
    const ps = this.partySprites[target.name];
    if (!ps) return;

    if (this.targetHighlightTween) {
      this.targetHighlightTween.stop();
      this.targetHighlightTween = null;
    }
    if (this.targetHighlight) {
      this.targetHighlight.destroy();
    }

    this.targetHighlight = this.add
      .rectangle(ps.x, ps.y, 60, 60)
      .setStrokeStyle(2, 0x44ff44)
      .setFillStyle(0x44ff44, 0.15)
      .setDepth(9);

    this.targetHighlightTween = this.tweens.add({
      targets: this.targetHighlight,
      alpha: { from: 1, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    this.promptText.setText(`Target: ${target.name} [${target.slot + 1}]`);
  }

  showSpellPicker(slot) {
    const gs = this.gameState;
    const member = gs.party[slot];
    if (!member?.spells) return;

    const currentMP = member.mp ?? 0;
    const spells = member.spells.filter((s) => currentMP >= (s.mp_cost ?? 0));
    if (!spells.length) return;

    const ol = [];
    const h = 50 + spells.length * 32;
    const bg = this.add
      .rectangle(400, 380, 320, h, 0x111144, 0.95)
      .setStrokeStyle(2, 0x4444aa)
      .setDepth(50)
      .setInteractive();
    ol.push(bg);

    ol.push(
      this.add
        .text(400, 380 - h / 2 + 15, `${member.name}'s spells:`, {
          fontSize: "12px",
          color: "#ffffff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setDepth(51),
    );

    this.pickerItems = [];
    for (let i = 0; i < spells.length; i++) {
      const sp = spells[i];
      const y = 380 - h / 2 + 40 + i * 32;
      const row = this.add
        .rectangle(400, y, 280, 26, 0x222255)
        .setInteractive({ useHandCursor: true })
        .setDepth(51);
      const txt = this.add
        .text(400, y, `${i + 1}. ${sp.name} (${sp.mp_cost} MP)`, {
          fontSize: "11px",
          color: "#aaaaff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setDepth(52);
      ol.push(row, txt);

      const selectSpell = () => {
        this.closePicker();
        // The server marks each spell with castable_in_combat based on
        // whether the combat dispatch switch handles its effect. Reject
        // any spell that flag rules out (Light, Resurrect, ...) so a
        // utility cast does not silently consume a charge.
        if (sp.castable_in_combat === false) {
          this.pendingAction = null;
          this.pendingSpellId = null;
          this.pendingSpellEffect = null;
          this.promptText
            .setText(`${sp.name} cannot be cast in combat.`)
            .setColor("#ff8888");
          return;
        }
        this.pendingAction = "spell";
        this.pendingSpellId = sp.id;
        this.pendingSpellEffect = sp.effect;
        const t = sp.target;
        if (t === "single_ally") {
          this.enterPartyTargetingMode();
          this.promptText
            .setText(`${member.name}: Cast ${sp.name} on an ally`)
            .setColor("#88ff88");
        } else if (t === "all_allies" || t === "party") {
          // No target picker needed -- resolve immediately.
          this.pendingAction = null;
          this.recordAction(slot, {
            slot,
            type: "spell",
            target_id: -1,
            spell_id: sp.id,
          });
        } else {
          // single_enemy, all_enemies (or missing target field): enemy picker.
          this.enterTargetingMode();
          this.promptText
            .setText(`${member.name}: Cast ${sp.name} -- select a target!`)
            .setColor("#8888ff");
        }
      };

      this.pickerItems.push({ action: selectSpell });

      row.on("pointerover", () => {
        row.setFillStyle(0x3333aa);
        txt.setColor("#ffffff");
      });
      row.on("pointerout", () => {
        row.setFillStyle(0x222255);
        txt.setColor("#aaaaff");
      });
      row.on("pointerdown", selectSpell);
    }

    const cancel = this.add
      .text(400, 380 + h / 2 - 15, "[ CANCEL / ESC ]", {
        fontSize: "10px",
        color: "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setInteractive({ useHandCursor: true });
    cancel.on("pointerdown", () => this.closePicker());
    ol.push(cancel);

    this.pickerOverlay = ol;
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

    const ol = [];
    const h = 60 + abilities.length * 36;
    const bg = this.add
      .rectangle(400, 370, 360, h, 0x331144, 0.95)
      .setStrokeStyle(2, 0xaa44aa)
      .setDepth(50)
      .setInteractive();
    ol.push(bg);

    ol.push(
      this.add
        .text(400, 370 - h / 2 + 16, `${member.name}'s abilities:`, {
          fontSize: "12px",
          color: "#ffffff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setDepth(51),
    );

    this.pickerItems = [];
    for (let i = 0; i < abilities.length; i++) {
      const id = abilities[i];
      const m = meta[id] || { label: id, desc: "", targeted: true };
      const y = 370 - h / 2 + 46 + i * 36;
      const row = this.add
        .rectangle(400, y, 320, 30, 0x442255)
        .setInteractive({ useHandCursor: true })
        .setDepth(51);
      const txt = this.add
        .text(400, y, `${i + 1}. ${m.label} - ${m.desc}`, {
          fontSize: "11px",
          color: "#ffaaff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setDepth(52);
      ol.push(row, txt);

      const selectAbility = () => {
        this.closePicker();
        this.pendingAbilityId = id;
        if (m.targeted) {
          this.pendingAction = "ability";
          this.enterTargetingMode();
          this.promptText
            .setText(`${member.name}: ${m.label} -- select a target!`)
            .setColor("#ff88ff");
        } else {
          // Self/party target: send action immediately with target_id=0.
          this.recordAction(slot, {
            slot,
            type: "ability",
            target_id: 0,
            ability_id: id,
          });
        }
      };

      this.pickerItems.push({ action: selectAbility });

      row.on("pointerover", () => {
        row.setFillStyle(0x663377);
        txt.setColor("#ffffff");
      });
      row.on("pointerout", () => {
        row.setFillStyle(0x442255);
        txt.setColor("#ffaaff");
      });
      row.on("pointerdown", selectAbility);
    }

    const cancel = this.add
      .text(400, 370 + h / 2 - 15, "[ CANCEL / ESC ]", {
        fontSize: "10px",
        color: "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setInteractive({ useHandCursor: true });
    cancel.on("pointerdown", () => this.closePicker());
    ol.push(cancel);

    this.pickerOverlay = ol;
  }

  showItemPicker(slot) {
    // Delegate to the shared FF-style Item menu (issue #144). It renders
    // the scrollable list + filter tabs + description line + target picker,
    // then calls back once the player has committed a choice. We pipe that
    // into recordAction so the existing per-member submit flow below is
    // untouched.
    this.pickerItems = [];
    const handle = showItemMenu(this, {
      mode: "combat",
      onConfirm: (item, targetSlot) => {
        this.recordAction(slot, {
          slot,
          type: item.id === "phoenix_down" ? "revive" : "item",
          target_id: targetSlot,
          item_id: item.id,
        });
      },
    });
    // Route closePicker() through the overlay handle so ESC/cancel paths
    // upstream of this method still tear it down. closePicker walks
    // pickerOverlay with .forEach((o) => o.destroy()).
    this.pickerOverlay = [{ destroy: () => handle.close() }];
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
    this.promptText.setText("");
    const result = await gameAction(this.gameState.id, { type: "flee" });
    this.gameState = result;
    this.scaledDelay(300, () => {
      this.animating = false;
      if (result.phase !== "combat") {
        this.scene.start("World", { gameState: result });
      } else {
        this.scene.restart({ gameState: result });
      }
    });
  }

  async submitAllActions() {
    this.animating = true;
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

      // Reconcile enemy sprites with the authoritative server state BEFORE
      // we restart the scene. The server only sends living enemies in
      // result.enemies, so any sprite whose id is missing from that list
      // has been defeated — even if no action carried `Killed: true` for
      // it (e.g. a poison-tick kill paired with a parser miss). Without
      // this pass, the sprite would linger until scene.restart fires,
      // which is exactly the "enemy with 1 HP after a fatal hit" visual
      // the user filed in issue #69.
      await this.reconcileEnemySprites(result.enemies || []);

      this.gameState = result;

      // Persist this round's actions for REPEAT / AUTO from the
      // authoritative server state, not browser storage.
      const savedActions = normalizeLastRoundActions(result.last_round_actions);

      this.scaledDelay(400, () => {
        this.animating = false;
        if (this.gameState.phase !== "combat") {
          this.autoMode = false;
          this.showVictoryResults(this.gameState);
        } else {
          this.scene.restart({
            gameState: this.gameState,
            lastRoundActions: savedActions,
            autoMode: this.autoMode,
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
    this.promptText.setText("Combat error — recovering...").setColor("#ff8844");
    try {
      const fresh = await getGame(this.gameState.id);
      if (fresh && !fresh.error) {
        this.gameState = fresh;
        this.time.delayedCall(600, () => {
          this.animating = false;
          if (fresh.phase === "combat") {
            this.scene.restart({ gameState: fresh });
          } else {
            this.scene.start("World", { gameState: fresh });
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
      this.scene.start("World", { gameState: this.gameState });
    });
  }

  async animateCombatLog(log, actions) {
    for (let i = 0; i < log.length; i++) {
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
        (attackMatch && action.kind !== "spell")
      ) {
        const attacker = action.actor_name || (attackMatch && attackMatch[1]);
        const targetId =
          action.target_id || (attackMatch && parseInt(attackMatch[3]));
        const dmg = action.damage || (attackMatch && parseInt(attackMatch[4]));
        const dmgType = action.damage_type || "physical";

        // Party member lunge toward target
        const pe = this.partySprites[attacker];
        const ee = this.enemySprites[targetId];
        if (pe && ee) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.revealLine(`${attacker} attacks!`, "#ff4444");
          // Lunge toward enemy position
          const dx = ee.x - pe.x,
            dy = ee.y - pe.y;
          const lungeX = pe.x + dx * 0.4,
            lungeY = pe.y + dy * 0.4;
          await this.tweenP(pe.sprite, {
            x: lungeX,
            y: lungeY,
            duration: 150,
            ease: "Power2",
          });
          await this.tweenP(pe.sprite, {
            x: pe.x,
            y: pe.y,
            duration: 100,
            ease: "Power1",
          });
        } else if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.revealLine(`${attacker} attacks!`, "#ff4444");
          await this.tweenP(pe.sprite, { x: pe.x - 30, duration: 150 });
          await this.tweenP(pe.sprite, { x: pe.x, duration: 100 });
        }

        // Hit effect on target
        playSFX("sfx_slash");
        const pt =
          this.partySprites[action.target_name] ||
          this.partySprites[attackMatch?.[2]];
        if (ee) {
          const targetKey = `enemy_${targetId}`;
          playSFX(defeatMatch ? "sfx_death" : "sfx_hit");
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch, dmgType, {
            crit: action.crit,
            missed: action.missed,
            targetKey,
          });
          if (ee.sprite.setTint) {
            ee.sprite.setTint(0xff4444);
            this.scaledDelay(200, () => ee.sprite.clearTint?.());
          }
          // Animate HP bar drain — integer math only, see systems/hpBar.js
          if (ee.hpBar) {
            const newHP = applyDamage(ee.hpBar.currentHP, dmg);
            this.animateHPBar(ee.hpBar, newHP, ee.hpBar.maxHP);
          }
          // Enemy death animation
          if (defeatMatch) await this.enemyDeathFx(ee);
        } else if (pt) {
          const targetKey = `party_${action.target_name || attackMatch?.[2]}`;
          const atkName = action.actor_name || attackMatch?.[1] || attacker;
          const tgtName = action.target_name || attackMatch?.[2] || "";
          this.revealLine(`${atkName} attacks ${tgtName}!`, "#ff8800");
          playSFX("sfx_party_hit");
          await this.hitFx(pt.x, pt.y, dmg, true, false, dmgType, {
            crit: action.crit,
            missed: action.missed,
            targetKey,
          });
          if (pt.sprite.setTint) {
            pt.sprite.setTint(0xff4444);
            this.scaledDelay(200, () => pt.sprite.clearTint?.());
          }
          // Animate party HP bar drain — integer math only
          if (pt.hpBar) {
            const newHP = applyDamage(pt.hpBar.currentHP, dmg);
            this.animateHPBar(pt.hpBar, newHP, pt.hpBar.maxHP);
          }
          this.cameras.main.shake(80, 0.005);
        }
        await this.wait(200);
      } else if (action.kind === "counter" || counterMatch) {
        const actorName =
          action.actor_name || (counterMatch && counterMatch[1]);
        const targetId =
          action.target_id || (counterMatch && parseInt(counterMatch[4]));
        const dmg =
          action.damage || (counterMatch && parseInt(counterMatch[5]));
        const dmgType = action.damage_type || "physical";
        this.revealLine(line, "#ff8800");
        playSFX("sfx_slash");
        const ee = this.enemySprites[targetId];
        if (ee) {
          const targetKey = `enemy_${targetId}`;
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch, dmgType, {
            crit: action.crit,
            missed: action.missed,
            targetKey,
          });
          if (ee.hpBar) {
            const newHP = applyDamage(ee.hpBar.currentHP, dmg);
            this.animateHPBar(ee.hpBar, newHP, ee.hpBar.maxHP);
          }
          if (defeatMatch) await this.enemyDeathFx(ee);
        }
        await this.wait(200);
      } else if (action.kind === "spell" || spellMatch) {
        const caster = action.actor_name || (spellMatch && spellMatch[1]);
        const spellName = action.spell_name || (spellMatch && spellMatch[2]);
        const targetId =
          action.target_id || (spellMatch && parseInt(spellMatch[4]));
        const dmg = action.damage || (spellMatch && parseInt(spellMatch[5]));
        const element = action.element || "none";
        const dmgType = action.damage_type || "magical";

        const pe = this.partySprites[caster];
        if (pe) {
          for (const a of this.partyArrows) a.setVisible(false);
          pe.arrow.setVisible(true);
          this.promptText
            .setText(`${caster} casts ${spellName}!`)
            .setColor("#8888ff");
        }

        // Element-specific SFX and flash
        const sfx = ELEMENT_SFX[element] || "sfx_spell";
        playSFX(sfx);
        const flashColor = ELEMENT_FLASH[element] || 0x4444ff;
        const flash = this.add
          .rectangle(400, 300, 800, 600, flashColor, 0.2)
          .setDepth(19);
        this.scaledDelay(200, () => flash.destroy());

        // Check for multi-target: group consecutive entries with same caster + spell
        const targets = [{ targetId, dmg, defeated: defeatMatch }];
        while (i + 1 < log.length) {
          const nextAction = actions[i + 1] || {};
          if (
            nextAction.kind === "spell" &&
            nextAction.actor_name === caster &&
            nextAction.spell_name === spellName
          ) {
            i++;
            targets.push({
              targetId: nextAction.target_id,
              dmg: nextAction.damage,
              defeated: log[i].includes("DEFEATED"),
            });
          } else {
            break;
          }
        }

        // Animate each target with stagger
        const particleColor = ELEMENT_COLORS[element] || 0x8888ff;
        for (let t = 0; t < targets.length; t++) {
          const tgt = targets[t];
          const ee = this.enemySprites[tgt.targetId];
          if (ee) {
            for (let j = 0; j < 6; j++) {
              const px = ee.x + Phaser.Math.Between(-25, 25);
              const py = ee.y + Phaser.Math.Between(-25, 25);
              const p = this.add.circle(px, py, 4, particleColor).setDepth(20);
              this.tweens.add({
                targets: p,
                y: py - 30,
                alpha: 0,
                duration: 400,
                onComplete: () => p.destroy(),
              });
            }
            const targetKey = `enemy_${tgt.targetId}`;
            await this.hitFx(
              ee.x,
              ee.y,
              tgt.dmg,
              false,
              tgt.defeated,
              dmgType,
              { targetKey, element },
            );
            if (ee.hpBar) {
              const newHP = applyDamage(ee.hpBar.currentHP, tgt.dmg);
              this.animateHPBar(ee.hpBar, newHP, ee.hpBar.maxHP);
            }
            if (tgt.defeated) await this.enemyDeathFx(ee);
          }
          if (t < targets.length - 1) await this.wait(200);
        }
        await this.wait(250);
      } else if (action.kind === "heal" || line.includes("healed")) {
        this.revealLine(line, "#44ff44");
        const healMatch = line.match(/healed (\d+)/);
        if (healMatch) {
          playSFX("sfx_heal");
          const healTarget =
            this.partySprites[action.target_name] ||
            this.partySprites[action.actor_name];
          const hx = healTarget ? healTarget.x : 600;
          const hy = healTarget ? healTarget.y : 220;
          const targetKey = healTarget
            ? `party_${action.target_name || action.actor_name}`
            : "party_heal";
          this.floatingText.spawn(hx, hy, healMatch[1], "heal", targetKey);
          // Animate HP bar up — integer math only
          if (healTarget?.hpBar) {
            const newHP = applyHeal(
              healTarget.hpBar.currentHP,
              healMatch[1],
              healTarget.hpBar.maxHP,
            );
            this.animateHPBar(healTarget.hpBar, newHP, healTarget.hpBar.maxHP);
          }
        }
        await this.wait(300);
      } else if (line.includes("Found:")) {
        this.revealLine(line, "#44ff44");
        await this.wait(400);
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
          if (sprite.hpBar) {
            const newHP = applyDamage(sprite.hpBar.currentHP, dmg);
            this.animateHPBar(sprite.hpBar, newHP, sprite.hpBar.maxHP);
          }
          if (ee && defeatMatch) await this.enemyDeathFx(ee);
        }
        await this.wait(300);
      } else if (action.kind === "confusion") {
        // Confused actor attacks randomly — target may be ally or enemy
        const targetId = action.target_id;
        const dmg = action.damage;
        this.revealLine(line, "#dddd44");
        playSFX("sfx_hit");
        const ee = this.enemySprites[targetId];
        if (ee) {
          await this.hitFx(ee.x, ee.y, dmg, false, defeatMatch, "physical");
          if (defeatMatch) await this.enemyDeathFx(ee);
        } else {
          // Target is a party member — find by slot ID
          const gs = this.gameState;
          const targetMember =
            gs.party && gs.party[targetId]
              ? this.partySprites[gs.party[targetId].name]
              : null;
          if (targetMember) {
            await this.hitFx(
              targetMember.x,
              targetMember.y,
              dmg,
              true,
              false,
              "physical",
            );
            if (targetMember.sprite?.setTint) {
              targetMember.sprite.setTint(0xff4444);
              this.scaledDelay(200, () => targetMember.sprite.clearTint?.());
            }
          }
          this.cameras.main.shake(80, 0.005);
        }
        await this.wait(300);
      } else if (action.kind === "status_effect") {
        // Status spell landed or resisted
        this.revealLine(line, "#cc88ff");
        await this.wait(400);
      } else if (action.kind === "ability") {
        this.revealLine(line, "#ff88ff");
        // Backstab with damage gets hit effect
        if (action.damage > 0) {
          playSFX("sfx_slash");
          const ee = this.enemySprites[action.target_id];
          if (ee) {
            const targetKey = `enemy_${action.target_id}`;
            await this.hitFx(
              ee.x,
              ee.y,
              action.damage,
              false,
              defeatMatch,
              action.damage_type || "physical",
              { crit: action.crit, targetKey },
            );
            if (ee.hpBar) {
              const newHP = applyDamage(ee.hpBar.currentHP, action.damage);
              this.animateHPBar(ee.hpBar, newHP, ee.hpBar.maxHP);
            }
            if (defeatMatch) await this.enemyDeathFx(ee);
          }
        }
        await this.wait(300);
      }
    }
  }

  hitFx(x, y, dmg, isParty, defeated, damageType, opts = {}) {
    return new Promise((resolve) => {
      // Slash graphic (kept from original)
      const g = this.add.graphics().setDepth(20);
      g.lineStyle(3, isParty ? 0xff8800 : 0xffffff, 1);
      g.lineBetween(x - 20, y - 15, x + 20, y + 15);
      this.scaledDelay(150, () => g.destroy());

      const targetKey = opts.targetKey || `pos_${x}_${y}`;

      // Determine floating text type
      if (opts.missed) {
        this.floatingText.spawn(x, y, 0, "miss", targetKey);
      } else if (opts.crit) {
        this.floatingText.spawn(x, y, dmg, "crit", targetKey);
      } else if (isParty) {
        this.floatingText.spawn(x, y, dmg, "party_hit", targetKey);
      } else if (damageType === "magical") {
        this.floatingText.spawn(x, y, dmg, "magical", targetKey, {
          element: opts.element,
        });
      } else {
        this.floatingText.spawn(x, y, dmg, "physical", targetKey);
      }

      if (defeated) {
        this.floatingText.spawn(x, y + 30, 0, "defeated", targetKey);
      }

      this.scaledDelay(150, resolve);
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
      ee.hpBar.bg.setVisible(false);
      ee.hpBar.ghost.setVisible(false);
      ee.hpBar.fill.setVisible(false);
      ee.hpBar.label.setVisible(false);
      ee.hpBar.fill.width = 0;
      ee.hpBar.ghost.width = 0;
      ee.hpBar.currentHP = 0;
      ee.hpBar.label.setText(formatHPLabel(0, ee.hpBar.maxHP));
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

    const bw = hpBarData.width;
    const fillW = hpBarFillWidth(clampedHP, maxHP, bw);
    const pct = hpBarColorPct(clampedHP, maxHP);
    const bc = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xff8800 : 0xff0000;

    // Immediately update fill bar — integer pixels, no sub-pixel sliver.
    hpBarData.fill.width = fillW;
    hpBarData.fill.setFillStyle(clampedHP > 0 ? bc : 0x333333);

    // Update HP label — integer-only via formatHPLabel.
    hpBarData.label.setText(formatHPLabel(clampedHP, maxHP));

    // Ghost bar drains after a short delay
    this.tweens.add({
      targets: hpBarData.ghost,
      width: fillW,
      duration: 250,
      delay: 100,
      ease: "Quad.Out",
    });

    hpBarData.currentHP = clampedHP;
  }

  showVictoryResults(gs) {
    this.children.removeAll(true);
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1e);

    this.victoryFastForwarded = false;
    this.victoryContinueShown = false;
    this.victoryFinalizers = [];
    this.victoryPendingTimers = [];
    this.victoryFFHandler = null;

    const isDefeat = gs.phase === "defeat";
    stopMusic();
    playMusic(isDefeat ? "music_defeat" : "music_victory", false);

    this.add
      .text(400, 30, isDefeat ? "DEFEAT" : "VICTORY!", {
        fontSize: "32px",
        color: isDefeat ? "#ff4444" : "#ffff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    if (isDefeat) {
      this.add
        .text(400, 100, gs.message || "Your party has fallen.", {
          fontSize: "14px",
          color: "#aaaaaa",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);

      // Defeat options
      const loadBtn = this.add
        .text(400, 300, "[ LOAD LAST SAVE ]", {
          fontSize: "18px",
          color: "#4488ff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      loadBtn.on("pointerover", () => loadBtn.setColor("#88bbff"));
      loadBtn.on("pointerout", () => loadBtn.setColor("#4488ff"));
      loadBtn.on("pointerdown", () => this.scene.start("Title"));

      const titleBtn = this.add
        .text(400, 360, "[ TITLE SCREEN ]", {
          fontSize: "18px",
          color: "#aaaaaa",
          fontFamily: "monospace",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      titleBtn.on("pointerover", () => titleBtn.setColor("#cccccc"));
      titleBtn.on("pointerout", () => titleBtn.setColor("#aaaaaa"));
      titleBtn.on("pointerdown", () => this.scene.start("Title"));

      return;
    }

    const log = gs.combat_log || [];

    // Rewards summary (gold, items)
    let y = 60;
    for (const l of log) {
      if (l.includes("Victory") || l.includes("Found:")) {
        this.add
          .text(400, y, l, {
            fontSize: "11px",
            color: "#44ff44",
            fontFamily: "monospace",
          })
          .setOrigin(0.5);
        y += 16;
      }
    }

    // Quest completions
    for (const l of log.filter((l) => l.includes("Quest complete"))) {
      this.add
        .text(400, y, l, {
          fontSize: "11px",
          color: "#44ccff",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);
      y += 16;
    }

    // Animated XP bars for each party member
    y += 15;
    const barW = 300;
    const xpBefore = gs.xp_before || [];
    const xpThresholds = gs.xp_thresholds || [];
    const diedFlags = gs.died_this_fight || [];

    for (let i = 0; i < gs.party.length; i++) {
      const p = gs.party[i];
      // A member who died mid-fight gets healed by restParty() before the
      // state reaches the client, so p.hp is back at full. died_this_fight
      // is the authoritative signal for victory-screen presentation.
      const diedThisFight = diedFlags[i] === true;
      const alive = !diedThisFight && p.hp > 0;
      const prevXP = xpBefore[i] || 0;

      // Character sprite + name
      const cs = CLASS_SPRITES[p.sprite_id || p.class_id];
      if (cs && this.textures.exists(cs)) {
        const sprite = this.add.image(100, y + 20, cs);
        sprite.setScale((40 / Math.max(sprite.width, sprite.height)) * 2);
        if (!alive) sprite.setTint(0x444444);
      }

      // Name and level
      this.add.text(140, y, `${p.name}`, {
        fontSize: "13px",
        color: alive ? "#ffffff" : "#666666",
        fontFamily: "monospace",
      });
      if (diedThisFight) {
        this.add.text(140 + p.name.length * 8 + 6, y, "— DEFEATED", {
          fontSize: "11px",
          color: "#ff4444",
          fontFamily: "monospace",
          fontStyle: "bold",
        });
      }
      const levelText = this.add.text(
        140,
        y + 16,
        `${p.class_name} Lv.${p.level}`,
        {
          fontSize: "10px",
          color: "#aaaaaa",
          fontFamily: "monospace",
        },
      );

      // HP bar
      this.add.text(300, y, "HP", {
        fontSize: "9px",
        color: "#888888",
        fontFamily: "monospace",
      });
      this.add.rectangle(300 + barW / 2 + 15, y + 4, barW, 8, 0x333333);
      const hpPct = Math.max(0, p.hp / p.max_hp);
      if (hpPct > 0) {
        const hpColor =
          hpPct > 0.5 ? 0x44ff44 : hpPct > 0.25 ? 0xff8800 : 0xff0000;
        this.add.rectangle(
          300 + 15 + (barW * hpPct) / 2,
          y + 4,
          barW * hpPct,
          8,
          hpColor,
        );
      }
      this.add.text(300 + barW + 20, y, `${p.hp}/${p.max_hp}`, {
        fontSize: "9px",
        color: "#cccccc",
        fontFamily: "monospace",
      });

      // XP bar with animation
      this.add.text(300, y + 18, "XP", {
        fontSize: "9px",
        color: diedThisFight ? "#555555" : "#888888",
        fontFamily: "monospace",
      });
      this.add.rectangle(300 + barW / 2 + 15, y + 22, barW, 10, 0x222244);

      const delay = 500 + i * 800;

      if (diedThisFight) {
        // Dead at victory resolution: no bar fill, no animation. Render a
        // static "0 XP / no gain" label so the player sees unambiguously
        // that the dead member did not share in the reward.
        this.add.text(300 + barW + 20, y + 17, `${prevXP}/${p.xp_next}`, {
          fontSize: "9px",
          color: "#666666",
          fontFamily: "monospace",
        });
      } else {
        const segments = buildVictoryXPSegments({
          prevXP,
          currentXP: p.xp,
          xpNext: p.xp_next,
          xpThresholds: xpThresholds[i] || [],
        });
        const firstSegment = segments[0] || null;
        const firstMax = firstSegment?.max || p.xp_next;
        const firstWidth =
          firstMax > 0 ? (barW * firstSegment.start) / firstMax : 0;

        const xpBarFill = this.add
          .rectangle(300 + 15, y + 22, firstWidth, 10, 0x4488ff)
          .setOrigin(0, 0.5);

        const xpText = this.add.text(
          300 + barW + 20,
          y + 17,
          `${firstSegment?.start ?? prevXP}/${firstMax || p.xp_next}`,
          {
            fontSize: "9px",
            color: "#8888ff",
            fontFamily: "monospace",
          },
        );

        const xpTweens = [];
        const animateSegment = (segmentIdx) => {
          if (segmentIdx >= segments.length) {
            xpBarFill.width = p.xp_next > 0 ? (barW * p.xp) / p.xp_next : 0;
            xpText.setText(`${p.xp}/${p.xp_next}`);
            return;
          }

          const segment = segments[segmentIdx];
          const startWidth =
            segment.max > 0 ? (barW * segment.start) / segment.max : 0;
          const endWidth =
            segment.max > 0 ? (barW * segment.end) / segment.max : 0;
          xpBarFill.width = startWidth;
          xpText.setText(`${segment.start}/${segment.max}`);

          if (segment.start === segment.end) {
            xpText.setText(`${segment.end}/${segment.max}`);
            animateSegment(segmentIdx + 1);
            return;
          }

          const tween = this.tweens.add({
            targets: xpBarFill,
            width: endWidth,
            duration: Math.max(150, Math.floor(1200 / segments.length)),
            ease: "Power2",
            onUpdate: () => {
              const denom = endWidth - startWidth;
              const progress =
                denom === 0 ? 1 : (xpBarFill.width - startWidth) / denom;
              const currentXP = Math.floor(
                segment.start + (segment.end - segment.start) * progress,
              );
              xpText.setText(
                `${Math.min(currentXP, segment.end)}/${segment.max}`,
              );
            },
            onComplete: () => {
              xpBarFill.width = endWidth;
              xpText.setText(`${segment.end}/${segment.max}`);
              animateSegment(segmentIdx + 1);
            },
          });
          xpTweens.push(tween);
        };

        const xpTimer = this.time.delayedCall(delay, () => animateSegment(0));
        this.victoryPendingTimers.push({
          timer: xpTimer,
          finalize: () => {
            for (const tween of xpTweens) tween.stop();
            xpBarFill.width = p.xp_next > 0 ? (barW * p.xp) / p.xp_next : 0;
            xpText.setText(`${p.xp}/${p.xp_next}`);
          },
        });
        this.victoryFinalizers.push(() => {
          for (const tween of xpTweens) tween.stop();
          xpBarFill.width = p.xp_next > 0 ? (barW * p.xp) / p.xp_next : 0;
          xpText.setText(`${p.xp}/${p.xp_next}`);
        });
      }

      // Check for level up -- flash effect (capture y in closure)
      // A dead-at-victory member cannot have leveled up, so skip the check.
      const leveledUp =
        !diedThisFight && log.some((l) => l.includes(`${p.name} leveled up`));
      if (leveledUp) {
        const memberY = y; // capture current y for this member
        const runLevelUp = (instant) => {
          // Flash on THIS member's row
          const flash = this.add.rectangle(
            400,
            memberY + 20,
            700,
            50,
            0xffff44,
            0.3,
          );
          // Level up text next to this member
          const lvlUpText = this.add
            .text(650, memberY + 12, "LEVEL UP!", {
              fontSize: "14px",
              color: "#ffff44",
              fontFamily: "monospace",
              fontStyle: "bold",
            })
            .setOrigin(0.5)
            .setAlpha(instant ? 1 : 0);

          if (instant) {
            flash.destroy();
          } else {
            const flashTween = this.tweens.add({
              targets: flash,
              alpha: 0,
              duration: 600,
              onComplete: () => flash.destroy(),
            });
            const textTween = this.tweens.add({
              targets: lvlUpText,
              alpha: 1,
              duration: 300,
            });
            this.victoryFinalizers.push(() => {
              flashTween.stop();
              if (flash.active) flash.destroy();
            });
            this.victoryFinalizers.push(() => {
              textTween.stop();
              lvlUpText.setAlpha(1);
            });
          }

          // Update level display
          levelText
            .setText(`${p.class_name} Lv.${p.level}`)
            .setColor("#ffff44");
        };

        const lvlTimer = this.time.delayedCall(delay + 1300, () =>
          runLevelUp(false),
        );
        this.victoryPendingTimers.push({
          timer: lvlTimer,
          finalize: () => runLevelUp(true),
        });
      }

      // Stats row
      this.add.text(
        140,
        y + 35,
        `STR:${p.str}  AGI:${p.agi}  INT:${p.int_stat}`,
        { fontSize: "8px", color: "#888888", fontFamily: "monospace" },
      );

      y += 65;
    }

    // Gold and items
    y += 5;
    this.add
      .text(
        400,
        y,
        `Gold: ${gs.gold}  |  Potions: ${gs.potions}  |  Ether: ${(gs.ethers || 0) + (gs.hi_ethers || 0) + (gs.x_ethers || 0)}`,
        {
          fontSize: "12px",
          color: "#ffcc44",
          fontFamily: "monospace",
        },
      )
      .setOrigin(0.5);

    // Items found
    if (gs.items && gs.items.length > 0) {
      y += 18;
      const itemStr = gs.items.map((i) => `${i.name}(${i.count})`).join(", ");
      this.add
        .text(400, y, `Items: ${itemStr}`, {
          fontSize: "10px",
          color: "#aaaaaa",
          fontFamily: "monospace",
        })
        .setOrigin(0.5);
    }

    // Delay continue button to let animations play
    const contTimer = this.time.delayedCall(
      500 + gs.party.length * 800 + 1000,
      () => this.finalizeVictory(gs),
    );
    this.victoryPendingTimers.push({
      timer: contTimer,
      finalize: () => this.finalizeVictory(gs),
    });

    // SPACE during the sequence fast-forwards every in-flight animation.
    this.victoryFFHandler = () => this.fastForwardVictoryResults(gs);
    this.input.keyboard.on("keydown-SPACE", this.victoryFFHandler);
  }

  fastForwardVictoryResults(gs) {
    if (this.victoryFastForwarded) return;
    this.victoryFastForwarded = true;

    const first = this.victoryFinalizers;
    this.victoryFinalizers = [];
    for (const fn of first) fn();

    const timers = this.victoryPendingTimers;
    this.victoryPendingTimers = [];
    for (const { timer, finalize } of timers) {
      if (timer && !timer.hasDispatched) {
        timer.remove(false);
      }
      finalize();
    }

    // Level-up finalizers may have pushed additional flash/text finalizers;
    // snap those too so nothing is left mid-tween.
    const late = this.victoryFinalizers;
    this.victoryFinalizers = [];
    for (const fn of late) fn();
  }

  finalizeVictory(gs) {
    if (this.victoryContinueShown) return;
    this.victoryContinueShown = true;
    if (this.victoryFFHandler) {
      this.input.keyboard.off("keydown-SPACE", this.victoryFFHandler);
      this.victoryFFHandler = null;
    }
    this.addContinueButton(gs);
  }

  addContinueButton(gs) {
    const btn = this.add
      .text(400, 545, "[ CONTINUE ]", {
        fontSize: "20px",
        color: "#44ff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setColor("#88ff88"));
    btn.on("pointerout", () => btn.setColor("#44ff44"));
    btn.on("pointerdown", () => this.scene.start("World", { gameState: gs }));
    this.input.keyboard.on("keydown-ENTER", () =>
      this.scene.start("World", { gameState: gs }),
    );
    this.input.keyboard.on("keydown-SPACE", () =>
      this.scene.start("World", { gameState: gs }),
    );
  }
}
