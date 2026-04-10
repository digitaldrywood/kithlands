/**
 * Audio manager singleton for Kithlands.
 * Handles music playback with crossfading and SFX.
 */

let instance = null;
let scene = null;
let currentMusic = null;
let currentMusicKey = null;
let musicVolume = 0.4;
let sfxVolume = 0.6;
let muted = false;

export function initAudio(phaserScene) {
  scene = phaserScene;
  if (!instance) {
    instance = true;
    // Load mute preference
    try {
      const saved = localStorage.getItem("kithlands_muted");
      if (saved === "true") muted = true;
    } catch (e) {
      /* ignore */
    }
  }
}

export function playMusic(key, loop = true) {
  if (!scene || !scene.sound) return;
  if (key === currentMusicKey) return; // already playing

  // Browsers block audio until the first user gesture. If the sound manager
  // is still locked, remember the request and retry once Phaser emits
  // 'unlocked' after the first click/tap.
  if (scene.sound.locked) {
    currentMusicKey = key;
    const pending = scene;
    pending.sound.once('unlocked', () => {
      // Only play if no newer call has taken over in the meantime.
      if (currentMusicKey === key) {
        currentMusicKey = null; // force playMusic to actually start it
        playMusic(key, loop);
      }
    });
    return;
  }

  // Stop current music with fade
  if (currentMusic && currentMusic.isPlaying) {
    const old = currentMusic;
    scene.tweens.add({
      targets: old,
      volume: 0,
      duration: 500,
      onComplete: () => old.stop(),
    });
  }

  currentMusicKey = key;
  if (scene.cache.audio.exists(key)) {
    currentMusic = scene.sound.add(key, {
      loop,
      volume: muted ? 0 : musicVolume,
    });
    currentMusic.play();
  }
}

export function stopMusic() {
  if (currentMusic && currentMusic.isPlaying) {
    currentMusic.stop();
  }
  currentMusic = null;
  currentMusicKey = null;
}

export function playSFX(key) {
  if (!scene || !scene.sound || muted) return;
  if (scene.cache.audio.exists(key)) {
    scene.sound.play(key, { volume: sfxVolume });
  }
}

export function toggleMute() {
  muted = !muted;
  if (currentMusic) {
    currentMusic.volume = muted ? 0 : musicVolume;
  }
  try {
    localStorage.setItem("kithlands_muted", String(muted));
  } catch (e) {
    /* ignore */
  }
  return muted;
}

export function isMuted() {
  return muted;
}

export function setMusicVolume(vol) {
  musicVolume = Math.max(0, Math.min(1, vol));
  if (currentMusic && !muted) {
    currentMusic.volume = musicVolume;
  }
}

export function setSFXVolume(vol) {
  sfxVolume = Math.max(0, Math.min(1, vol));
}
