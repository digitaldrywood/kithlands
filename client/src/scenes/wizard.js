import { newGame, getClasses, geocode } from "../api.js";
import {
  getLastWizard,
  setLastWizard,
  addPartyToHistory,
  addNPCsToHistory,
  getPartyHistory,
  getNPCHistory,
} from "../systems/prefs.js";

export class WizardScene extends Phaser.Scene {
  constructor() {
    super("Wizard");
  }

  create() {
    this.step = 0;
    const last = getLastWizard() || {};
    this.wizardData = {
      town_name: last.town_name || "",
      people: last.people || [],
      places: last.places || [],
      big_building: last.big_building || "",
      party: last.party || [],
      difficulty: last.difficulty || "normal",
      use_osm: last.use_osm ?? true,
      lat: last.lat || 0,
      lng: last.lng || 0,
    };

    this.cx = 400;
    this.contentGroup = this.add.group();
    this.showStep();
  }

  clearContent() {
    this.contentGroup.clear(true, true);
    // Remove any DOM elements
    this.children.list
      .filter((c) => c.type === "DOMElement")
      .forEach((c) => c.destroy());
  }

  showStep() {
    this.clearContent();

    // Skip places and big building steps when using OSM
    // (the map provides all POIs automatically)
    if (this.wizardData.use_osm && (this.step === 2 || this.step === 3)) {
      // Auto-fill defaults so the server has something if needed
      if (
        this.step === 2 &&
        (!this.wizardData.places || this.wizardData.places.length === 0)
      ) {
        this.wizardData.places = ["From Map", "From Map", "From Map"];
      }
      if (this.step === 3 && !this.wizardData.big_building) {
        this.wizardData.big_building = "Town Hall";
      }
      this.step++;
      this.showStep();
      return;
    }

    switch (this.step) {
      case 0:
        this.showTownStep();
        break;
      case 1:
        this.showPeopleStep();
        break;
      case 2:
        this.showPlacesStep();
        break;
      case 3:
        this.showBigBuildingStep();
        break;
      case 4:
        this.showPartyStep();
        break;
      case 5:
        this.showConfirmStep();
        break;
      case 6:
        this.startGameStep();
        break;
    }
  }

  addTitle(text) {
    const t = this.add
      .text(this.cx, 40, text, {
        fontSize: "20px",
        color: "#ffffff",
        fontFamily: "monospace",
        wordWrap: { width: 700 },
      })
      .setOrigin(0.5, 0);
    this.contentGroup.add(t);
    return t;
  }

  addLabel(y, text) {
    const t = this.add
      .text(this.cx, y, text, {
        fontSize: "14px",
        color: "#cccccc",
        fontFamily: "monospace",
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5, 0);
    this.contentGroup.add(t);
    return t;
  }

  addInput(y, placeholder, width = 300) {
    const el = document.createElement("input");
    el.type = "text";
    el.placeholder = placeholder;
    el.style.cssText = `font-size:16px;padding:6px 12px;width:${width}px;text-align:center;background:#222;color:#fff;border:2px solid #555;outline:none;font-family:monospace;`;
    return this.add.dom(this.cx, y, el);
  }

  addBackButton(y) {
    if (this.step <= 0) return;
    const btn = this.add
      .text(200, y, "[ BACK ]", {
        fontSize: "14px",
        color: "#888888",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setColor("#aaaaaa"));
    btn.on("pointerout", () => btn.setColor("#888888"));
    btn.on("pointerdown", () => {
      this.step--;
      // Skip past OSM-hidden steps when going back too
      if (this.wizardData.use_osm && (this.step === 3 || this.step === 2)) {
        this.step = 1; // jump back to NPCs
      }
      this.showStep();
    });
    this.contentGroup.add(btn);
  }

  addButton(y, label, callback) {
    const btn = this.add
      .text(this.cx, y, `[ ${label} ]`, {
        fontSize: "20px",
        color: "#44ff44",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setColor("#88ff88"));
    btn.on("pointerout", () => btn.setColor("#44ff44"));
    btn.on("pointerdown", callback);
    this.contentGroup.add(btn);
    return btn;
  }

  showTownStep() {
    this.addTitle("LOCALITY WIZARD");
    this.addLabel(
      80,
      "Where do you live? This becomes the world of your game.\nEnter a town name or address to build from real-world map data.",
    );
    const input = this.addInput(140, "Town name or address (e.g. Cadott, WI)");
    if (this.wizardData.town_name) input.node.value = this.wizardData.town_name;

    // Status text for geocoding
    const status = this.add
      .text(this.cx, 175, "", {
        fontSize: "11px",
        color: "#aaaaaa",
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.contentGroup.add(status);

    // Use real map toggle
    let useOSM = true;
    const osmToggle = this.add
      .text(this.cx, 200, "[X] Use real-world map data (OpenStreetMap)", {
        fontSize: "12px",
        color: "#44aaff",
        fontFamily: "monospace",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    osmToggle.on("pointerdown", () => {
      useOSM = !useOSM;
      osmToggle.setText(
        `[${useOSM ? "X" : " "}] Use real-world map data (OpenStreetMap)`,
      );
      osmToggle.setColor(useOSM ? "#44aaff" : "#666666");
    });
    this.contentGroup.add(osmToggle);

    this.addButton(260, "FIND & CONTINUE", async () => {
      const townName = input.node.value.trim() || "Cadott, WI";
      this.wizardData.town_name = townName;
      this.wizardData.use_osm = useOSM;

      if (useOSM) {
        status.setText("Looking up location...").setColor("#ffcc44");
        try {
          const result = await geocode(townName);
          if (result.error) {
            status.setText(`Not found: ${result.error}`).setColor("#ff4444");
            return;
          }
          this.wizardData.lat = result.lat;
          this.wizardData.lng = result.lng;
          status.setText(`Found: ${result.display_name}`).setColor("#44ff44");
          // Brief pause to show result
          this.time.delayedCall(1000, () => {
            this.step++;
            this.showStep();
          });
        } catch (e) {
          status
            .setText("Geocoding failed. Continuing without OSM.")
            .setColor("#ff8844");
          this.wizardData.use_osm = false;
          this.time.delayedCall(1500, () => {
            this.step++;
            this.showStep();
          });
        }
      } else {
        this.step++;
        this.showStep();
      }
    });
  }

  showPeopleStep() {
    this.addTitle("NAME YOUR NPCs");
    this.addLabel(
      70,
      "Name 3 people from your town. They become NPCs --\nquest-givers, shopkeepers, or even the villain.\nThey are NOT your party (you pick your party next).",
    );

    const defaults = [
      { name: "Bob", rel: "friendly" },
      { name: "Mrs Henderson", rel: "neutral" },
      { name: "Mayor Grimes", rel: "rival" },
    ];

    const inputs = [];
    for (let i = 0; i < 3; i++) {
      const prevNPC = this.wizardData.people[i];
      const defName = prevNPC?.name || defaults[i].name;
      const defRel = prevNPC?.relation || defaults[i].rel;
      this.addLabel(165 + i * 80, `NPC ${i + 1}:`);
      const nameInput = this.addInput(195 + i * 80, defName, 200);
      if (prevNPC) nameInput.node.value = prevNPC.name;
      inputs.push({ nameInput, defaultName: defName, defaultRel: defRel });
    }

    this.addBackButton(440);
    this.addButton(440, "NEXT", () => {
      this.wizardData.people = inputs.map((inp) => ({
        name: inp.nameInput.node.value.trim() || inp.defaultName,
        relation: inp.defaultRel,
      }));
      this.step++;
      this.showStep();
    });
  }

  showPlacesStep() {
    this.addTitle("NAME YOUR PLACES");
    this.addLabel(80, "Name 3 places that matter in your town.");

    const defaults = ["The School", "Creswood Corners", "Fire Hall"];
    const inputs = [];
    for (let i = 0; i < 3; i++) {
      const prevPlace = this.wizardData.places[i];
      const defPlace = prevPlace || defaults[i];
      this.addLabel(130 + i * 80, `Place ${i + 1}:`);
      const input = this.addInput(160 + i * 80, defPlace, 250);
      if (prevPlace) input.node.value = prevPlace;
      inputs.push({ input, def: defPlace });
    }

    this.addBackButton(400);
    this.addButton(400, "NEXT", () => {
      this.wizardData.places = inputs.map(
        (inp) => inp.input.node.value.trim() || inp.def,
      );
      this.step++;
      this.showStep();
    });
  }

  showBigBuildingStep() {
    this.addTitle("THE BIG BUILDING");
    this.addLabel(
      80,
      "What's the biggest building in town?\nThis becomes the final dungeon or seat of power.",
    );
    const defBuilding = this.wizardData.big_building || "Town Hall";
    const input = this.addInput(150, defBuilding);
    if (this.wizardData.big_building)
      input.node.value = this.wizardData.big_building;
    this.addBackButton(220);
    this.addButton(220, "NEXT", () => {
      this.wizardData.big_building = input.node.value.trim() || "Town Hall";
      this.step++;
      this.showStep();
    });
  }

  showPartyStep() {
    this.addTitle("PICK YOUR PARTY");
    this.addLabel(
      70,
      "Choose 2 party members for the demo.\nClasses: warrior, brawler, rogue, mender, cinder, wayfarer",
    );

    const prevParty = this.wizardData.party;
    const slots = [
      {
        defName: prevParty[0]?.name || "Hero",
        defClass: prevParty[0]?.class_id || "warrior",
      },
      {
        defName: prevParty[1]?.name || "Sparks",
        defClass: prevParty[1]?.class_id || "cinder",
      },
    ];

    const inputs = [];
    for (let i = 0; i < 2; i++) {
      this.addLabel(140 + i * 110, `Slot ${i + 1}:`);
      const nameInput = this.addInput(
        170 + i * 110,
        `Name (${slots[i].defName})`,
        180,
      );
      const classInput = this.addInput(
        205 + i * 110,
        `Class (${slots[i].defClass})`,
        180,
      );
      if (prevParty[i]) {
        nameInput.node.value = prevParty[i].name;
        classInput.node.value = prevParty[i].class_id;
      }
      inputs.push({ nameInput, classInput, def: slots[i] });
    }

    this.addBackButton(430);
    this.addButton(430, "NEXT", () => {
      this.wizardData.party = inputs.map((inp) => ({
        name: inp.nameInput.node.value.trim() || inp.def.defName,
        class_id:
          inp.classInput.node.value.trim().toLowerCase() || inp.def.defClass,
      }));
      this.step++;
      this.showStep();
    });
  }

  showConfirmStep() {
    this.addTitle("CONFIRM YOUR GAME");
    const d = this.wizardData;

    let y = 80;
    this.addLabel(
      y,
      `Town: ${d.town_name}${d.use_osm ? " (OpenStreetMap)" : ""}`,
    );
    y += 25;

    const peopleStr = d.people?.map((p) => p.name).join(", ") || "defaults";
    this.addLabel(y, `NPCs: ${peopleStr}`);
    y += 25;

    const placesStr = d.places?.join(", ") || "defaults";
    this.addLabel(y, `Places: ${placesStr}`);
    y += 25;

    this.addLabel(y, `Big Building: ${d.big_building || "Town Hall"}`);
    y += 35;

    this.addLabel(y, "Party:");
    y += 22;
    if (d.party) {
      for (const p of d.party) {
        this.addLabel(y, `  ${p.name} (${p.class_id})`);
        y += 20;
      }
    }
    y += 20;

    this.addLabel(y, `Difficulty: ${d.difficulty || "normal"}`);
    y += 40;

    this.addBackButton(y);
    this.addButton(y, "BEGIN ADVENTURE", () => {
      this.step++;
      this.showStep();
    });
  }

  async startGameStep() {
    this.addTitle("Creating your world...");
    const osmMsg = this.wizardData.use_osm
      ? "Fetching real-world map data from OpenStreetMap..."
      : "Generating locality, campaign, and encounters...";
    this.addLabel(100, osmMsg);

    // Save wizard prefs for next time
    setLastWizard(this.wizardData);
    if (this.wizardData.party) addPartyToHistory(this.wizardData.party);
    if (this.wizardData.people) addNPCsToHistory(this.wizardData.people);

    try {
      const result = await newGame(this.wizardData);
      if (result.error) {
        this.addLabel(200, `Error: ${result.error}`).setColor("#ff4444");
        return;
      }
      this.scene.start("World", { gameState: result });
    } catch (e) {
      this.addLabel(200, "Server error. Is the backend running?").setColor(
        "#ff4444",
      );
    }
  }
}
