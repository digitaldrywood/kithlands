import { roundedRectangle } from "../ui/theme.js";
import { drawButton, drawPanel } from "../ui/panel.js";
import { newGame, geocode, osmPreview } from "../api.js";
import {
  getLastWizard,
  setLastWizard,
  addPartyToHistory,
  addNPCsToHistory,
} from "../systems/prefs.js";

const DEFAULT_PEOPLE = [
  { name: "Bob", relation: "friendly" },
  { name: "Mrs Henderson", relation: "neutral" },
  { name: "Mayor Grimes", relation: "rival" },
];
const DEFAULT_PLACES = ["From Map", "From Map", "From Map"];
const DEFAULT_BIG_BUILDING = "Town Hall";
const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function sortPOIsByImportance(pois = []) {
  return [...pois].sort((a, b) => (b.importance || 0) - (a.importance || 0));
}

export class WizardScene extends Phaser.Scene {
  constructor() {
    super("Wizard");
  }

  create() {
    this.step = 0;
    this.townSearchState = {
      busy: false,
      label: "",
      error: "",
    };
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
    return pois.filter((p) => p.name).length >= 5;
  }

  usesStreamlinedOSMFlow() {
    return (
      this.wizardData.use_osm && (this.wizardData.osm_preview || []).length > 0
    );
  }

  selectTopPOISpawn() {
    const topPOI = sortPOIsByImportance(this.wizardData.osm_preview).find(
      (poi) => poi?.id,
    );
    this.wizardData.spawn_node_id = topPOI?.id || "";
  }

  ensureOSMDefaults() {
    this.selectTopPOISpawn();
    if (!this.wizardData.people || this.wizardData.people.length === 0) {
      this.wizardData.people = DEFAULT_PEOPLE.map((person) => ({ ...person }));
    }
    if (!this.wizardData.places || this.wizardData.places.length === 0) {
      this.wizardData.places = [...DEFAULT_PLACES];
    }
    if (!this.wizardData.big_building) {
      this.wizardData.big_building = DEFAULT_BIG_BUILDING;
    }
  }

  addSpinner(x, y) {
    const spinner = this.add
      .text(x, y, "", {
        fontSize: "16px",
        color: "#c9b589",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0, 0.5)
      .setVisible(false);
    const label = this.add
      .text(x + 20, y, "", {
        fontSize: "12px",
        color: "#c9b589",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0, 0.5)
      .setVisible(false);

    let frameIdx = 0;
    let event = null;

    this.contentGroup.add(spinner);
    this.contentGroup.add(label);

    return {
      setBusy: (busy, text = "") => {
        if (!busy) {
          if (event) event.remove();
          event = null;
          frameIdx = 0;
          spinner.setVisible(false);
          label.setVisible(false);
          return;
        }

        spinner.setVisible(true).setText(SPINNER_FRAMES[frameIdx]);
        label.setVisible(true).setText(text);
        if (event) event.remove();
        event = this.time.addEvent({
          delay: 120,
          loop: true,
          callback: () => {
            frameIdx = (frameIdx + 1) % SPINNER_FRAMES.length;
            spinner.setText(SPINNER_FRAMES[frameIdx]);
          },
        });
      },
    };
  }

  async createGameRequest() {
    const saveData = { ...this.wizardData };
    delete saveData.osm_preview;

    setLastWizard(saveData);
    if (this.wizardData.party) addPartyToHistory(this.wizardData.party);
    if (this.wizardData.people) addNPCsToHistory(this.wizardData.people);

    return newGame(saveData);
  }

  clearContent() {
    this.contentGroup.clear(true, true);
    // Remove any DOM elements
    this.children.list
      .filter((c) => c.type === "DOMElement")
      .forEach((c) => c.destroy());
  }

  goBack() {
    if (this.step <= 0) return;
    if (this.usesStreamlinedOSMFlow() && this.step === 5) {
      this.step = 0;
      this.showStep();
      return;
    }

    this.step--;
    if (this.wizardData.use_osm) {
      if (this.step === 4 || this.step === 3) {
        if (this.shouldSkipNPCStep()) {
          this.step = 1;
        } else {
          this.step = 2;
        }
      }
      if (this.step === 2 && this.shouldSkipNPCStep()) {
        this.step = 1;
      }
    }
    if (!this.wizardData.use_osm && this.step === 1) {
      this.step = 0;
    }
    if (!this.wizardData.use_osm && this.step === 6) {
      this.step = 5;
    }
    this.showStep();
  }

  showStep() {
    this.clearContent();
    const shell = drawPanel(this, this.cx, 300, 776, 576, {
      depth: -1,
      interactive: false,
    });
    this.contentGroup.add(shell.bg);

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
        this.wizardData.places = [...DEFAULT_PLACES];
      }
      if (this.step === 4 && !this.wizardData.big_building) {
        this.wizardData.big_building = DEFAULT_BIG_BUILDING;
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
        color: "#e9eef7",
        fontFamily: "Arial, sans-serif",
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
        color: "#94a8bd",
        fontFamily: "Arial, sans-serif",
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5, 0);
    this.contentGroup.add(t);
    return t;
  }

  addInput(y, placeholder, width = 300, x = this.cx) {
    const el = document.createElement("input");
    el.type = "text";
    el.placeholder = placeholder;
    el.style.cssText = `font-size:16px;padding:6px 12px;width:${width}px;text-align:center;background:#1c2736;color:#e9eef7;border:1px solid #384859;border-radius:10px;font-family:Arial,sans-serif;`;
    return this.add.dom(x, y, el);
  }

  addBackButton(y) {
    if (this.step <= 0) return;
    const button = drawButton(
      this,
      200,
      y,
      116,
      36,
      "Back",
      () => this.goBack(),
      { depth: 0, fontSize: "14px" },
    );
    this.contentGroup.addMultiple([button.bg, button.label]);
  }

  addButton(y, label, callback, x = this.cx) {
    const button = drawButton(
      this,
      x,
      y,
      Math.max(150, label.length * 10 + 32),
      38,
      label,
      callback,
      { depth: 0, fontSize: "16px" },
    );
    this.contentGroup.addMultiple([button.bg, button.label]);
    return button.label;
  }

  setTownSearchState(nextState = {}) {
    this.townSearchState = {
      ...this.townSearchState,
      ...nextState,
    };
  }

  formatTownSearchLabel(townName) {
    const primaryLabel = (townName || "").split(",")[0].trim().slice(0, 24);
    return `Searching ${primaryLabel || "your town"}...`;
  }

  addFramedPanel(x, y, width, height, opts = {}) {
    const fill = opts.fill ?? 0x151e2b;
    const fillAlpha = opts.fillAlpha ?? 0.96;
    const stroke = opts.stroke ?? 0x8faee9;
    const strokeAlpha = opts.strokeAlpha ?? 1;
    const accent = opts.accent ?? 0xc9b589;

    const outer = roundedRectangle(
      this,
      x,
      y,
      width,
      height,
      fill,
      fillAlpha,
      20,
    ).setStrokeStyle(1, stroke, strokeAlpha);
    const inner = this.add
      .rectangle(x, y, width - 18, height - 18, 0x151e2b, 0.35)
      .setStrokeStyle(1, 0x384859, 0.95);
    const accentRule = this.add.rectangle(
      x,
      y - height / 2 + 16,
      width - 52,
      2,
      accent,
      0.8,
    );

    this.contentGroup.addMultiple([outer, inner, accentRule]);
    return { outer, inner, accentRule };
  }

  addErrorBanner(y, text) {
    const height = 50;
    this.addFramedPanel(this.cx, y, 520, height, {
      fill: 0x241018,
      stroke: 0xaa4455,
      accent: 0xc9b589,
    });
    const bannerText = this.add
      .text(this.cx, y, text, {
        fontSize: "12px",
        color: "#ffd7d7",
        fontFamily: "Arial, sans-serif",
        align: "center",
        wordWrap: { width: 460 },
      })
      .setOrigin(0.5);
    this.contentGroup.add(bannerText);
  }

  addLoadingPanel(y, label) {
    this.addFramedPanel(this.cx, y, 360, 92, {
      fill: 0x151e2b,
      stroke: 0x8faee9,
      accent: 0xc9b589,
    });

    const loadingLine = this.add
      .text(this.cx, y, `${SPINNER_FRAMES[0]} ${label}`, {
        fontSize: "18px",
        color: "#c9b589",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);
    loadingLine.__kithlandsWizardLoadingPanel = {
      cx: this.cx,
      cy: y,
      width: 360,
      height: 92,
    };
    this.contentGroup.add(loadingLine);

    let frameIdx = 0;
    let event = this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        frameIdx = (frameIdx + 1) % SPINNER_FRAMES.length;
        loadingLine.setText(`${SPINNER_FRAMES[frameIdx]} ${label}`);
      },
    });
    loadingLine.once("destroy", () => {
      if (!event) return;
      event.remove();
      event = null;
    });

    return loadingLine;
  }

  showTownStep() {
    this.addTitle("LOCALITY WIZARD");
    const searchState = this.townSearchState || {};
    if (searchState.busy) {
      this.addLoadingPanel(210, searchState.label || "Searching...");
      return;
    }

    this.addLabel(
      80,
      "Where do you live? This becomes the world of your game.\nEnter a town name or address to build from real-world map data.",
    );

    if (searchState.error) {
      this.addErrorBanner(145, searchState.error);
    }

    const formOffset = searchState.error ? 35 : 0;
    const input = this.addInput(
      140 + formOffset,
      "Town name or address (e.g. Cadott, WI)",
    );
    if (this.wizardData.town_name) input.node.value = this.wizardData.town_name;

    // Use real map toggle
    let useOSM = this.wizardData.use_osm;
    const osmToggle = this.add
      .text(
        this.cx,
        200 + formOffset,
        `[${useOSM ? "X" : " "}] Use real-world map data (OpenStreetMap)`,
        {
          fontSize: "12px",
          color: useOSM ? "#94a8bd" : "#697888",
          fontFamily: "Arial, sans-serif",
        },
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.contentGroup.add(osmToggle);

    // Radius slider (only visible when OSM enabled)
    const sliderLabel = this.add
      .text(
        this.cx,
        230 + formOffset,
        `Search radius: ${this.wizardData.radius_miles} miles`,
        {
          fontSize: "12px",
          color: "#aaaaaa",
          fontFamily: "Arial, sans-serif",
        },
      )
      .setOrigin(0.5);
    sliderLabel.setVisible(useOSM);
    this.contentGroup.add(sliderLabel);

    const sliderEl = document.createElement("input");
    sliderEl.type = "range";
    sliderEl.min = "0.5";
    sliderEl.max = "30";
    sliderEl.step = "1";
    sliderEl.value = String(this.wizardData.radius_miles || 1.5);
    sliderEl.style.cssText = "width:250px;accent-color:#384859;";
    const slider = this.add.dom(this.cx, 255 + formOffset, sliderEl);
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
      osmToggle.setColor(useOSM ? "#94a8bd" : "#697888");
      sliderLabel.setVisible(useOSM);
      slider.setVisible(useOSM);
    });

    const findButton = this.addButton(
      300 + formOffset,
      "FIND & CONTINUE",
      async () => {
        if (!findButton.input?.enabled) return;

        const townName = input.node.value.trim() || "Cadott, WI";
        this.wizardData.town_name = townName;
        this.wizardData.use_osm = useOSM;
        this.wizardData.radius_miles = parseFloat(sliderEl.value);

        if (useOSM) {
          this.wizardData.osm_preview = null;
          this.wizardData.spawn_node_id = "";
          this.setTownSearchState({
            busy: true,
            error: "",
            label: this.formatTownSearchLabel(townName),
          });
          this.showStep();
          try {
            const result = await geocode(townName);
            if (result.error) {
              this.setTownSearchState({
                busy: false,
                label: "",
                error: "Location not found. Try another town or address.",
              });
              this.showStep();
              return;
            }
            this.wizardData.lat = result.lat;
            this.wizardData.lng = result.lng;

            // Scan for POIs
            try {
              const preview = await osmPreview(
                result.lat,
                result.lng,
                this.wizardData.radius_miles,
              );
              if (preview.error) {
                this.wizardData.osm_preview = null;
                this.wizardData.spawn_node_id = "";
                this.setTownSearchState({
                  busy: false,
                  label: "",
                  error: "Map lookup failed. Try again.",
                });
                this.showStep();
                return;
              } else {
                this.wizardData.osm_preview = preview.nodes || [];
                this.wizardData.radius_miles =
                  preview.radius_miles || this.wizardData.radius_miles;
                if ((preview.nodes || []).length > 0) {
                  this.ensureOSMDefaults();
                  this.setTownSearchState({
                    busy: false,
                    label: "",
                    error: "",
                  });
                  this.step = 5;
                } else {
                  this.wizardData.spawn_node_id = "";
                  this.setTownSearchState({
                    busy: false,
                    label: "",
                    error: "",
                  });
                  this.step = 1;
                }
              }
            } catch {
              this.wizardData.osm_preview = null;
              this.wizardData.spawn_node_id = "";
              this.setTownSearchState({
                busy: false,
                label: "",
                error: "Map lookup failed. Try again.",
              });
              this.showStep();
              return;
            }
            this.showStep();
          } catch {
            this.setTownSearchState({
              busy: false,
              label: "",
              error: "Geocoding failed. Try again.",
            });
            this.showStep();
          }
        } else {
          this.setTownSearchState({
            busy: false,
            label: "",
            error: "",
          });
          this.wizardData.osm_preview = null;
          this.wizardData.spawn_node_id = "";
          this.step++;
          this.showStep();
        }
      },
    );

    input.node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !findButton.input?.enabled) return;
      event.preventDefault();
      findButton.emit("pointerdown");
    });
  }

  showPOIStep() {
    this.addTitle("DISCOVERED LOCATIONS");
    const pois = sortPOIsByImportance(this.wizardData.osm_preview || []);

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
      const color = i === selectedIdx ? "#8ac7aa" : "#aaaaaa";

      const t = this.add
        .text(this.cx, 110 + i * 22, label, {
          fontSize: "13px",
          color,
          fontFamily: "Arial, sans-serif",
          wordWrap: { width: 500 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      t.on("pointerover", () => {
        if (i !== selectedIdx) t.setColor("#94a8bd");
      });
      t.on("pointerout", () => {
        t.setColor(i === selectedIdx ? "#8ac7aa" : "#aaaaaa");
      });
      t.on("pointerdown", () => {
        // Deselect old
        if (items[selectedIdx]) items[selectedIdx].setColor("#aaaaaa");
        selectedIdx = i;
        t.setColor("#8ac7aa");
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

    const inputs = [];
    for (let i = 0; i < 3; i++) {
      const prevNPC = this.wizardData.people[i];
      const defName = prevNPC?.name || DEFAULT_PEOPLE[i].name;
      const defRel = prevNPC?.relation || DEFAULT_PEOPLE[i].relation;
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
    const defBuilding = this.wizardData.big_building || DEFAULT_BIG_BUILDING;
    const input = this.addInput(150, defBuilding);
    if (this.wizardData.big_building)
      input.node.value = this.wizardData.big_building;
    this.addBackButton(220);
    this.addButton(220, "NEXT", () => {
      this.wizardData.big_building =
        input.node.value.trim() || DEFAULT_BIG_BUILDING;
      this.step++;
      this.showStep();
    });
  }

  addClassPicker(x, y, initialClassId, classList, onChange) {
    let idx = Math.max(0, classList.indexOf(initialClassId));
    if (idx < 0) idx = 0;

    const labelStyle = {
      fontSize: "14px",
      color: "#8ac7aa",
      fontFamily: "Arial, sans-serif",
    };
    const arrowStyle = {
      fontSize: "18px",
      color: "#aaaaaa",
      fontFamily: "Arial, sans-serif",
    };

    const leftArrow = this.add
      .text(x - 70, y, "<", arrowStyle)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y, classList[idx], labelStyle)
      .setOrigin(0.5);
    const rightArrow = this.add
      .text(x + 70, y, ">", arrowStyle)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    leftArrow.on("pointerover", () => leftArrow.setColor("#e9eef7"));
    leftArrow.on("pointerout", () => leftArrow.setColor("#aaaaaa"));
    rightArrow.on("pointerover", () => rightArrow.setColor("#e9eef7"));
    rightArrow.on("pointerout", () => rightArrow.setColor("#aaaaaa"));

    const cycle = (delta) => {
      idx = (idx + delta + classList.length) % classList.length;
      label.setText(classList[idx]);
      if (onChange) onChange(classList[idx]);
    };
    leftArrow.on("pointerdown", () => cycle(-1));
    rightArrow.on("pointerdown", () => cycle(1));

    this.contentGroup.add(leftArrow);
    this.contentGroup.add(label);
    this.contentGroup.add(rightArrow);

    return {
      getClassId: () => classList[idx],
    };
  }

  addPartyRow(rowY, slot, classList) {
    const avatarX = this.cx - 220;
    const nameX = this.cx - 80;
    const pickerX = this.cx + 130;

    const avatar = this.add
      .image(avatarX, rowY, slot.class_id)
      .setDisplaySize(48, 48)
      .setOrigin(0.5);
    this.contentGroup.add(avatar);

    const nameInput = this.addInput(rowY, `Name (${slot.defName})`, 140, nameX);
    if (slot.name) nameInput.node.value = slot.name;
    this.contentGroup.add(nameInput);

    const picker = this.addClassPicker(
      pickerX,
      rowY,
      slot.class_id,
      classList,
      (newClassId) => avatar.setTexture(newClassId),
    );

    return {
      nameInput,
      getClassId: picker.getClassId,
    };
  }

  showPartyStep() {
    this.addTitle("PICK YOUR PARTY");
    this.addLabel(
      60,
      "Choose up to 4 party members.\n< and > cycle class. Leave a name blank to skip.",
    );

    const classList = [
      "warrior",
      "brawler",
      "rogue",
      "mender",
      "cinder",
      "wayfarer",
    ];
    const prevParty = this.wizardData.party || [];
    const defaults = [
      { defName: "Hero", defClass: "warrior" },
      { defName: "Sparks", defClass: "cinder" },
      { defName: "Lark", defClass: "rogue" },
      { defName: "Willow", defClass: "mender" },
    ];

    const rows = [];
    const firstRowY = 150;
    const rowHeight = 80;
    for (let i = 0; i < 4; i++) {
      const rowY = firstRowY + i * rowHeight;
      const def = defaults[i];
      const prev = prevParty[i];
      const slot = {
        name: prev?.name || "",
        class_id: prev?.class_id || def.defClass,
        defName: def.defName,
      };
      rows.push(this.addPartyRow(rowY, slot, classList));
    }

    const buttonY = firstRowY + 4 * rowHeight + 10;
    const status = this.add
      .text(this.cx, buttonY + 36, "", {
        fontSize: "11px",
        color: "#aaaaaa",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5, 0);
    this.contentGroup.add(status);
    const createSpinner = this.addSpinner(this.cx + 120, buttonY);

    const collectParty = () => {
      const party = [];
      rows.forEach((row, i) => {
        const name = row.nameInput.node.value.trim();
        const cls = row.getClassId();
        if (i === 0 || name) {
          party.push({
            name: name || defaults[i].defName,
            class_id: cls,
          });
        }
      });
      this.wizardData.party = party;
    };

    const setPartyInputsDisabled = (disabled) => {
      rows.forEach((row) => {
        row.nameInput.node.disabled = disabled;
        row.nameInput.node.style.opacity = disabled ? "0.7" : "1";
      });
    };

    const cancelHandle = drawButton(
      this,
      this.cx - 140,
      buttonY,
      140,
      38,
      "CANCEL",
      () => this.goBack(),
      { depth: 0, fontSize: "16px" },
    );
    const createHandle = drawButton(
      this,
      this.cx + 45,
      buttonY,
      200,
      38,
      "CREATE GAME",
      () => submit(),
      { depth: 0, fontSize: "16px" },
    );
    const createButton = createHandle.label;
    this.contentGroup.addMultiple([
      cancelHandle.bg,
      cancelHandle.label,
      createHandle.bg,
      createHandle.label,
    ]);

    const setCreateBusy = (busy, busyLabel = "Creating world...") => {
      setPartyInputsDisabled(busy);
      createHandle.setEnabled(!busy);
      cancelHandle.setEnabled(!busy);
      createSpinner.setBusy(busy, busyLabel);
    };

    const submit = async () => {
      if (!createButton.input?.enabled) return;

      collectParty();
      if (this.wizardData.use_osm) {
        this.ensureOSMDefaults();
      }
      status.setText("").setColor("#aaaaaa");
      setCreateBusy(true);
      try {
        const result = await this.createGameRequest();
        if (result.error) {
          status.setText(`Error: ${result.error}`).setColor("#e49c96");
          setCreateBusy(false);
          return;
        }
        this.scene.start("World", { gameState: result });
      } catch (e) {
        status
          .setText("Server error. Is the backend running?")
          .setColor("#e49c96");
        setCreateBusy(false);
      }
    };
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
    gfx.fillStyle(0x151e2b, 1);
    gfx.fillRect(mapX, mapY, mapW, mapH);
    gfx.lineStyle(1, 0x1c2736);
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
      business: 0xc9b589,
      landmark: 0x8faee9,
      place: 0x8ac7aa,
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
        gfx.fillStyle(0xe9eef7, 1);
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
      { color: "#c9b589", label: "Business" },
      { color: "#8faee9", label: "Landmark" },
      { color: "#8ac7aa", label: "Place" },
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

    try {
      const result = await this.createGameRequest();
      if (result.error) {
        this.addLabel(200, `Error: ${result.error}`).setColor("#e49c96");
        return;
      }
      this.scene.start("World", { gameState: result });
    } catch (e) {
      this.addLabel(200, "Server error. Is the backend running?").setColor(
        "#e49c96",
      );
    }
  }
}
