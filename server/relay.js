import config from './config.js';
import {
  joinRoom,
  leaveRoom,
  getPeer,
  listPeers,
  broadcast,
  sendTo,
  pushHistory,
  stashFile,
  getFile,
} from './rooms.js';

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

function err(socket, code, reason) {
  send(socket, { type: 'error', code, reason });
}

export function handleConnection(socket, req) {
  let state = null;

  const url = new URL(req.url, 'http://localhost');
  const code = (url.searchParams.get('room') || '').toUpperCase().trim();

  if (!code || !/^[A-Z2-9]{6}$/.test(code)) {
    err(socket, 'bad-room', 'invalid room code');
    socket.close(1008, 'bad-room');
    return;
  }

  socket.on('message', (raw) => {
    let msg;
    try {
      if (raw.length > config.maxMessageBytes * 2) throw new Error('oversize');
      msg = JSON.parse(raw.toString());
    } catch {
      return err(socket, 'bad-json', 'invalid frame');
    }
    if (!msg || typeof msg.type !== 'string') {
      return err(socket, 'bad-msg', 'missing type');
    }
    try {
      handleMessage(msg);
    } catch (e) {
      err(socket, 'internal', e.message);
    }
  });

  socket.on('close', () => {
    if (!state) return;
    const peer = leaveRoom(state.code, state.id);
    if (peer && state.room.peers.size > 0) {
      broadcast(state.room, { type: 'peer-left', id: state.id });
    }
  });

  function handleMessage(msg) {
    if (msg.type === 'hello') {
      if (state) return err(socket, 'already-joined', 'hello already sent');
      if (!msg.pubkey || typeof msg.pubkey !== 'string' || msg.pubkey.length > 2048) {
        return err(socket, 'bad-pubkey', 'missing or invalid pubkey');
      }
      const result = joinRoom(code, {
        socket,
        pubkey: msg.pubkey,
        fp: msg.fp || null,
      });
      if (!result.ok) return err(socket, result.reason, 'cannot join');
      state = { id: result.id, code, room: result.room };

      send(socket, {
        type: 'welcome',
        id: result.id,
        room: code,
        peers: listPeers(result.room, result.id),
        history: result.room.history.slice(-config.historyBuffer),
      });
      broadcast(result.room, {
        type: 'peer-joined',
        id: result.id,
        pubkey: msg.pubkey,
        fp: msg.fp || null,
      }, result.id);
      return;
    }

    if (!state) return err(socket, 'no-hello', 'must send hello first');

    if (msg.type === 'msg') {
      if (typeof msg.payload !== 'object' || msg.payload === null) {
        return err(socket, 'bad-payload', 'payload required');
      }
      const item = {
        type: 'msg',
        from: state.id,
        ts: Date.now(),
        meta: msg.meta || null,
        payload: msg.payload,
      };
      if (msg.to && typeof msg.to === 'string') {
        if (!sendTo(state.room, msg.to, item)) {
          err(socket, 'no-peer', 'recipient not found');
        }
      } else {
        broadcast(state.room, item, state.id);
        pushHistory(state.room, item);
      }
      return;
    }

    if (msg.type === 'file-init') {
      const id = String(msg.id || '');
      if (!id || id.length > 64) return err(socket, 'bad-file-id', 'invalid id');
      const size = Number(msg.size) || 0;
      if (size <= 0 || size > config.maxFileBytes) {
        return err(socket, 'bad-size', 'invalid size');
      }
      stashFile(state.room, id, {
        from: state.id,
        size,
        chunkCount: Number(msg.chunkCount) || 0,
        name: String(msg.name || 'file').slice(0, 256),
        contentType: String(msg.contentType || 'application/octet-stream').slice(0, 128),
        cryptMeta: msg.cryptMeta || null,
        envelope: msg.envelope || null,
      });
      broadcast(state.room, {
        type: 'file-init',
        from: state.id,
        id,
        size,
        chunkCount: Number(msg.chunkCount) || 0,
        name: String(msg.name || 'file').slice(0, 256),
        contentType: String(msg.contentType || 'application/octet-stream').slice(0, 128),
        envelope: msg.envelope || null,
        ts: Date.now(),
      }, state.id);
      return;
    }

    if (msg.type === 'file-chunk') {
      const file = getFile(state.room, String(msg.id || ''));
      if (!file) return err(socket, 'no-file', 'unknown file id');
      if (file.meta.from !== state.id) return err(socket, 'not-owner', 'only sender can upload');
      const seq = Number(msg.seq);
      const data = String(msg.data || '');
      if (!Number.isInteger(seq) || seq < 0) return err(socket, 'bad-seq', 'invalid seq');
      if (!data || data.length > config.maxMessageBytes * 2) return err(socket, 'bad-data', 'invalid chunk');
      file.chunks.set(seq, data);
      broadcast(state.room, {
        type: 'file-chunk',
        from: state.id,
        id: file.id,
        seq,
        data,
      }, state.id);
      return;
    }

    if (msg.type === 'file-complete') {
      const file = getFile(state.room, String(msg.id || ''));
      if (!file) return err(socket, 'no-file', 'unknown file id');
      if (file.meta.from !== state.id) return err(socket, 'not-owner', 'only sender can finalize');
      file.complete = true;
      broadcast(state.room, { type: 'file-complete', from: state.id, id: file.id }, state.id);
      return;
    }

    if (msg.type === 'file-request') {
      const file = getFile(state.room, String(msg.id || ''));
      if (!file) return err(socket, 'no-file', 'unknown file id');
      send(socket, {
        type: 'file-init',
        from: file.meta.from,
        id: file.id,
        size: file.meta.size,
        chunkCount: file.meta.chunkCount,
        name: file.meta.name,
        contentType: file.meta.contentType,
        envelope: file.meta.envelope,
        ts: file.createdAt,
        replay: true,
      });
      const seqs = [...file.chunks.keys()].sort((a, b) => a - b);
      for (const seq of seqs) {
        send(socket, {
          type: 'file-chunk',
          from: file.meta.from,
          id: file.id,
          seq,
          data: file.chunks.get(seq),
          replay: true,
        });
      }
      if (file.complete) {
        send(socket, { type: 'file-complete', from: file.meta.from, id: file.id, replay: true });
      }
      return;
    }

    if (msg.type === 'ping') {
      return send(socket, { type: 'pong', ts: Date.now() });
    }

    err(socket, 'unknown-type', `type ${msg.type} not handled`);
  }
}
