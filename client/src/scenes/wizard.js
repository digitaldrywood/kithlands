import { element } from "../ui/viewport_dialog.js";
import {
  wizardView,
  wizardButton,
  wizardInput,
  wizardStatus,
  wizardPartyRow,
} from "../ui/wizard_view.js";
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

export class WizardScene extends Phaser.Scene {
  constructor() {
    super("Wizard");
  }

  create() {
    this.step = 0;
    this.townSearchToken = null;
    this.wizardCreateToken = null;
    this.wizardCreateBusy = false;
    this.events.once("shutdown", () => {
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
    this.showStep();
  }

  showStep() {
    this.clearContent();
    // Skip POI step when not using OSM
    if (!this.wizardData.use_osm && this.step === 1) {
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
          this.wizardData.people = DEFAULT_PEOPLE.map((person) => ({
            ...person,
          }));
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
    }
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
    const pois = sortPOIsByImportance(this.wizardData.osm_preview || []);
    const dialog = wizardView(
      this,
      "DISCOVERED LOCATIONS",
      pois.length
        ? `Found ${pois.length} locations. Choose your starting point.`
        : "No points of interest found. The game will generate locations for you.",
    );
    if (pois.length) {
      const label = element("label", "wizard-field");
      label.append(element("span", "", "Starting location"));
      const picker = element("select");
      picker.setAttribute("aria-label", "Starting location");
      for (const poi of pois.slice(0, 12)) {
        const option = element("option", "", poi.name || "Unnamed location");
        option.value = poi.id;
        picker.append(option);
      }
      picker.value = this.wizardData.spawn_node_id;
      if (picker.selectedIndex < 0) picker.selectedIndex = 0;
      this.wizardData.spawn_node_id = picker.value;
      picker.addEventListener("change", () => {
        this.wizardData.spawn_node_id = picker.value;
      });
      label.append(picker);
      dialog.body.append(label);
    }
    wizardButton(dialog.footer, "Back", () => this.goBack());
    wizardButton(
      dialog.footer,
      "NEXT",
      () => {
        this.step++;
        this.showStep();
      },
      true,
    );
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
}
