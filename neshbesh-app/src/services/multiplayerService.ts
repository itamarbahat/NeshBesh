import { db, isFirebaseConfigured } from '../config/firebase';
import { ref, set, get, update, remove, onValue, Unsubscribe } from 'firebase/database';

// ── Room data shape in Firebase ─────────────────────────────────────────────
export interface RoomData {
  host: { name: string; initialDie: number | null };
  guest: { name: string; initialDie: number | null } | null;
  gameStarted: boolean;
  gameState: Record<string, any> | null;
  pendingAction: { type: string; payload?: any } | null;
  createdAt: number;
}

// ── In-memory store for local/offline mode ──────────────────────────────────
const localRooms = new Map<string, RoomData>();
const localListeners = new Map<string, Set<(data: RoomData | null) => void>>();

function notifyLocal(roomId: string) {
  const data = localRooms.get(roomId) ?? null;
  localListeners.get(roomId)?.forEach((cb) => cb(data));
}

// ── Generate short room code ────────────────────────────────────────────────
export const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

// ── Create a room (host) ────────────────────────────────────────────────────
export const createRoom = async (roomId: string, hostName: string): Promise<void> => {
  const roomData: RoomData = {
    host: { name: hostName, initialDie: null },
    guest: null,
    gameStarted: false,
    gameState: null,
    pendingAction: null,
    createdAt: Date.now(),
  };

  if (!isFirebaseConfigured || !db) {
    localRooms.set(roomId, roomData);
    notifyLocal(roomId);
    return;
  }

  const roomRef = ref(db, `rooms/${roomId}`);
  await set(roomRef, roomData);
};

// ── Join a room (guest) ─────────────────────────────────────────────────────
export const joinRoom = async (roomId: string, guestName: string): Promise<boolean> => {
  if (!isFirebaseConfigured || !db) {
    const room = localRooms.get(roomId);
    if (!room || room.guest) return false;
    room.guest = { name: guestName, initialDie: null };
    notifyLocal(roomId);
    return true;
  }

  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return false;
  const data = snapshot.val() as RoomData;
  if (data.guest) return false;
  await update(ref(db, `rooms/${roomId}`), {
    guest: { name: guestName, initialDie: null },
  });
  return true;
};

// ── Subscribe to room changes ───────────────────────────────────────────────
export const subscribeToRoom = (
  roomId: string,
  callback: (data: RoomData | null) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    if (!localListeners.has(roomId)) localListeners.set(roomId, new Set());
    localListeners.get(roomId)!.add(callback);
    // Fire immediately with current state
    callback(localRooms.get(roomId) ?? null);
    return () => {
      localListeners.get(roomId)?.delete(callback);
    };
  }

  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(roomRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as RoomData) : null);
  });
};

// ── Set initial die value ───────────────────────────────────────────────────
export const setInitialDie = async (
  roomId: string,
  role: 'host' | 'guest',
  die: number,
): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const room = localRooms.get(roomId);
    if (room && room[role]) {
      room[role]!.initialDie = die;
      notifyLocal(roomId);
    }
    return;
  }

  await update(ref(db, `rooms/${roomId}/${role}`), { initialDie: die });
};

// ── Clear initial dice (for re-roll on tie) ─────────────────────────────────
export const clearInitialDice = async (roomId: string): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const room = localRooms.get(roomId);
    if (room) {
      room.host.initialDie = null;
      if (room.guest) room.guest.initialDie = null;
      notifyLocal(roomId);
    }
    return;
  }

  await update(ref(db, `rooms/${roomId}/host`), { initialDie: null });
  await update(ref(db, `rooms/${roomId}/guest`), { initialDie: null });
};

// ── Sync full game state from host ──────────────────────────────────────────
export const syncGameState = async (
  roomId: string,
  gameState: Record<string, any>,
): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const room = localRooms.get(roomId);
    if (room) {
      room.gameState = gameState;
      room.gameStarted = true;
      notifyLocal(roomId);
    }
    return;
  }

  await update(ref(db, `rooms/${roomId}`), { gameState, gameStarted: true });
};

// ── Subscribe to game state (guest) ─────────────────────────────────────────
export const subscribeToGameState = (
  roomId: string,
  callback: (state: Record<string, any> | null) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    if (!localListeners.has(roomId)) localListeners.set(roomId, new Set());
    const wrapper = (data: RoomData | null) => callback(data?.gameState ?? null);
    localListeners.get(roomId)!.add(wrapper);
    callback(localRooms.get(roomId)?.gameState ?? null);
    return () => { localListeners.get(roomId)?.delete(wrapper); };
  }

  const stateRef = ref(db, `rooms/${roomId}/gameState`);
  return onValue(stateRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
};

// ── Send action from guest ──────────────────────────────────────────────────
export const sendGuestAction = async (
  roomId: string,
  action: { type: string; payload?: any },
): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const room = localRooms.get(roomId);
    if (room) {
      room.pendingAction = action;
      notifyLocal(roomId);
    }
    return;
  }

  await update(ref(db, `rooms/${roomId}`), { pendingAction: action });
};

// ── Subscribe to pending actions (host) ─────────────────────────────────────
export const subscribeToActions = (
  roomId: string,
  callback: (action: { type: string; payload?: any } | null) => void,
): Unsubscribe => {
  if (!isFirebaseConfigured || !db) {
    if (!localListeners.has(roomId)) localListeners.set(roomId, new Set());
    const wrapper = (data: RoomData | null) => callback(data?.pendingAction ?? null);
    localListeners.get(roomId)!.add(wrapper);
    callback(localRooms.get(roomId)?.pendingAction ?? null);
    return () => { localListeners.get(roomId)?.delete(wrapper); };
  }

  const actionRef = ref(db, `rooms/${roomId}/pendingAction`);
  return onValue(actionRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
};

// ── Clear pending action (host, after processing) ───────────────────────────
export const clearPendingAction = async (roomId: string): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    const room = localRooms.get(roomId);
    if (room) {
      room.pendingAction = null;
      notifyLocal(roomId);
    }
    return;
  }

  await update(ref(db, `rooms/${roomId}`), { pendingAction: null });
};

// ── Delete room ─────────────────────────────────────────────────────────────
export const deleteRoom = async (roomId: string): Promise<void> => {
  if (!isFirebaseConfigured || !db) {
    localRooms.delete(roomId);
    localListeners.delete(roomId);
    return;
  }

  await remove(ref(db, `rooms/${roomId}`));
};
