import { newGame, getClasses, geocode } from '../api.js';

export class WizardScene extends Phaser.Scene {
  constructor() {
    super('Wizard');
  }

  create() {
    this.step = 0;
    this.wizardData = {
      town_name: '',
      people: [],
      places: [],
      big_building: '',
      party: [],
      difficulty: 'normal',
    };

    this.cx = 400;
    this.contentGroup = this.add.group();
    this.showStep();
  }

  clearContent() {
    this.contentGroup.clear(true, true);
    // Remove any DOM elements
    this.children.list
      .filter(c => c.type === 'DOMElement')
      .forEach(c => c.destroy());
  }

  showStep() {
    this.clearContent();

    switch (this.step) {
      case 0: this.showTownStep(); break;
      case 1: this.showPeopleStep(); break;
      case 2: this.showPlacesStep(); break;
      case 3: this.showBigBuildingStep(); break;
      case 4: this.showPartyStep(); break;
      case 5: this.startGameStep(); break;
    }
  }

  addTitle(text) {
    const t = this.add.text(this.cx, 40, text, {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace', wordWrap: { width: 700 },
    }).setOrigin(0.5, 0);
    this.contentGroup.add(t);
    return t;
  }

  addLabel(y, text) {
    const t = this.add.text(this.cx, y, text, {
      fontSize: '14px', color: '#cccccc', fontFamily: 'monospace', wordWrap: { width: 600 },
    }).setOrigin(0.5, 0);
    this.contentGroup.add(t);
    return t;
  }

  addInput(y, placeholder, width = 300) {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = placeholder;
    el.style.cssText = `font-size:16px;padding:6px 12px;width:${width}px;text-align:center;background:#222;color:#fff;border:2px solid #555;outline:none;font-family:monospace;`;
    return this.add.dom(this.cx, y, el);
  }

  addButton(y, label, callback) {
    const btn = this.add.text(this.cx, y, `[ ${label} ]`, {
      fontSize: '20px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#88ff88'));
    btn.on('pointerout', () => btn.setColor('#44ff44'));
    btn.on('pointerdown', callback);
    this.contentGroup.add(btn);
    return btn;
  }

  showTownStep() {
    this.addTitle('LOCALITY WIZARD');
    this.addLabel(80, 'Where do you live? This becomes the world of your game.\nEnter a town name or address to build from real-world map data.');
    const input = this.addInput(140, 'Town name or address (e.g. Cadott, WI)');

    // Status text for geocoding
    const status = this.add.text(this.cx, 175, '', {
      fontSize: '11px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.contentGroup.add(status);

    // Use real map toggle
    let useOSM = true;
    const osmToggle = this.add.text(this.cx, 200, '[X] Use real-world map data (OpenStreetMap)', {
      fontSize: '12px', color: '#44aaff', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    osmToggle.on('pointerdown', () => {
      useOSM = !useOSM;
      osmToggle.setText(`[${useOSM ? 'X' : ' '}] Use real-world map data (OpenStreetMap)`);
      osmToggle.setColor(useOSM ? '#44aaff' : '#666666');
    });
    this.contentGroup.add(osmToggle);

    this.addButton(260, 'FIND & CONTINUE', async () => {
      const townName = input.node.value.trim() || 'Cadott, WI';
      this.wizardData.town_name = townName;
      this.wizardData.use_osm = useOSM;

      if (useOSM) {
        status.setText('Looking up location...').setColor('#ffcc44');
        try {
          const result = await geocode(townName);
          if (result.error) {
            status.setText(`Not found: ${result.error}`).setColor('#ff4444');
            return;
          }
          this.wizardData.lat = result.lat;
          this.wizardData.lng = result.lng;
          status.setText(`Found: ${result.display_name}`).setColor('#44ff44');
          // Brief pause to show result
          this.time.delayedCall(1000, () => { this.step++; this.showStep(); });
        } catch (e) {
          status.setText('Geocoding failed. Continuing without OSM.').setColor('#ff8844');
          this.wizardData.use_osm = false;
          this.time.delayedCall(1500, () => { this.step++; this.showStep(); });
        }
      } else {
        this.step++;
        this.showStep();
      }
    });
  }

  showPeopleStep() {
    this.addTitle('NAME YOUR NPCs');
    this.addLabel(70, 'Name 3 people from your town. They become NPCs --\nquest-givers, shopkeepers, or even the villain.\nThey are NOT your party (you pick your party next).');

    const defaults = [
      { name: 'Bob', rel: 'friendly' },
      { name: 'Mrs Henderson', rel: 'neutral' },
      { name: 'Mayor Grimes', rel: 'rival' },
    ];

    const inputs = [];
    for (let i = 0; i < 3; i++) {
      this.addLabel(150 + i * 70, `NPC ${i + 1}:`);
      const nameInput = this.addInput(175 + i * 70, defaults[i].name, 200);
      inputs.push({ nameInput, defaultName: defaults[i].name, defaultRel: defaults[i].rel });
    }

    this.addButton(400, 'NEXT', () => {
      this.wizardData.people = inputs.map(inp => ({
        name: inp.nameInput.node.value.trim() || inp.defaultName,
        relation: inp.defaultRel,
      }));
      this.step++;
      this.showStep();
    });
  }

  showPlacesStep() {
    this.addTitle('NAME YOUR PLACES');
    this.addLabel(80, 'Name 3 places that matter in your town.');

    const defaults = ['The School', 'Creswood Corners', 'Fire Hall'];
    const inputs = [];
    for (let i = 0; i < 3; i++) {
      this.addLabel(140 + i * 60, `Place ${i + 1}:`);
      const input = this.addInput(165 + i * 60, defaults[i], 250);
      inputs.push({ input, def: defaults[i] });
    }

    this.addButton(380, 'NEXT', () => {
      this.wizardData.places = inputs.map(inp => inp.input.node.value.trim() || inp.def);
      this.step++;
      this.showStep();
    });
  }

  showBigBuildingStep() {
    this.addTitle('THE BIG BUILDING');
    this.addLabel(80, 'What\'s the biggest building in town?\nThis becomes the final dungeon or seat of power.');
    const input = this.addInput(150, 'Town Hall');
    this.addButton(220, 'NEXT', () => {
      this.wizardData.big_building = input.node.value.trim() || 'Town Hall';
      this.step++;
      this.showStep();
    });
  }

  showPartyStep() {
    this.addTitle('PICK YOUR PARTY');
    this.addLabel(70, 'Choose 2 party members for the demo.\nClasses: warrior, brawler, rogue, mender, cinder, wayfarer');

    const slots = [
      { defName: 'Hero', defClass: 'warrior' },
      { defName: 'Sparks', defClass: 'cinder' },
    ];

    const inputs = [];
    for (let i = 0; i < 2; i++) {
      this.addLabel(140 + i * 100, `Slot ${i + 1}:`);
      const nameInput = this.addInput(165 + i * 100, `Name (${slots[i].defName})`, 180);
      const classInput = this.addInput(200 + i * 100, `Class (${slots[i].defClass})`, 180);
      inputs.push({ nameInput, classInput, def: slots[i] });
    }

    this.addButton(420, 'BEGIN ADVENTURE', () => {
      this.wizardData.party = inputs.map(inp => ({
        name: inp.nameInput.node.value.trim() || inp.def.defName,
        class_id: inp.classInput.node.value.trim().toLowerCase() || inp.def.defClass,
      }));
      this.step++;
      this.showStep();
    });
  }

  async startGameStep() {
    this.addTitle('Creating your world...');
    const osmMsg = this.wizardData.use_osm ? 'Fetching real-world map data from OpenStreetMap...' : 'Generating locality, campaign, and encounters...';
    this.addLabel(100, osmMsg);

    try {
      const result = await newGame(this.wizardData);
      if (result.error) {
        this.addLabel(200, `Error: ${result.error}`).setColor('#ff4444');
        return;
      }
      this.scene.start('World', { gameState: result });
    } catch (e) {
      this.addLabel(200, 'Server error. Is the backend running?').setColor('#ff4444');
    }
  }
}
