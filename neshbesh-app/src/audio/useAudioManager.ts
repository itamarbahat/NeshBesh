/**
 * useAudioManager — A singleton audio hook for NeshBesh game sound effects.
 *
 * Uses expo-av for playback. Each sound is loaded lazily on first use and
 * cached for subsequent plays. Provides fire-and-forget `play*` methods.
 *
 * Dice polish layer:
 *   • playShakeFor(ms) starts the shake loop and stops it after `ms`, with
 *     ±8% pitch modulation every ~150ms for generative texture.
 *   • playDiceLand() fires the percussive landing thud once per roll.
 *   • playCheckerClick() is the soft tick for a successful checker move.
 *
 * Audio assets:
 *   - rollDice / movePiece / eatPiece / etc. remain `null` placeholders
 *     until real assets are wired in.
 *   - The dice-polish layer points at `assets/sfx/*.wav` files generated
 *     by `scripts/generate-sfx.py` (or its TS twin). Both are placeholders
 *     and may be swapped for real assets without touching this file.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Audio, AVPlaybackSource } from 'expo-av';

// ── Sound event names ─────────────────────────────────────────────────────────
export type SoundEvent =
  | 'rollDice'
  | 'movePiece'
  | 'eatPiece'
  | 'championshipWin'
  | 'specialRoll'
  | 'tableFlip'
  | 'diceShake'
  | 'diceLand'
  | 'checkerClick';

const SOUND_ASSETS: Record<SoundEvent, AVPlaybackSource | null> = {
  rollDice: null,
  movePiece: null,
  eatPiece: null,
  championshipWin: null,
  specialRoll: null,
  tableFlip: null,
  diceShake: require('../../assets/sfx/dice-shake-loop.wav'),
  diceLand: require('../../assets/sfx/dice-land.wav'),
  checkerClick: require('../../assets/sfx/checker-click.wav'),
};

// ── Singleton sound cache ─────────────────────────────────────────────────────
const soundCache: Partial<Record<SoundEvent, Audio.Sound>> = {};
let audioModeConfigured = false;

// Shake-specific runtime state — owned at module scope so a new shake call
// can cleanly stop a previous one even if the React component remounts.
const shakeState: {
  sound: Audio.Sound | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
  rateTimer: ReturnType<typeof setInterval> | null;
  generation: number;
} = { sound: null, stopTimer: null, rateTimer: null, generation: 0 };

async function ensureAudioMode() {
  if (audioModeConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    audioModeConfigured = true;
  } catch {
    // Silently fail — audio is non-critical
  }
}

async function loadSound(event: SoundEvent): Promise<Audio.Sound | null> {
  if (soundCache[event]) return soundCache[event]!;

  const asset = SOUND_ASSETS[event];
  if (!asset) return null;

  try {
    await ensureAudioMode();
    const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: false });
    soundCache[event] = sound;
    return sound;
  } catch {
    return null;
  }
}

async function playSound(event: SoundEvent, volume = 1.0): Promise<void> {
  const sound = await loadSound(event);
  if (!sound) return;

  try {
    await sound.setPositionAsync(0);
    await sound.setVolumeAsync(volume);
    await sound.playAsync();
  } catch {
    // Non-critical — silently ignore playback errors
  }
}

// ── Shake / land / click implementations ────────────────────────────────────
async function stopShakeInternal(): Promise<void> {
  if (shakeState.stopTimer) { clearTimeout(shakeState.stopTimer); shakeState.stopTimer = null; }
  if (shakeState.rateTimer) { clearInterval(shakeState.rateTimer); shakeState.rateTimer = null; }
  const s = shakeState.sound;
  shakeState.sound = null;
  if (s) {
    try { await s.stopAsync(); } catch {}
    try { await s.unloadAsync(); } catch {}
  }
  // Drop the cache entry too — we always create a fresh shake sound so
  // looping/rate-state never carries between rolls.
  if (soundCache.diceShake) {
    delete soundCache.diceShake;
  }
}

async function playShakeForInternal(durationMs: number): Promise<void> {
  // Cancel any in-flight shake so we never overlap loops.
  await stopShakeInternal();
  const generation = ++shakeState.generation;
  const asset = SOUND_ASSETS.diceShake;
  if (!asset) return;
  try {
    await ensureAudioMode();
    const { sound } = await Audio.Sound.createAsync(asset, {
      shouldPlay: false,
      isLooping: true,
      volume: 0.55,
    });
    if (generation !== shakeState.generation) {
      // Superseded while loading — clean up.
      try { await sound.unloadAsync(); } catch {}
      return;
    }
    shakeState.sound = sound;
    await sound.setPositionAsync(0);
    await sound.playAsync();

    // Pitch modulation: ±8% rate change every ~150ms. `correctPitch: false`
    // shifts pitch with rate so the rattle gains generative variation.
    shakeState.rateTimer = setInterval(() => {
      const s = shakeState.sound;
      if (!s) return;
      const rate = 1 + (Math.random() * 0.16 - 0.08);
      s.setRateAsync(rate, false).catch(() => {});
    }, 150);

    shakeState.stopTimer = setTimeout(() => {
      // Only stop if we're still the active shake.
      if (generation === shakeState.generation) stopShakeInternal();
    }, durationMs);
  } catch {
    // Non-critical
  }
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface AudioManager {
  playRollDice: () => void;
  playMovePiece: () => void;
  playEatPiece: () => void;
  playChampionshipWin: () => void;
  playSpecialRoll: () => void;
  playTableFlip: () => void;
  playShakeFor: (durationMs: number) => void;
  playDiceLand: () => void;
  playCheckerClick: () => void;
}

/**
 * useAudioManager — returns stable, fire-and-forget audio play functions.
 *
 * Usage:
 * ```tsx
 * const audio = useAudioManager();
 * audio.playRollDice();
 * ```
 */
export function useAudioManager(): AudioManager {
  // Unload sounds when component unmounts (cleanup)
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // Eagerly warm up audio mode
    ensureAudioMode();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const playRollDice = useCallback(() => {
    playSound('rollDice', 0.8);
  }, []);

  const playMovePiece = useCallback(() => {
    playSound('movePiece', 0.6);
  }, []);

  const playEatPiece = useCallback(() => {
    playSound('eatPiece', 1.0);
  }, []);

  const playChampionshipWin = useCallback(() => {
    playSound('championshipWin', 1.0);
  }, []);

  const playSpecialRoll = useCallback(() => {
    playSound('specialRoll', 0.7);
  }, []);

  const playTableFlip = useCallback(() => {
    playSound('tableFlip', 0.9);
  }, []);

  const playShakeFor = useCallback((durationMs: number) => {
    playShakeForInternal(durationMs);
  }, []);

  const playDiceLand = useCallback(() => {
    playSound('diceLand', 0.85);
  }, []);

  const playCheckerClick = useCallback(() => {
    playSound('checkerClick', 0.55);
  }, []);

  return {
    playRollDice,
    playMovePiece,
    playEatPiece,
    playChampionshipWin,
    playSpecialRoll,
    playTableFlip,
    playShakeFor,
    playDiceLand,
    playCheckerClick,
  };
}

/**
 * Utility to set a real audio asset at runtime (useful for loading from CDN).
 *
 * Example:
 *   setSoundAsset('rollDice', { uri: 'https://example.com/dice.mp3' });
 *   setSoundAsset('rollDice', require('../assets/audio/dice_roll.mp3'));
 */
export function setSoundAsset(event: SoundEvent, source: AVPlaybackSource): void {
  SOUND_ASSETS[event] = source;
  // Invalidate cache so next play re-loads
  if (soundCache[event]) {
    soundCache[event]!.unloadAsync().catch(() => {});
    delete soundCache[event];
  }
}

/**
 * Cleanup all cached sounds. Call once on app shutdown if needed.
 */
export async function unloadAllSounds(): Promise<void> {
  await stopShakeInternal();
  const events = Object.keys(soundCache) as SoundEvent[];
  await Promise.all(
    events.map(async (e) => {
      try {
        await soundCache[e]?.unloadAsync();
      } finally {
        delete soundCache[e];
      }
    }),
  );
}
