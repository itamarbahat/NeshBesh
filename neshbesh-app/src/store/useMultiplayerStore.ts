import { create } from 'zustand';
import {
  generateRoomCode, createRoom, joinRoom, subscribeToRoom,
  setInitialDie, clearInitialDice, RoomData,
} from '../services/multiplayerService';
import { Unsubscribe } from 'firebase/database';
import { rollDie } from '../engine';

export type LobbyScreen = 'lobby' | 'initialRoll' | 'game';
export type LobbyState = 'IDLE' | 'HOSTING' | 'JOINING' | 'CONNECTED' | 'INITIAL_ROLL';

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

  // Initial roll
  myDie: number | null;
  opponentDie: number | null;

  // Internal
  _unsubRoom: Unsubscribe | null;

  // Actions
  setPlayerName: (name: string) => void;
  hostRoom: () => Promise<void>;
  joinExistingRoom: (roomId: string) => Promise<boolean>;
  rollMyDie: () => Promise<void>;
  startLocalGame: () => void;
  goToGame: () => void;
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
  myDie: null,
  opponentDie: null,
  _unsubRoom: null,

  setPlayerName: (name: string) => set({ playerName: name }),

  hostRoom: async () => {
    const { playerName } = get();
    if (!playerName.trim()) return;

    const roomId = generateRoomCode();
    await createRoom(roomId, playerName.trim());

    // Subscribe to room changes
    const unsub = subscribeToRoom(roomId, (data: RoomData | null) => {
      if (!data) return;
      const s = get();

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
      _unsubRoom: unsub,
    });
  },

  joinExistingRoom: async (roomId: string) => {
    const { playerName } = get();
    if (!playerName.trim()) return false;

    const success = await joinRoom(roomId, playerName.trim());
    if (!success) return false;

    // Subscribe to room changes
    const unsub = subscribeToRoom(roomId, (data: RoomData | null) => {
      if (!data) return;
      const s = get();

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
      _unsubRoom: unsub,
    });

    // Read host name immediately
    subscribeToRoom(roomId, (data) => {
      if (data?.host) set({ opponentName: data.host.name });
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
      role: null,
      roomId: null,
    });
  },

  goToGame: () => {
    set({ screen: 'initialRoll', lobbyState: 'INITIAL_ROLL' });
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
      myDie: null,
      opponentDie: null,
      _unsubRoom: null,
    });
  },

  cleanup: () => {
    const { _unsubRoom } = get();
    if (_unsubRoom) _unsubRoom();
    set({ _unsubRoom: null });
  },
}));
