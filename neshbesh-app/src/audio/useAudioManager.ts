/**
 * useAudioManager — A singleton audio hook for NeshBesh game sound effects.
 *
 * Uses expo-av for playback. Each sound is loaded lazily on first use and
 * cached for subsequent plays. Provides fire-and-forget `play*` methods.
 *
 * To swap in real audio assets later, replace the `require(...)` paths
 * in the SOUND_ASSETS map below.
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
  | 'tableFlip';

/**
 * Sound asset map — replace these URIs with bundled `require('../assets/audio/x.mp3')`
 * once you have real audio files. For now we use freely available sound-effect
 * generator URLs as placeholders.
 *
 * The structure allows easy hot-swapping:
 *   SOUND_ASSETS.rollDice = require('../assets/audio/dice_roll.mp3');
 */
const SOUND_ASSETS: Record<SoundEvent, AVPlaybackSource | null> = {
  rollDice: null,
  movePiece: null,
  eatPiece: null,
  championshipWin: null,
  specialRoll: null,
  tableFlip: null,
};

// ── Singleton sound cache ─────────────────────────────────────────────────────
const soundCache: Partial<Record<SoundEvent, Audio.Sound>> = {};
let audioModeConfigured = false;

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

// ── Public hook ───────────────────────────────────────────────────────────────

export interface AudioManager {
  playRollDice: () => void;
  playMovePiece: () => void;
  playEatPiece: () => void;
  playChampionshipWin: () => void;
  playSpecialRoll: () => void;
  playTableFlip: () => void;
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

  return {
    playRollDice,
    playMovePiece,
    playEatPiece,
    playChampionshipWin,
    playSpecialRoll,
    playTableFlip,
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
