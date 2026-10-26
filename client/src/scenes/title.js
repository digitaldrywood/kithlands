import quickStartDefaults from "../../../shared/quick_start.json";
import {
  debugCreateShowcase,
  login,
  setToken,
  newGame,
  listSaves,
  loadSave,
} from "../api.js";
import { initAudio, playMusic, playSFX } from "../systems/audio.js";
import {
  getEmail,
  setEmail,
  getLastWizard,
  setLastWizard,
} from "../systems/prefs.js";
import { buildWalkAuditParty, walkAuditRequested } from "./walkAuditMode.js";

import { renderSaveAdventures } from "../ui/title_saves.js";
import { titleScreen, titleAccount } from "../ui/title_screen.js";
import { element } from "../ui/viewport_dialog.js";
import { clearQuestMilestones } from "../ui/quest_milestone.js";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("Title");
  }

  create(data = {}) {
    clearQuestMilestones();
    // World and party menus can use a tall portrait canvas.
    this.scale.setGameSize(800, 600);
    this.showMainMenu();
    if (data.openSaves) void this.showLoadScreen();
  }

  clearMenu() {
    this.titleView?.dispose();
    this.titleView = null;
    // DisplayList.removeAll(true) skips callbacks; it does not destroy objects.
    // Destroy a snapshot so native DOM inputs are removed before the list changes.
    this.children.list.slice().forEach((child) => child.destroy());
  }

  showMainMenu() {
    initAudio(this);
    playMusic("music_title");
    this.clearMenu();

    const view = titleScreen(this);
    this.titleView = view;
    this.statusText = view.statusText;
    const inputEl = titleAccount(view.body, getEmail());
    inputEl.addEventListener("input", () => view.statusText.setText(""));
    view.action(
      "New game",
      "Make your hometown a legend",
      () => this.startGame(inputEl, false),
      true,
    );
    view.action("Continue", "Load a saved adventure", () =>
      this.doLogin(inputEl, () => this.showLoadScreen()),
    );
    const last = getLastWizard();
    view.action("Quick start", last?.town_name || "Explore Cadott", () =>
      this.startGame(inputEl, true),
    );
    if (import.meta.env?.DEV) {
      const tools = element("details", "title-dev-tools");
      tools.append(element("summary", "", "Developer tools"));
      const showcase = element("button", "", "Systems showcase");
      showcase.type = "button";
      showcase.addEventListener("click", () => this.startShowcase());
      tools.append(showcase);
      view.body.append(tools);
    }

    if (
      import.meta.env?.DEV &&
      walkAuditRequested() &&
      !this.walkAuditStarted
    ) {
      this.walkAuditStarted = true;
      inputEl.value = `walk_audit_${Date.now()}@kithlands.dev`;
      this.time.delayedCall(0, () => this.startGame(inputEl, true));
    }
  }

  async doLogin(inputEl, callback) {
    const email = inputEl.value.trim();
    if (!email || !email.includes("@")) {
      this.statusText
        .setText("Please enter a valid email.")
        .setColor("#ff4444");
      return;
    }
    this.statusText.setText("Connecting...").setColor("#aaaaaa");
    try {
      const result = await login(email);
      if (!result.token) {
        this.statusText
          .setText(result.error || "Login failed.")
          .setColor("#ff4444");
        return;
      }
      setToken(result.token);
      setEmail(email);
      callback();
    } catch (e) {
      this.statusText
        .setText("Unable to connect. Please try again shortly.")
        .setColor("#ff4444");
    }
  }

  async showLoadScreen() {
    this.clearMenu();
    const view = titleScreen(this, "load");
    this.titleView = view;
    this.statusText = view.statusText;
    view.body.append(element("h2", "title-load-heading", "Your adventures"));
    const list = element("div", "title-saves");
    view.body.append(list);
    view.action("Back to main menu", "", () => this.showMainMenu());
    view.statusText.setText("Finding your saved adventures…");
    try {
      const result = await listSaves();
      if (this.titleView !== view) return;
      if (result.error) throw new Error(result.error);
      const saves = result.saves || [];
      view.statusText.setText(
        saves.length
          ? ""
          : "No saves yet. Start a new adventure to begin your story.",
      );
      renderSaveAdventures(list, saves, (id) => this.loadGameSave(id));
    } catch (error) {
      if (this.titleView === view)
        view.statusText
          .setText("Could not load your saves. Please try again.")
          .setColor("#ff4444");
    }
  }

  async loadGameSave(saveId) {
    try {
      const result = await loadSave(saveId);
      if (result.error) {
        this.statusText.setText(result.error).setColor("#ff4444");
        return;
      }
      console.log("[Title] save loaded, going to World");
      this.scene.start("World", { gameState: result });
    } catch (e) {
      this.statusText
        .setText("Could not load this save. Please try again.")
        .setColor("#ff4444");
    }
  }

  async startGame(inputEl, quick) {
    const email = inputEl.value.trim();
    if (!email || !email.includes("@")) {
      this.statusText
        .setText("Please enter a valid email.")
        .setColor("#ff4444");
      return;
    }

    this.statusText
      .setText(quick ? "Quick starting..." : "Connecting...")
      .setColor("#aaaaaa");

    try {
      const result = await login(email);
      if (!result.token) {
        this.statusText
          .setText(result.error || "Login failed.")
          .setColor("#ff4444");
        return;
      }
      setToken(result.token);
      setEmail(email); // remember email

      if (quick) {
        // Reuse the last town setup with the complete Quick Start party.
        const gameData = {
          ...quickStartDefaults,
          ...getLastWizard(),
          party: quickStartDefaults.party.map((member) => ({ ...member })),
        };
        console.log("[Title] quick start with", gameData.town_name);
        const gameResult = await newGame(gameData);

        if (gameResult.error) {
          this.statusText.setText(gameResult.error).setColor("#ff4444");
          return;
        }

        if (import.meta.env?.DEV && walkAuditRequested()) {
          gameResult.party = buildWalkAuditParty(gameResult.party);
          gameResult.walk_audit = true;
        }

        this.scene.start("World", { gameState: gameResult });
      } else {
        this.scene.start("Wizard");
      }
    } catch (e) {
      console.error("[Title] error:", e);
      this.statusText
        .setText("Unable to connect. Please try again shortly.")
        .setColor("#ff4444");
    }
  }

  async startShowcase() {
    this.statusText
      .setText("Preparing disposable systems showcase...")
      .setColor("#ff99dd");
    try {
      const auth = await login(`showcase_${Date.now()}@kithlands.dev`);
      if (!auth.token) {
        this.statusText
          .setText(auth.error || "Showcase login failed.")
          .setColor("#ff4444");
        return;
      }
      setToken(auth.token);
      const result = await debugCreateShowcase();
      if (result.error) {
        this.statusText.setText(result.error).setColor("#ff4444");
        return;
      }
      this.scene.start("World", { gameState: result });
    } catch (error) {
      console.error("[Title] showcase error:", error);
      this.statusText
        .setText(
          "Showcase unavailable. Start the server with KITHLANDS_DEBUG=1.",
        )
        .setColor("#ff4444");
    }
  }
}
