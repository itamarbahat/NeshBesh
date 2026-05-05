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
// Per-die events (US-011): roll / land / collision are split per-die so
// the staggered playback in US-014 can address each die independently.
// `bearOff` (US-013) is a distinct percussive cue for a checker leaving
// the board. All four are wired into the upcoming reference recording in
// US-015 — until then, callers tolerate `null` assets and silently no-op.
export type SoundEvent =
  | 'rollDice'
  | 'movePiece'
  | 'eatPiece'
  | 'championshipWin'
  | 'specialRoll'
  | 'tableFlip'
  | 'diceShake'
  | 'diceLand'
  | 'checkerClick'
  | 'dieRoll'
  | 'dieLand'
  | 'dieCollision'
  | 'bearOff';

const SOUND_ASSETS: Record<SoundEvent, AVPlaybackSource | null> = {
  rollDice: null,
  // movePiece is intentionally null — the user's reference recording is
  // wired to `checkerClick` and App.tsx fires both on every move; keeping
  // movePiece null prevents a double-trigger.
  movePiece: null,
  eatPiece: null,
  championshipWin: null,
  specialRoll: null,
  tableFlip: null,
  // Legacy procedural shake / land suppressed: `dieRoll` carries the full
  // throw recording (shake + land), so the loops below would only stack a
  // second layer on top of it. Kept as null so the US-014 self-suppression
  // gate has nothing to suppress and the loaders just return null.
  diceShake: null,
  diceLand: null,
  // US-015 — reference-derived audio (Path A: real recordings, soft volume).
  //   • dieRoll: user's `dice shrowing sound.mp3`. The file contains many
  //     throws back-to-back; we play it from position 0 each time so each
  //     trigger uses the first throw segment. Played at low volume (0.25)
  //     for the "soft and light" character requested.
  //   • dieLand: null. The throw recording already includes the landing
  //     impact, so a separate land cue would double-trigger.
  //   • dieCollision: procedural high-bandpass tick (`die-collision.wav`),
  //     soft amplitude. Sits inside the throw recording without competing.
  //   • bearOff: procedural bell-like chime (`bear-off.wav`), distinct
  //     from the user's moving recording so bear-off has its own cue
  //     layered on top of the regular move sound (per US-013 spec).
  //   • checkerClick: user's `moving sound.mp3`, played softly on every
  //     successful checker move (including bear-off, where `bearOff`
  //     plays alongside it for the layered cue).
  dieRoll: require('../../assets/sfx/dice-throw.mp3'),
  dieLand: null,
  dieCollision: require('../../assets/sfx/die-collision.wav'),
  bearOff: require('../../assets/sfx/bear-off.wav'),
  checkerClick: require('../../assets/sfx/checker-move.mp3'),
};

// Collision-rate limiter — US-012 plays one tick per discrete contact event,
// not one per integration tick when bodies skim. Earliest wall-clock at which
// a new collision SFX may fire.
let collisionEarliestMs = 0;
const COLLISION_MIN_GAP_MS = 90;

// Die-roll stop timer — the user's reference recording is ~70 s of
// continuous throws; we let only the first ~throw segment play and stop the
// rest at the natural end of the flight so it does not bleed into the
// player's move phase.
let dieRollStopTimer: ReturnType<typeof setTimeout> | null = null;

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
  // US-011 per-die surface — staggered roll/land per die index, plus
  // collision (US-012) and bear-off (US-013). All silently no-op when
  // their underlying asset is `null` (until US-015 lands assets).
  playDieRoll: (dieIndex: 0 | 1, durationMs: number) => void;
  playDieLand: (dieIndex: 0 | 1) => void;
  playDieCollision: () => void;
  playBearOff: () => void;
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
    // US-014: once per-die roll assets are loaded (US-015), the per-die
    // layer carries the rolling SFX and the shake-loop layer is suppressed
    // here to avoid double-triggering. While `dieRoll` is still null, the
    // legacy shake layer remains the only audible roll texture.
    if (SOUND_ASSETS.dieRoll != null) return;
    playShakeForInternal(durationMs);
  }, []);

  const playDiceLand = useCallback(() => {
    // Same gate as playShakeFor — let the per-die land cues drive the
    // landing layer once US-015 lands a `dieLand` asset.
    if (SOUND_ASSETS.dieLand != null) return;
    playSound('diceLand', 0.85);
  }, []);

  const playCheckerClick = useCallback(() => {
    // Soft per-move cue using the user's reference recording (US-015).
    playSound('checkerClick', 0.30);
  }, []);

  // US-011 per-die surface. `dieIndex` is reserved so future stereo panning
  // (left=0, right=1) can be wired without changing the call site.
  // Schedules a stop ~200 ms after the flight so the long shared recording
  // never bleeds into the move phase.
  const playDieRoll = useCallback((dieIndex: 0 | 1, durationMs: number) => {
    if (dieRollStopTimer) { clearTimeout(dieRollStopTimer); dieRollStopTimer = null; }
    playSound('dieRoll', dieIndex === 0 ? 0.25 : 0.18);
    const stopAtMs = Math.max(400, durationMs + 200);
    dieRollStopTimer = setTimeout(() => {
      dieRollStopTimer = null;
      const cached = soundCache.dieRoll;
      if (cached) {
        cached.stopAsync().catch(() => {});
      }
    }, stopAtMs);
  }, []);

  const playDieLand = useCallback((_dieIndex: 0 | 1) => {
    // Asset is null in US-015 — the throw recording carries the landing.
    playSound('dieLand', 0.30);
  }, []);

  const playDieCollision = useCallback(() => {
    const now = Date.now();
    if (now < collisionEarliestMs) return;
    collisionEarliestMs = now + COLLISION_MIN_GAP_MS;
    playSound('dieCollision', 0.40);
  }, []);

  const playBearOff = useCallback(() => {
    // Distinct chime layered on top of the regular move cue (per user
    // spec: "different sound from regular moves" at bear-off).
    playSound('bearOff', 0.55);
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
    playDieRoll,
    playDieLand,
    playDieCollision,
    playBearOff,
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
