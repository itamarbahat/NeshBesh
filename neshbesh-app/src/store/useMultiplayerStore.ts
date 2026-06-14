import { create } from 'zustand';
import {
  generateRoomCode, createRoom, joinRoom, subscribeToRoom,
  setInitialDie, clearInitialDice, setRound, sendGuestAction, RoomData,
} from '../services/multiplayerService';
import { Unsubscribe } from 'firebase/database';
import { rollDie } from '../engine';
import { useGameStore } from './useGameStore';

export type LobbyScreen = 'lobby' | 'initialRoll' | 'game';
export type LobbyState = 'IDLE' | 'HOSTING' | 'JOINING' | 'CONNECTED' | 'INITIAL_ROLL';
export type GameMode = 'local' | 'remote';

export interface MultiplayerState {
  // Navigation
  screen: LobbyScreen;

  // Lobby
  lobbyState: LobbyState;
  playerName: string;
  opponentName: string;
  roomId: string | null;
  role: 'host' | 'guest' | null;
  isMultiplayer: boolean;
  gameMode: GameMode;

  // Initial roll
  myDie: number | null;
  opponentDie: number | null;

  // Tournament round counter, mirrored from room data. Bumped on each new game
  // so both devices return to the opening die-roll for the next game.
  round: number;

  // Pending deep-link join (set by App-level URL listener, consumed by lobby)
  pendingJoinCode: string | null;

  // Internal
  _unsubRoom: Unsubscribe | null;

  // Actions
  setPlayerName: (name: string) => void;
  setPendingJoinCode: (code: string | null) => void;
  hostRoom: () => Promise<void>;
  joinExistingRoom: (roomId: string) => Promise<boolean>;
  rollMyDie: () => Promise<void>;
  startLocalGame: () => void;
  goToGame: () => void;
  requestRematch: (fullReset?: boolean) => void;
  startRemoteRematch: (fullReset?: boolean) => Promise<void>;
  resetToLobby: () => void;
  cleanup: () => void;
}

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  screen: 'lobby',
  lobbyState: 'IDLE',
  playerName: '',
  opponentName: '',
  roomId: null,
  role: null,
  isMultiplayer: false,
  gameMode: 'local',
  myDie: null,
  opponentDie: null,
  round: 0,
  pendingJoinCode: null,
  _unsubRoom: null,

  setPlayerName: (name: string) => set({ playerName: name }),

  setPendingJoinCode: (code: string | null) => set({ pendingJoinCode: code }),

  hostRoom: async () => {
    const { playerName } = get();
    if (!playerName.trim()) return;

    const roomId = generateRoomCode();
    try {
      await createRoom(roomId, playerName.trim());
    } catch (err) {
      // Most common cause: Realtime Database security rules deny writes (DB
      // created in "locked mode"). Surface it instead of silently doing
      // nothing — the lobby catches this and shows an alert.
      console.error('[multiplayer] createRoom failed:', err);
      throw new Error('ROOM_CREATE_FAILED');
    }

    // Subscribe to room changes
    const unsub = subscribeToRoom(roomId, (data: RoomData | null) => {
      if (!data) return;
      const s = get();

      // Rematch signal: round bumped → return to the opening die-roll for the
      // next game. (No-op for the device that initiated it — its round already
      // matches.)
      if ((data.round ?? 0) > s.round) {
        useGameStore.getState().startNextGame();
        set({
          myDie: null, opponentDie: null, round: data.round ?? 0,
          screen: 'initialRoll', lobbyState: 'INITIAL_ROLL',
        });
        return;
      }

      // Guest joined
      if (data.guest && s.lobbyState === 'HOSTING') {
        set({ opponentName: data.guest.name, lobbyState: 'CONNECTED' });
      }

      // Opponent rolled initial die
      if (data.guest?.initialDie != null && s.opponentDie == null) {
        set({ opponentDie: data.guest.initialDie });
      }
    });

    set({
      roomId,
      role: 'host',
      lobbyState: 'HOSTING',
      isMultiplayer: true,
      gameMode: 'remote',
      _unsubRoom: unsub,
    });
  },

  joinExistingRoom: async (roomId: string) => {
    const { playerName } = get();
    if (!playerName.trim()) return false;

    let success: boolean;
    try {
      success = await joinRoom(roomId, playerName.trim());
    } catch (err) {
      // Network / locked-rules failure — distinct from "room not found".
      console.error('[multiplayer] joinRoom failed:', err);
      throw new Error('ROOM_JOIN_FAILED');
    }
    if (!success) return false;

    // Subscribe to room changes
    const unsub = subscribeToRoom(roomId, (data: RoomData | null) => {
      if (!data) return;
      const s = get();

      // Rematch signal: round bumped → return to the opening die-roll for the
      // next game. (No-op for the device that initiated it — its round already
      // matches.)
      if ((data.round ?? 0) > s.round) {
        useGameStore.getState().startNextGame();
        set({
          myDie: null, opponentDie: null, round: data.round ?? 0,
          screen: 'initialRoll', lobbyState: 'INITIAL_ROLL',
        });
        return;
      }

      // Read host name
      if (data.host && !s.opponentName) {
        set({ opponentName: data.host.name });
      }

      // Host rolled initial die
      if (data.host.initialDie != null && s.opponentDie == null) {
        set({ opponentDie: data.host.initialDie });
      }
    });

    set({
      roomId,
      role: 'guest',
      lobbyState: 'CONNECTED',
      isMultiplayer: true,
      gameMode: 'remote',
      _unsubRoom: unsub,
    });

    return true;
  },

  rollMyDie: async () => {
    const { roomId, role } = get();
    if (!roomId || !role) return;

    const die = rollDie();
    set({ myDie: die });
    await setInitialDie(roomId, role, die);
  },

  startLocalGame: () => {
    set({
      screen: 'game',
      lobbyState: 'IDLE',
      isMultiplayer: false,
      gameMode: 'local',
      role: null,
      roomId: null,
    });
  },

  goToGame: () => {
    set({ screen: 'initialRoll', lobbyState: 'INITIAL_ROLL' });
  },

  // Entry point from the GAME_OVER overlay. The host runs the authoritative
  // rematch directly; the guest asks the host to run it (host processes the
  // REQUEST_REMATCH action and bumps the round, which both devices observe).
  requestRematch: (fullReset = false) => {
    const { role, roomId } = get();
    if (role === 'host') {
      get().startRemoteRematch(fullReset);
    } else if (roomId) {
      sendGuestAction(roomId, { type: fullReset ? 'REQUEST_NEW_CHAMPIONSHIP' : 'REQUEST_REMATCH' });
    }
  },

  // Host-authoritative rematch: reset the engine (keeping or clearing the score
  // for next-game vs. new-championship), clear the stale opening dice, then bump
  // the round counter so the guest's room subscription mirrors the transition.
  // Order matters: dice are cleared BEFORE the round bump so the guest never
  // reads a stale opening die when it returns to the initial-roll screen.
  startRemoteRematch: async (fullReset = false) => {
    const { roomId, round } = get();
    if (!roomId) return;

    if (fullReset) useGameStore.getState().startNewGame();
    else useGameStore.getState().startNextGame();

    const newRound = round + 1;
    await clearInitialDice(roomId);
    await setRound(roomId, newRound);

    set({
      myDie: null, opponentDie: null, round: newRound,
      screen: 'initialRoll', lobbyState: 'INITIAL_ROLL',
    });
  },

  resetToLobby: () => {
    const { _unsubRoom, roomId, role } = get();
    if (_unsubRoom) _unsubRoom();
    // Don't delete room during cleanup — just disconnect

    set({
      screen: 'lobby',
      lobbyState: 'IDLE',
      opponentName: '',
      roomId: null,
      role: null,
      isMultiplayer: false,
      gameMode: 'local',
      myDie: null,
      opponentDie: null,
      round: 0,
      pendingJoinCode: null,
      _unsubRoom: null,
    });
  },

  cleanup: () => {
    const { _unsubRoom } = get();
    if (_unsubRoom) _unsubRoom();
    set({ _unsubRoom: null });
  },
}));
