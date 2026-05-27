import { randomBytes, randomUUID } from 'node:crypto';
import config from './config.js';

const rooms = new Map();

export function generateRoomCode() {
  const { roomCodeAlphabet: a, roomCodeLength: n } = config;
  let code = '';
  for (let i = 0; i < n; i++) {
    code += a[randomBytes(1)[0] % a.length];
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

export function ensureRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      createdAt: Date.now(),
      peers: new Map(),
      history: [],
      files: new Map(),
    });
  }
  return rooms.get(code);
}

export function joinRoom(code, peer) {
  const room = ensureRoom(code);
  if (room.peers.size >= config.maxRoomPeers) {
    return { ok: false, reason: 'room-full' };
  }
  const id = 'c_' + randomUUID().replace(/-/g, '').slice(0, 10);
  const entry = { id, pubkey: peer.pubkey, fp: peer.fp, joinedAt: Date.now(), socket: peer.socket };
  room.peers.set(id, entry);
  return { ok: true, id, room };
}

export function leaveRoom(code, peerId) {
  const room = rooms.get(code);
  if (!room) return null;
  const peer = room.peers.get(peerId);
  if (!peer) return null;
  room.peers.delete(peerId);
  if (room.peers.size === 0) {
    cleanupRoom(room);
    rooms.delete(code);
  }
  return peer;
}

export function getPeer(code, peerId) {
  return rooms.get(code)?.peers.get(peerId) || null;
}

export function listPeers(room, excludeId) {
  const out = [];
  for (const [id, peer] of room.peers) {
    if (id === excludeId) continue;
    out.push({ id, pubkey: peer.pubkey, fp: peer.fp });
  }
  return out;
}

export function broadcast(room, message, excludeId = null) {
  const payload = JSON.stringify(message);
  for (const [id, peer] of room.peers) {
    if (id === excludeId) continue;
    if (peer.socket.readyState === 1) {
      peer.socket.send(payload);
    }
  }
}

export function sendTo(room, peerId, message) {
  const peer = room.peers.get(peerId);
  if (!peer || peer.socket.readyState !== 1) return false;
  peer.socket.send(JSON.stringify(message));
  return true;
}

export function pushHistory(room, item) {
  room.history.push(item);
  if (room.history.length > config.historyBuffer) {
    room.history.splice(0, room.history.length - config.historyBuffer);
  }
}

export function stashFile(room, id, meta) {
  room.files.set(id, {
    id,
    meta,
    chunks: new Map(),
    createdAt: Date.now(),
    complete: false,
  });
  setTimeout(() => {
    const f = room.files.get(id);
    if (f && Date.now() - f.createdAt >= config.fileTtlMs) {
      room.files.delete(id);
    }
  }, config.fileTtlMs).unref();
  return room.files.get(id);
}

export function getFile(room, id) {
  return room.files.get(id) || null;
}

function cleanupRoom(room) {
  room.files.clear();
  room.history.length = 0;
}

export function snapshot() {
  return {
    rooms: rooms.size,
    peers: [...rooms.values()].reduce((n, r) => n + r.peers.size, 0),
  };
}
