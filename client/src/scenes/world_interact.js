import { saveGame, autosaveGame } from '../api.js';
import { playSFX, playMusic } from '../systems/audio.js';
import { getAutosaveEnabled } from '../systems/prefs.js';
import { openShop } from './world_shop.js';

// TILE_COLORS needed for world map rendering
const TILE_COLORS = {
  0: 0x4CAF50, // grass
  1: 0xD2B48C, // path
  2: 0x2196F3, // water
  3: 0x2E7D32, // tree
  4: 0x795548, // building
  5: 0xFFC107, // door
  6: 0xBCAAA4, // floor
  7: 0x9E9E9E, // rock
  8: 0x66BB6A, // bush
  9: 0x388E3C, // dark grass
  10: 0x1B5E20, // forest (darker)
  11: 0x8D6E63, // hill
  12: 0xFFE082, // sand
};

export function interactWithDoor(scene) {
  if (scene.animating || scene.menuOpen || scene.gameOver) return;
  const spawn = scene.currentDoorSpawn;
  if (!spawn) return;

  hideInteractPrompt(scene);
  scene.currentDoorSpawn = null;

  const tags = spawn.tags || [];
  const isShop = tags.includes('shop') || tags.includes('commerce');
  const isInn = tags.includes('rest');
  const isTemple = tags.includes('temple') || tags.includes('revive');

  if (isShop) {
    playSFX('sfx_door');
    playMusic('music_shop');
    openShop(scene, spawn);
  } else if (isTemple) {
    const dead = scene.gameState.party.filter(p => p.hp <= 0);
    if (dead.length > 0) {
      dead.forEach(p => { p.hp = 1; p.status = ''; });
      scene.showMessage(`Temple of Light\n${dead.map(p => p.name).join(', ')} revived!`);
    } else {
      scene.gameState.party.forEach(p => { p.hp = p.max_hp; });
      scene.showMessage(`Temple of Light\nBlessings upon you. HP fully restored!`);
    }
    playSFX('sfx_heal');
    scene.updateHUD();
    silentAutosave(scene, 'temple_visit');
    scene.time.delayedCall(2000, () => { scene.hideMessage(); offerSave(scene, 'Temple of Light'); });
  } else if (isInn) {
    scene.gameState.party.forEach(p => { if (p.hp > 0) p.hp = p.max_hp; });
    playSFX('sfx_heal');
    playMusic('music_inn', false);
    scene.showMessage(`Rested at ${spawn.name}.\nHP and spells restored!`);
    scene.updateHUD();
    silentAutosave(scene, 'inn_rest');
    scene.time.delayedCall(2000, () => { scene.hideMessage(); offerSave(scene, spawn.name); });
  } else {
    scene.showMessage(`Entered: ${spawn.name}`);
    scene.time.delayedCall(1500, () => scene.hideMessage());
  }

  // Quest advance when entering any building
  const gs = scene.gameState;
  if (gs.current_quest < gs.quests.length) {
    scene.triggerQuestAdvance(spawn.name);
  }
}

export function offerSave(scene, locationName) {
  scene.animating = true;
  const ol = [];

  const bg = scene.add.rectangle(400, 300, 400, 160, 0x112233, 0.95)
    .setStrokeStyle(2, 0x4488ff).setScrollFactor(0).setDepth(50).setInteractive();
  ol.push(bg);

  ol.push(scene.add.text(400, 250, `Save your progress at ${locationName}?`, {
    fontSize: '13px', color: '#ffffff', fontFamily: 'monospace',
    wordWrap: { width: 350 },
  }).setOrigin(0.5).setScrollFactor(0).setDepth(51));

  const yesBtn = scene.add.text(330, 310, '[ SAVE ]', {
    fontSize: '16px', color: '#44ff44', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
  yesBtn.on('pointerover', () => yesBtn.setColor('#88ff88'));
  yesBtn.on('pointerout', () => yesBtn.setColor('#44ff44'));
  yesBtn.on('pointerdown', async () => {
    yesBtn.setText('Saving...');
    const gs = scene.gameState;
    const name = `${gs.location} - ${gs.party.map(p => p.name).join(', ')}`;
    const result = await saveGame(gs.id, name);
    ol.forEach(o => o.destroy());
    scene.animating = false;
    if (result.error) {
      scene.showMessage(`Save failed: ${result.error}`);
    } else {
      scene.showMessage('Game saved!');
    }
    scene.time.delayedCall(1500, () => scene.hideMessage());
  });
  ol.push(yesBtn);

  const noBtn = scene.add.text(470, 310, '[ NO ]', {
    fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true });
  noBtn.on('pointerdown', () => {
    ol.forEach(o => o.destroy());
    scene.animating = false;
  });
  ol.push(noBtn);
}

export function showWorldMap(scene) {
  scene.animating = true;
  const ol = [];

  // Full screen map overlay
  const bg = scene.add.rectangle(400, 300, 780, 560, 0x000000, 0.95)
    .setScrollFactor(0).setDepth(50).setInteractive();
  ol.push(bg);

  ol.push(scene.add.text(400, 30, 'WORLD MAP', {
    fontSize: '18px', color: '#ffff44', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(51));

  // Draw large minimap
  const mmW = 600, mmH = 440;
  const mmX = 100, mmY = 55;
  const scaleX = mmW / scene.mapW;
  const scaleY = mmH / scene.mapH;

  const mmGfx = scene.add.graphics().setScrollFactor(0).setDepth(51);
  for (let y = 0; y < scene.mapH; y++) {
    for (let x = 0; x < scene.mapW; x++) {
      const tile = scene.tileData[y][x];
      const color = TILE_COLORS[tile] || 0x000000;
      mmGfx.fillStyle(color, 1);
      mmGfx.fillRect(mmX + x * scaleX, mmY + y * scaleY, Math.max(1, scaleX), Math.max(1, scaleY));
    }
  }
  ol.push(mmGfx);

  // Location labels on the map
  for (const spawn of scene.spawns) {
    if (spawn.kind === 'natural') continue;
    const sx = mmX + spawn.x * scaleX;
    const sy = mmY + spawn.y * scaleY;

    mmGfx.fillStyle(0xffffff, 1);
    mmGfx.fillRect(sx - 2, sy - 2, 5, 5);

    const label = scene.add.text(sx, sy - 8, spawn.name, {
      fontSize: '7px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#00000099',
      padding: { x: 1, y: 0 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(52);
    ol.push(label);
  }

  // Player position
  const px = mmX + scene.playerX * scaleX;
  const py = mmY + scene.playerY * scaleY;
  const playerDot = scene.add.circle(px, py, 4, 0xff4444).setScrollFactor(0).setDepth(52);
  ol.push(playerDot);

  ol.push(scene.add.text(400, 545, '[ CLOSE (ESC) ]', {
    fontSize: '13px', color: '#aaaaaa', fontFamily: 'monospace',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setInteractive({ useHandCursor: true })
    .on('pointerdown', () => { ol.forEach(o => o.destroy()); scene.animating = false; }));

  scene.input.keyboard.once('keydown-ESC', () => {
    ol.forEach(o => o.destroy());
    scene.animating = false;
  });
}

export function showInteractPrompt(scene, spawn) {
  hideInteractPrompt(scene);
  const tags = spawn.tags || [];
  let action = 'Enter';
  if (tags.includes('shop') || tags.includes('commerce')) action = 'Shop';
  else if (tags.includes('rest')) action = 'Rest';
  else if (tags.includes('temple') || tags.includes('revive')) action = 'Pray';

  scene.interactPrompt = scene.add.text(
    scene.player.x,
    scene.player.y - 30,
    `[ ENTER / SPACE ] ${action} at ${spawn.name}`,
    {
      fontSize: '10px', color: '#ffff44', fontFamily: 'monospace',
      backgroundColor: '#000000cc',
      padding: { x: 6, y: 3 },
    }
  ).setOrigin(0.5).setDepth(15);
}

export function hideInteractPrompt(scene) {
  if (scene.interactPrompt) {
    scene.interactPrompt.destroy();
    scene.interactPrompt = null;
  }
}

function silentAutosave(scene, triggerEvent) {
  if (!getAutosaveEnabled()) return;
  const gs = scene.gameState;
  if (!gs?.id) return;
  autosaveGame(gs.id, triggerEvent).then(() => {
    if (scene.flashSaveIcon) scene.flashSaveIcon();
  }).catch(e => console.error('[Autosave] failed:', e));
}
