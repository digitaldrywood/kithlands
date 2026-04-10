import { saveGame, equipItem } from '../api.js';
import { playSFX } from '../systems/audio.js';
import { showWorldMap } from './world_interact.js';

export function toggleMenu(scene) {
  if (scene.menuOpen) {
    if (scene.menuGroup) {
      scene.menuGroup.forEach(c => c.destroy());
      scene.menuGroup = null;
    }
    scene.menuOpen = false;
    return;
  }

  scene.menuOpen = true;
  scene.menuGroup = [];
  const gs = scene.gameState;

  // Background panel (wider for equipment) -- interactive to block clicks through to map
  const bg = scene.add.rectangle(400, 300, 700, 500, 0x000000, 0.95)
    .setScrollFactor(0).setDepth(40).setInteractive();
  scene.menuGroup.push(bg);

  const title = scene.add.text(400, 65, 'PARTY MENU', {
    fontSize: '18px', color: '#ffff44', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(41);
  scene.menuGroup.push(title);

  let y = 95;
  for (let i = 0; i < gs.party.length; i++) {
    const p = gs.party[i];
    const eq = gs.equipment ? gs.equipment[i] : {};

    // Name and stats
    const line = scene.add.text(80, y,
      `${p.name} (${p.class_name}) Lv.${p.level}  HP:${p.hp}/${p.max_hp}  STR:${p.str} AGI:${p.agi} INT:${p.int_stat}`,
      { fontSize: '11px', color: '#ffffff', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(41);
    scene.menuGroup.push(line);

    // XP
    const xpLine = scene.add.text(80, y + 16,
      `  XP: ${p.xp}/${p.xp_next}`,
      { fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(41);
    scene.menuGroup.push(xpLine);

    // Equipment
    const weaponName = eq.weapon_name || 'None';
    const armorName = eq.armor_name || 'None';
    const eqLine = scene.add.text(80, y + 30,
      `  Weapon: ${weaponName}  |  Armor: ${armorName}`,
      { fontSize: '10px', color: '#ffcc44', fontFamily: 'monospace' }
    ).setScrollFactor(0).setDepth(41);
    scene.menuGroup.push(eqLine);

    // Equip buttons
    const eqWpnBtn = scene.add.text(540, y + 28, '[Equip Wpn]', {
      fontSize: '9px', color: '#44aaff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
    eqWpnBtn.on('pointerdown', () => showEquipPicker(scene, i, 'weapon'));
    scene.menuGroup.push(eqWpnBtn);

    const eqArmBtn = scene.add.text(630, y + 28, '[Equip Arm]', {
      fontSize: '9px', color: '#44aaff', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
    eqArmBtn.on('pointerdown', () => showEquipPicker(scene, i, 'armor'));
    scene.menuGroup.push(eqArmBtn);

    // Spells
    if (p.spells && p.spells.length > 0) {
      const spells = scene.add.text(80, y + 44,
        `  Spells: ${p.spells.map(s => `${s.name}(${s.charges})`).join(', ')}`,
        { fontSize: '9px', color: '#8888ff', fontFamily: 'monospace' }
      ).setScrollFactor(0).setDepth(41);
      scene.menuGroup.push(spells);
      y += 65;
    } else {
      y += 52;
    }
  }

  // Gold, potions, items
  y += 5;
  const inv = scene.add.text(80, y,
    `Gold: ${gs.gold}  |  Potions: ${gs.potions}`,
    { fontSize: '12px', color: '#ffcc44', fontFamily: 'monospace' }
  ).setScrollFactor(0).setDepth(41);
  scene.menuGroup.push(inv);

  // Other items
  if (gs.items && gs.items.length > 0) {
    y += 18;
    const itemStr = gs.items.map(i => `${i.name}(${i.count})`).join(', ');
    const itemLine = scene.add.text(80, y, `Items: ${itemStr}`, {
      fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(41);
    scene.menuGroup.push(itemLine);
  }

  // Use potion button
  if (gs.potions > 0) {
    const useBtn = scene.add.text(400, y + 35, '[ USE POTION ]', {
      fontSize: '13px', color: '#44ff44', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
    useBtn.on('pointerover', () => useBtn.setColor('#88ff88'));
    useBtn.on('pointerout', () => useBtn.setColor('#44ff44'));
    useBtn.on('pointerdown', () => useOverworldPotion(scene));
    scene.menuGroup.push(useBtn);
  }

  // Save button (always available on world map)
  y += 55;
  const saveBtn = scene.add.text(400, y, '[ SAVE GAME ]', {
    fontSize: '13px', color: '#4488ff', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
  saveBtn.on('pointerover', () => saveBtn.setColor('#88bbff'));
  saveBtn.on('pointerout', () => saveBtn.setColor('#4488ff'));
  saveBtn.on('pointerdown', async () => {
    saveBtn.setText('Saving...');
    const gss = scene.gameState;
    const name = `${gss.location} - ${gss.party.map(p => p.name).join(', ')}`;
    const result = await saveGame(gss.id, name);
    playSFX('sfx_save');
    toggleMenu(scene);
    if (result.error) {
      scene.showMessage(`Save failed: ${result.error}`);
    } else {
      scene.showMessage('Game saved!');
    }
    scene.time.delayedCall(1500, () => scene.hideMessage());
  });
  scene.menuGroup.push(saveBtn);

  // World map button
  const mapBtn = scene.add.text(250, y, '[ WORLD MAP ]', {
    fontSize: '13px', color: '#ffcc44', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
  mapBtn.on('pointerdown', () => { toggleMenu(scene); showWorldMap(scene); });
  scene.menuGroup.push(mapBtn);

  // Close
  const closeBtn = scene.add.text(400, 545, '[ CLOSE (M/ESC) ]', {
    fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(41).setInteractive({ useHandCursor: true });
  closeBtn.on('pointerdown', () => toggleMenu(scene));
  scene.menuGroup.push(closeBtn);
}

export async function showEquipPicker(scene, slot, type) {
  // Close menu first
  if (scene.menuGroup) {
    scene.menuGroup.forEach(c => c.destroy());
    scene.menuGroup = null;
  }

  const gs = scene.gameState;
  const overlay = [];

  // Find available items from inventory
  const prefix = type === 'weapon' ? 'wpn_' : 'arm_';
  const available = [];

  // Get items from game state inventory
  if (gs.items) {
    for (const item of gs.items) {
      if (item.id.startsWith(prefix)) {
        const realId = item.id.substring(prefix.length);
        available.push({ id: realId, name: item.name, count: item.count });
      }
    }
  }

  // Also check consumables for prefixed items
  // These come through as items in the state

  const bg = scene.add.rectangle(400, 300, 400, 200 + available.length * 30, 0x111144, 0.95)
    .setStrokeStyle(2, 0x4444aa).setScrollFactor(0).setDepth(50);
  overlay.push(bg);

  const title = scene.add.text(400, 220, `Equip ${type} for ${gs.party[slot].name}:`, {
    fontSize: '13px', color: '#ffffff', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
  overlay.push(title);

  if (available.length === 0) {
    const none = scene.add.text(400, 280, 'No items available.\nBuy gear at the General Store!', {
      fontSize: '12px', color: '#666666', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    overlay.push(none);
  } else {
    let y = 255;
    for (const item of available) {
      const row = scene.add.text(400, y, `${item.name} (x${item.count})`, {
        fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
      row.on('pointerover', () => row.setColor('#ffffff'));
      row.on('pointerout', () => row.setColor('#aaaaff'));
      row.on('pointerdown', async () => {
        const result = await equipItem(gs.id, slot, item.id, type);
        if (!result.error) {
          scene.gameState = result;
          scene.showMessage(`Equipped: ${item.name}`);
          scene.updateHUD();
          scene.time.delayedCall(1000, () => scene.hideMessage());
        }
        overlay.forEach(o => o.destroy());
        scene.menuOpen = false;
      });
      overlay.push(row);
      y += 30;
    }
  }

  const closeBtn = scene.add.text(400, 380 + available.length * 15, '[ CANCEL ]', {
    fontSize: '11px', color: '#888888', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
  closeBtn.on('pointerdown', () => {
    overlay.forEach(o => o.destroy());
    scene.menuOpen = false;
  });
  overlay.push(closeBtn);
}

export function useOverworldPotion(scene) {
  const gs = scene.gameState;
  if (gs.potions <= 0) return;

  // Find most damaged living party member
  let target = null;
  for (const p of gs.party) {
    if (p.hp > 0 && p.hp < p.max_hp) {
      if (!target || p.hp < target.hp) target = p;
    }
  }
  if (!target) {
    scene.showMessage('No one needs healing.');
    scene.time.delayedCall(1500, () => scene.hideMessage());
    return;
  }

  // Apply locally (server will validate on next action)
  target.hp = Math.min(target.max_hp, target.hp + 30);
  gs.potions--;
  scene.showMessage(`${target.name} used a Potion. HP: ${target.hp}/${target.max_hp}`);
  scene.time.delayedCall(1500, () => scene.hideMessage());
  toggleMenu(scene); // close and reopen to refresh
  scene.updateHUD();
}
