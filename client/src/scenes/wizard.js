import { newGame, getClasses, geocode, osmPreview } from "../api.js";
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
      radius_miles: last.radius_miles || 1.5,
      spawn_node_id: last.spawn_node_id || "",
      osm_preview: last.osm_preview || null,
    };

    this.cx = 400;
    this.contentGroup = this.add.group();
    this.showStep();
  }

  shouldSkipNPCStep() {
    if (!this.wizardData.use_osm) return false;
    const pois = this.wizardData.osm_preview || [];
    // Only count POIs that had real OSM names (not auto-generated ones)
    const generated =
      /^(Building|House|Shed|Farmland|Water|Church|School|Parking|Fuel|Shelter|Place Of Worship|Fire Station|Restaurant|Cafe|Bar|Fast Food|Commercial|Retail|Civic|Government)( \d+)?$/;
    const namedPOIs = pois.filter((p) => p.name && !generated.test(p.name));
    return namedPOIs.length >= 5;
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

    // Skip POI step when not using OSM
    if (!this.wizardData.use_osm && this.step === 1) {
      this.step++;
      this.showStep();
      return;
    }

    // Skip map preview when not using OSM
    if (!this.wizardData.use_osm && this.step === 6) {
      this.step++;
      this.showStep();
      return;
    }

    // Skip places and big building steps when using OSM
    if (this.wizardData.use_osm && (this.step === 3 || this.step === 4)) {
      // Auto-fill defaults so the server has something if needed
      if (
        this.step === 3 &&
        (!this.wizardData.places || this.wizardData.places.length === 0)
      ) {
        this.wizardData.places = ["From Map", "From Map", "From Map"];
      }
      if (this.step === 4 && !this.wizardData.big_building) {
        this.wizardData.big_building = "Town Hall";
      }
      this.step++;
      this.showStep();
      return;
    }

    // Skip NPC step when OSM has enough genuinely named POIs (>= 5)
    if (this.step === 2 && this.shouldSkipNPCStep()) {
      {
        if (!this.wizardData.people || this.wizardData.people.length === 0) {
          this.wizardData.people = [
            { name: "Bob", relation: "friendly" },
            { name: "Mrs Henderson", relation: "neutral" },
            { name: "Mayor Grimes", relation: "rival" },
          ];
        }
        this.step++;
        this.showStep();
        return;
      }
    }

    switch (this.step) {
      case 0:
        this.showTownStep();
        break;
      case 1:
        this.showPOIStep();
        break;
      case 2:
        this.showPeopleStep();
        break;
      case 3:
        this.showPlacesStep();
        break;
      case 4:
        this.showBigBuildingStep();
        break;
      case 5:
        this.showPartyStep();
        break;
      case 6:
        this.showMapPreview();
        break;
      case 7:
        this.showConfirmStep();
        break;
      case 8:
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
      // Skip past OSM-hidden steps when going back
      if (this.wizardData.use_osm) {
        // Skip big building (4) and places (3) going back
        if (this.step === 4 || this.step === 3) {
          if (this.shouldSkipNPCStep()) {
            this.step = 1; // Jump back to POI picker
          } else {
            this.step = 2; // Jump back to NPCs
          }
        }
        // If NPC step was skipped, jump from party back to POI
        if (this.step === 2 && this.shouldSkipNPCStep()) {
          this.step = 1;
        }
      }
      // Skip POI step when not using OSM (going back)
      if (!this.wizardData.use_osm && this.step === 1) {
        this.step = 0;
      }
      // Skip map preview when not using OSM (going back)
      if (!this.wizardData.use_osm && this.step === 6) {
        this.step = 5;
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
    let useOSM = this.wizardData.use_osm;
    const osmToggle = this.add
      .text(
        this.cx,
        200,
        `[${useOSM ? "X" : " "}] Use real-world map data (OpenStreetMap)`,
        {
          fontSize: "12px",
          color: useOSM ? "#44aaff" : "#666666",
          fontFamily: "monospace",
        },
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.contentGroup.add(osmToggle);

    // Radius slider (only visible when OSM enabled)
    const sliderLabel = this.add
      .text(
        this.cx,
        230,
        `Search radius: ${this.wizardData.radius_miles} miles`,
        {
          fontSize: "12px",
          color: "#aaaaaa",
          fontFamily: "monospace",
        },
      )
      .setOrigin(0.5);
    sliderLabel.setVisible(useOSM);
    this.contentGroup.add(sliderLabel);

    const sliderEl = document.createElement("input");
    sliderEl.type = "range";
    sliderEl.min = "0.5";
    sliderEl.max = "5";
    sliderEl.step = "0.5";
    sliderEl.value = String(this.wizardData.radius_miles || 1.5);
    sliderEl.style.cssText = "width:250px;accent-color:#44aaff;";
    const slider = this.add.dom(this.cx, 255, sliderEl);
    slider.setVisible(useOSM);
    this.contentGroup.add(slider);

    sliderEl.addEventListener("input", () => {
      sliderLabel.setText(`Search radius: ${sliderEl.value} miles`);
    });

    osmToggle.on("pointerdown", () => {
      useOSM = !useOSM;
      osmToggle.setText(
        `[${useOSM ? "X" : " "}] Use real-world map data (OpenStreetMap)`,
      );
      osmToggle.setColor(useOSM ? "#44aaff" : "#666666");
      sliderLabel.setVisible(useOSM);
      slider.setVisible(useOSM);
    });

    this.addButton(300, "FIND & CONTINUE", async () => {
      const townName = input.node.value.trim() || "Cadott, WI";
      this.wizardData.town_name = townName;
      this.wizardData.use_osm = useOSM;
      this.wizardData.radius_miles = parseFloat(sliderEl.value);

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

          // Scan for POIs
          status
            .setText("Scanning map for points of interest...")
            .setColor("#ffcc44");
          try {
            const preview = await osmPreview(
              result.lat,
              result.lng,
              this.wizardData.radius_miles,
            );
            if (preview.error) {
              status
                .setText("Map scan failed. Continuing without preview.")
                .setColor("#ff8844");
              this.wizardData.osm_preview = null;
              this.wizardData.spawn_node_id = "";
            } else {
              this.wizardData.osm_preview = preview.nodes || [];
              this.wizardData.radius_miles =
                preview.radius_miles || this.wizardData.radius_miles;
              status
                .setText(
                  `Found ${preview.nodes?.length || 0} points of interest`,
                )
                .setColor("#44ff44");
            }
          } catch (previewErr) {
            status
              .setText("Map scan failed. Continuing without preview.")
              .setColor("#ff8844");
            this.wizardData.osm_preview = null;
            this.wizardData.spawn_node_id = "";
          }

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

  showPOIStep() {
    this.addTitle("DISCOVERED LOCATIONS");
    const pois = this.wizardData.osm_preview || [];

    if (pois.length === 0) {
      this.addLabel(
        80,
        "No points of interest found.\nThe game will generate locations for you.",
      );
      this.addBackButton(160);
      this.addButton(160, "NEXT", () => {
        this.step++;
        this.showStep();
      });
      return;
    }

    // Sort by importance (highest first) so most relevant POIs are visible
    pois.sort((a, b) => (b.importance || 0) - (a.importance || 0));

    this.addLabel(
      70,
      `Found ${pois.length} locations. Pick your starting point:`,
    );

    // Show up to 12 POIs (already sorted by importance)
    const maxShow = Math.min(pois.length, 12);
    let selectedIdx = 0; // highest importance is first after sort

    // If we have a saved spawn, try to find it in visible range
    if (this.wizardData.spawn_node_id) {
      const idx = pois.findIndex((p) => p.id === this.wizardData.spawn_node_id);
      if (idx >= 0 && idx < maxShow) selectedIdx = idx;
    }

    const items = [];
    for (let i = 0; i < maxShow; i++) {
      const poi = pois[i];
      const kindLabel =
        poi.kind === "business"
          ? "BIZ"
          : poi.kind === "landmark"
            ? "LMK"
            : poi.kind === "natural"
              ? "NAT"
              : "LOC";
      const label = `[${kindLabel}] ${poi.name}`;
      const color = i === selectedIdx ? "#44ff44" : "#aaaaaa";

      const t = this.add
        .text(this.cx, 110 + i * 22, label, {
          fontSize: "13px",
          color,
          fontFamily: "monospace",
          wordWrap: { width: 500 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      t.on("pointerover", () => {
        if (i !== selectedIdx) t.setColor("#cccccc");
      });
      t.on("pointerout", () => {
        t.setColor(i === selectedIdx ? "#44ff44" : "#aaaaaa");
      });
      t.on("pointerdown", () => {
        // Deselect old
        if (items[selectedIdx]) items[selectedIdx].setColor("#aaaaaa");
        selectedIdx = i;
        t.setColor("#44ff44");
        this.wizardData.spawn_node_id = pois[i].id;
      });

      items.push(t);
      this.contentGroup.add(t);
    }

    // Set initial spawn
    this.wizardData.spawn_node_id = pois[selectedIdx].id;

    if (pois.length > maxShow) {
      this.addLabel(
        110 + maxShow * 22,
        `... and ${pois.length - maxShow} more`,
      );
    }

    const btnY = Math.min(110 + (maxShow + 1) * 22 + 20, 440);
    this.addBackButton(btnY);
    this.addButton(btnY, "NEXT", () => {
      this.step++;
      this.showStep();
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
      60,
      "Choose up to 4 party members.\nClasses: warrior, brawler, rogue, mender, cinder, wayfarer\nLeave a slot blank to skip it.",
    );

    const prevParty = this.wizardData.party || [];
    const defaults = [
      { defName: "Hero", defClass: "warrior" },
      { defName: "Sparks", defClass: "cinder" },
      { defName: "Lark", defClass: "rogue" },
      { defName: "Willow", defClass: "mender" },
    ];
    const slots = defaults.map((d, i) => ({
      defName: prevParty[i]?.name || d.defName,
      defClass: prevParty[i]?.class_id || d.defClass,
    }));

    const inputs = [];
    const rowHeight = 80;
    const firstRowY = 150;
    for (let i = 0; i < 4; i++) {
      const rowY = firstRowY + i * rowHeight;
      this.addLabel(rowY, `Slot ${i + 1}:`);
      const nameInput = this.addInput(
        rowY + 20,
        `Name (${slots[i].defName})`,
        180,
      );
      const classInput = this.addInput(
        rowY + 50,
        `Class (${slots[i].defClass})`,
        180,
      );
      if (prevParty[i]) {
        nameInput.node.value = prevParty[i].name;
        classInput.node.value = prevParty[i].class_id;
      }
      inputs.push({ nameInput, classInput, def: slots[i] });
    }

    const buttonY = firstRowY + 4 * rowHeight + 10;
    this.addBackButton(buttonY);
    this.addButton(buttonY, "NEXT", () => {
      const party = [];
      inputs.forEach((inp, i) => {
        const name = inp.nameInput.node.value.trim();
        const cls = inp.classInput.node.value.trim().toLowerCase();
        // Always keep slot 0 (use defaults if blank). Later slots are optional:
        // only include them if the player typed something.
        if (i === 0 || name || cls) {
          party.push({
            name: name || inp.def.defName,
            class_id: cls || inp.def.defClass,
          });
        }
      });
      this.wizardData.party = party;
      this.step++;
      this.showStep();
    });
  }

  showMapPreview() {
    this.addTitle("MAP PREVIEW");
    const pois = this.wizardData.osm_preview || [];

    if (pois.length === 0) {
      this.addLabel(80, "No map data available.");
      this.addBackButton(160);
      this.addButton(160, "NEXT", () => {
        this.step++;
        this.showStep();
      });
      return;
    }

    // Map area: 400x300 centered
    const mapX = this.cx - 200;
    const mapY = 70;
    const mapW = 400;
    const mapH = 300;

    const gfx = this.add.graphics();
    this.contentGroup.add(gfx);

    // Background
    gfx.fillStyle(0x1a1a2e, 1);
    gfx.fillRect(mapX, mapY, mapW, mapH);
    gfx.lineStyle(1, 0x333355);
    gfx.strokeRect(mapX, mapY, mapW, mapH);

    // Find bounds
    let minLat = Infinity,
      maxLat = -Infinity;
    let minLng = Infinity,
      maxLng = -Infinity;
    for (const p of pois) {
      if (p.lat != null && p.lng != null) {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
      }
    }

    // Add padding
    const latPad = (maxLat - minLat) * 0.15 || 0.005;
    const lngPad = (maxLng - minLng) * 0.15 || 0.005;
    minLat -= latPad;
    maxLat += latPad;
    minLng -= lngPad;
    maxLng += lngPad;

    const latRange = maxLat - minLat || 1;
    const lngRange = maxLng - minLng || 1;

    // Color by kind
    const kindColors = {
      business: 0xffcc44,
      landmark: 0x4488ff,
      place: 0x44cc44,
      natural: 0x886633,
      person: 0xff4488,
    };

    // Draw POIs
    for (const p of pois) {
      if (p.lat == null || p.lng == null) continue;
      const px = mapX + ((p.lng - minLng) / lngRange) * mapW;
      const py = mapY + mapH - ((p.lat - minLat) / latRange) * mapH;
      const color = kindColors[p.kind] || 0xaaaaaa;
      const isSpawn = p.id === this.wizardData.spawn_node_id;

      if (isSpawn) {
        // Spawn point: larger, with ring
        gfx.fillStyle(0xffffff, 1);
        gfx.fillCircle(px, py, 7);
        gfx.fillStyle(color, 1);
        gfx.fillCircle(px, py, 5);
      } else {
        gfx.fillStyle(color, 0.8);
        gfx.fillCircle(px, py, 4);
      }
    }

    // Legend
    let ly = mapY + mapH + 15;
    const legendItems = [
      { color: "#ffcc44", label: "Business" },
      { color: "#4488ff", label: "Landmark" },
      { color: "#44cc44", label: "Place" },
      { color: "#886633", label: "Natural" },
    ];
    const legendText = legendItems.map((l) => l.label).join("  |  ");
    this.addLabel(ly, legendText);

    ly += 25;
    this.addLabel(ly, "White ring = your spawn point");

    ly += 30;
    this.addBackButton(ly);
    this.addButton(ly, "NEXT", () => {
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

    if (d.use_osm && d.radius_miles) {
      this.addLabel(y, `Radius: ${d.radius_miles} miles`);
      y += 25;
    }
    if (d.spawn_node_id) {
      const spawnPOI = (d.osm_preview || []).find(
        (p) => p.id === d.spawn_node_id,
      );
      this.addLabel(y, `Spawn: ${spawnPOI ? spawnPOI.name : d.spawn_node_id}`);
      y += 25;
    }

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

    // Don't persist or send the large preview data
    const saveData = { ...this.wizardData };
    delete saveData.osm_preview;

    // Save wizard prefs for next time (without preview payload)
    setLastWizard(saveData);
    if (this.wizardData.party) addPartyToHistory(this.wizardData.party);
    if (this.wizardData.people) addNPCsToHistory(this.wizardData.people);

    const gameData = saveData;

    try {
      const result = await newGame(gameData);
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
