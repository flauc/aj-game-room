import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteField,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

export interface RoomPlayer {
  name: string;
  ready: boolean;
}

export interface Room {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  players: Record<string, RoomPlayer>;
  createdAt: unknown;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export async function createRoom(hostName: string): Promise<{ roomId: string; playerId: string }> {
  const roomId = generateId();
  const playerId = generateId();
  const code = generateCode();

  await setDoc(doc(db, 'rooms', roomId), {
    code,
    status: 'waiting',
    hostId: playerId,
    players: {
      [playerId]: { name: hostName, ready: true }
    },
    createdAt: serverTimestamp()
  });

  return { roomId, playerId };
}

export async function joinRoom(
  roomCode: string,
  playerName: string
): Promise<{ roomId: string; playerId: string }> {
  const q = query(
    collection(db, 'rooms'),
    where('code', '==', roomCode.toUpperCase()),
    where('status', '==', 'waiting')
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('Room not found or already started');
  }

  const roomDoc = snapshot.docs[0];
  const roomId = roomDoc.id;
  const playerId = generateId();

  await updateDoc(doc(db, 'rooms', roomId), {
    [`players.${playerId}`]: { name: playerName, ready: true }
  });

  return { roomId, playerId };
}

export function listenToRoom(roomId: string, callback: (room: Room | null) => void): () => void {
  return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
    if (snap.exists()) {
      callback(snap.data() as Room);
    } else {
      callback(null);
    }
  });
}

export async function startGame(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), { status: 'playing' });
}

export async function finishGame(roomId: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), { status: 'finished' });
}

export async function leaveRoom(roomId: string, playerId: string): Promise<void> {
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as Room;
  const playerCount = Object.keys(room.players).length;

  if (playerCount <= 1) {
    // Last player leaving — could delete room, but just mark finished
    await updateDoc(roomRef, { status: 'finished' });
  } else {
    await updateDoc(roomRef, {
      [`players.${playerId}`]: deleteField()
    });
    // If host left, assign new host
    if (room.hostId === playerId) {
      const remaining = Object.keys(room.players).filter((id) => id !== playerId);
      if (remaining.length > 0) {
        await updateDoc(roomRef, { hostId: remaining[0] });
      }
    }
  }
}
