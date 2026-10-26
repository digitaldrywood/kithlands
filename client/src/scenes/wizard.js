import { element } from "../ui/viewport_dialog.js";
import {
  wizardView,
  wizardButton,
  wizardInput,
  wizardStatus,
  wizardPartyRow,
} from "../ui/wizard_view.js";
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

function sortPOIsByImportance(pois = []) {
  return [...pois].sort((a, b) => (b.importance || 0) - (a.importance || 0));
}

// Keep select navigation deterministic while Phaser owns the game keyboard.
function selectKeyboard(select) {
  select.addEventListener("keydown", (event) => {
    if (["Tab", "Escape"].includes(event.key)) return;
    event.stopPropagation();
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const last = select.options.length - 1;
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : Math.max(
              0,
              Math.min(
                last,
                select.selectedIndex + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    if (index !== select.selectedIndex) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

export class WizardScene extends Phaser.Scene {
  constructor() {
    super("Wizard");
  }

  create() {
    this.step = 0;
    this.townSearchToken = null;
    this.wizardCreateToken = null;
    this.wizardCreateBusy = false;
    const onEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (event.repeat) return;
      const cancel = this.canvasMenuKeyboard?.entries.find(
        (entry) =>
          entry.bg.active &&
          entry.bg.visible &&
          /^cancel$/i.test(entry.label.text),
      );
      if (cancel) cancel.activate();
      else this.goBack();
    };
    window.addEventListener("keydown", onEscape);
    this.events.once("shutdown", () => {
      window.removeEventListener("keydown", onEscape);
      this.townSearchToken = null;
      this.wizardCreateToken = null;
      this.wizardCreateBusy = false;
    });
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

  async createGameRequest() {
    const saveData = { ...this.wizardData };
    delete saveData.osm_preview;

    setLastWizard(saveData);
    if (this.wizardData.party) addPartyToHistory(this.wizardData.party);
    if (this.wizardData.people) addNPCsToHistory(this.wizardData.people);

    return newGame(saveData);
  }

  clearContent() {
    this.wizardDialog?.dispose();
    this.wizardDialog = null;
    this.contentGroup.clear(true, true);
    // Remove any DOM elements
    this.children.list
      .filter((c) => c.type === "DOMElement")
      .forEach((c) => c.destroy());
  }

  goBack() {
    if (this.step <= 0) {
      this.townSearchToken = null;
      this.scene.start("Title");
      return;
    }
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

  addBackButton(y) {
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

  showTownStep() {
    let submitTown;
    const dialog = wizardView(
      this,
      "LOCALITY WIZARD",
      "Your town becomes your world. Choose a location, then build your party.",
      () => {
        if (findButton && !findButton.disabled) void submitTown();
      },
    );
    let findButton;
    wizardButton(dialog.footer, "Back", () => this.goBack());
    const searchState = this.townSearchState || {};
    if (searchState.busy) {
      dialog.body.setAttribute("aria-busy", "true");
      wizardStatus(dialog.body, searchState.label || "Searching...");
      return;
    }
    if (searchState.error) wizardStatus(dialog.body, searchState.error, true);
    const input = {
      node: wizardInput(
        dialog.body,
        "Town name or address",
        "e.g. Cadott, WI",
        this.wizardData.town_name,
      ),
    };
    let useOSM = this.wizardData.use_osm;
    const toggleLabel = element("label", "wizard-map-toggle");
    const toggle = element("input");
    toggle.type = "checkbox";
    toggle.checked = useOSM;
    toggleLabel.append(
      toggle,
      element("span", "", "Use real-world map data (OpenStreetMap)"),
    );
    dialog.body.append(toggleLabel);
    const radius = element("label", "wizard-radius");
    radius.hidden = !useOSM;
    const sliderLabel = element(
      "span",
      "",
      `Search radius: ${this.wizardData.radius_miles} miles`,
    );
    const sliderEl = element("input");
    sliderEl.type = "range";
    sliderEl.min = "0.5";
    sliderEl.max = "30";
    sliderEl.step = "1";
    sliderEl.value = String(this.wizardData.radius_miles || 1.5);
    sliderEl.setAttribute("aria-label", "Search radius in miles");
    radius.append(sliderLabel, sliderEl);
    dialog.body.append(radius);
    sliderEl.addEventListener("input", () => {
      sliderLabel.textContent = `Search radius: ${sliderEl.value} miles`;
    });
    toggle.addEventListener("change", () => {
      useOSM = toggle.checked;
      radius.hidden = !useOSM;
    });
    submitTown = async () => {
      if (findButton.disabled || dialog.disposed) return;

      const townName = input.node.value.trim() || "Cadott, WI";
      this.wizardData.town_name = townName;
      this.wizardData.use_osm = useOSM;
      this.wizardData.radius_miles = parseFloat(sliderEl.value);

      if (useOSM) {
        const searchToken = Symbol("town-search");
        this.townSearchToken = searchToken;
        const isCurrentSearch = () =>
          this.scene.isActive() && this.townSearchToken === searchToken;
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
          if (!isCurrentSearch()) return;
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
            if (!isCurrentSearch()) return;
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
            if (!isCurrentSearch()) return;
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
          if (!isCurrentSearch()) return;
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
    };
    findButton = wizardButton(
      dialog.footer,
      "FIND & CONTINUE",
      () => void submitTown(),
      true,
    );
    input.node.focus();
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

    const picker = document.createElement("select");
    picker.setAttribute("aria-label", "Starting location");
    picker.size = Math.min(maxShow, 6);
    picker.style.cssText =
      "width:460px;padding:8px;background:#1c2a3a;color:#e9eef7;border:1px solid #94a8bd;border-radius:8px;font:13px Arial;";
    pois.slice(0, maxShow).forEach((poi, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = poi.name;
      picker.append(option);
    });
    picker.value = String(selectedIdx);
    picker.addEventListener("change", () => {
      selectedIdx = Number(picker.value);
      this.wizardData.spawn_node_id = pois[selectedIdx].id;
    });
    selectKeyboard(picker);
    this.contentGroup.add(
      this.add.dom(this.cx, 110 + Math.min(maxShow, 6) * 11, picker),
    );
    this.addLabel(
      110 + Math.min(maxShow, 6) * 22 + 25,
      "↑↓ choose a location · Tab to actions",
    );

    // Set initial spawn
    this.wizardData.spawn_node_id = pois[selectedIdx].id;

    if (pois.length > maxShow) {
      this.addLabel(
        110 + maxShow * 22,
        `... and ${pois.length - maxShow} more`,
      );
    }

    const btnY = Math.min(110 + (maxShow + 1) * 22 + 60, 440);
    this.addBackButton(btnY);
    this.addButton(btnY, "NEXT", () => {
      this.step++;
      this.showStep();
    });
  }

  showNamedStep(title, description, labels, defaults, values, save) {
    const next = () => {
      save(inputs.map((input, i) => input.value.trim() || defaults[i]));
      this.step++;
      this.showStep();
    };
    const dialog = wizardView(this, title, description, next);
    const inputs = defaults.map((value, i) =>
      wizardInput(dialog.body, labels[i], value, values[i] || ""),
    );
    wizardButton(dialog.footer, "Back", () => this.goBack());
    wizardButton(dialog.footer, "NEXT", next, true);
    inputs[0].focus();
  }

  showPeopleStep() {
    const people = this.wizardData.people;
    this.showNamedStep(
      "NAME YOUR NPCs",
      "These people become quest-givers, shopkeepers, or rivals. You choose your party later.",
      ["Person 1", "Person 2", "Person 3"],
      DEFAULT_PEOPLE.map((person, i) => people[i]?.name || person.name),
      people.map((person) => person.name),
      (names) => {
        this.wizardData.people = names.map((name, i) => ({
          name,
          relation: people[i]?.relation || DEFAULT_PEOPLE[i].relation,
        }));
      },
    );
  }

  showPlacesStep() {
    this.showNamedStep(
      "NAME YOUR PLACES",
      "Choose three places that matter in your town.",
      ["Place 1", "Place 2", "Place 3"],
      ["The School", "Creswood Corners", "Fire Hall"],
      this.wizardData.places,
      (places) => {
        this.wizardData.places = places;
      },
    );
  }

  showBigBuildingStep() {
    this.showNamedStep(
      "THE BIG BUILDING",
      "Your town’s biggest building becomes a central landmark.",
      ["Building name"],
      [DEFAULT_BIG_BUILDING],
      [this.wizardData.big_building],
      ([building]) => {
        this.wizardData.big_building = building;
      },
    );
  }

  showPartyStep() {
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

    const dialog = wizardView(
      this,
      "PICK YOUR PARTY",
      "Choose up to four members. The leader defaults to Hero; leave other names blank to skip them.",
      undefined,
      () => {
        collectParty();
        this.goBack();
      },
    );
    const party = element("div", "wizard-party");
    const rows = defaults.map((def, i) =>
      wizardPartyRow(
        party,
        {
          name: prevParty[i]?.name || "",
          class_id: prevParty[i]?.class_id || def.defClass,
          defName: def.defName,
        },
        classList,
        i,
      ),
    );
    dialog.body.append(party);
    const status = wizardStatus(dialog.header);
    wizardButton(dialog.footer, "CANCEL", () => {
      collectParty();
      this.goBack();
    });
    const create = wizardButton(
      dialog.footer,
      "CREATE GAME",
      () => void submit(),
      true,
    );
    const collectParty = () => {
      this.wizardData.party = rows.flatMap((row, i) => {
        const name = row.name.value.trim();
        return i === 0 || name
          ? [{ name: name || defaults[i].defName, class_id: row.select.value }]
          : [];
      });
    };
    const setBusy = (busy) => {
      this.wizardCreateBusy = busy;
      dialog.body.setAttribute("aria-busy", String(busy));
      for (const control of dialog.root.querySelectorAll(
        "input, select, button",
      ))
        control.disabled = busy;
      status.textContent = busy ? "Creating world..." : "";
    };
    const submit = async () => {
      if (this.wizardCreateBusy || dialog.disposed) return;
      collectParty();
      if (this.wizardData.use_osm) this.ensureOSMDefaults();
      const token = Symbol("create-world");
      this.wizardCreateToken = token;
      const current = () =>
        this.scene.isActive() &&
        !dialog.disposed &&
        this.wizardCreateToken === token;
      status.classList.remove("is-error");
      setBusy(true);
      try {
        const result = await this.createGameRequest();
        if (!current()) return;
        if (result.error) throw new Error(result.error);
        this.scene.start("World", { gameState: result });
      } catch (error) {
        if (!current()) return;
        setBusy(false);
        status.textContent = error.message || "Server error. Please try again.";
        status.classList.add("is-error");
        create.focus();
      }
    };
    rows[0].name.focus();
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
