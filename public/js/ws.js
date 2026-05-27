// Memshare WebSocket client.
//
// Wraps the raw socket protocol with crypto, peer tracking, and a small
// event-emitter API. The UI layer talks only to this module — never to
// the socket or to crypto directly.

import * as mc from './crypto.js';

export class Connection {
  constructor({ room, url }) {
    this.room = room;
    this.url = url || (location.origin.replace(/^http/, 'ws'));
    this.identity = null;
    this.myId = null;
    this.peers = new Map();
    this.fileKeys = new Map();
    this.ws = null;
    this.handlers = {};
    this.outbox = [];
    this.status = 'idle';
  }

  on(event, fn) {
    (this.handlers[event] ||= []).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this.handlers[event] || []) {
      try { fn(payload); } catch (e) { console.error('handler error', event, e); }
    }
  }

  _setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }

  async connect() {
    this.identity = await mc.newIdentity();
    this._setStatus('connecting');
    const target = `${this.url}/ws?room=${encodeURIComponent(this.room)}`;
    this.ws = new WebSocket(target);
    this.ws.binaryType = 'arraybuffer';

    this.ws.addEventListener('open', () => {
      this.ws.send(JSON.stringify({
        type: 'hello',
        pubkey: this.identity.pubB64,
        fp: this.identity.fp,
      }));
    });

    this.ws.addEventListener('message', async (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      await this._handle(msg);
    });

    this.ws.addEventListener('error', () => this.emit('error', { code: 'ws', reason: 'connection error' }));
    this.ws.addEventListener('close', () => this._setStatus('closed'));
  }

  async _handle(msg) {
    switch (msg.type) {
      case 'welcome': {
        this.myId = msg.id;
        for (const p of msg.peers) await this._addPeer(p);
        this._setStatus('open');
        this.emit('welcome', { id: this.myId, peers: [...this.peers.values()] });
        for (const item of this.outbox) await this._sendMsg(item.text, item.meta);
        this.outbox = [];
        return;
      }
      case 'peer-joined': {
        await this._addPeer({ id: msg.id, pubkey: msg.pubkey, fp: msg.fp });
        this.emit('peer-joined', this.peers.get(msg.id));
        return;
      }
      case 'peer-left': {
        const p = this.peers.get(msg.id);
        this.peers.delete(msg.id);
        this.emit('peer-left', { id: msg.id, peer: p });
        return;
      }
      case 'msg': {
        const from = this.peers.get(msg.from);
        if (!from) return;
        try {
          const text = await mc.decryptText(msg.payload, this.myId, from.pairKey);
          this.emit('msg', { from: msg.from, fromFp: from.fp, ts: msg.ts, meta: msg.meta, text });
        } catch (e) {
          this.emit('msg-error', { from: msg.from, reason: e.message });
        }
        return;
      }
      case 'file-init': {
        const from = this.peers.get(msg.from);
        if (!from || !msg.envelope) return;
        try {
          const k = await mc.openEnvelope(msg.envelope, this.myId, from.pairKey);
          this.fileKeys.set(msg.id, { key: k, chunks: new Map(), meta: msg });
          this.emit('file-init', { from: msg.from, id: msg.id, name: msg.name, size: msg.size, chunkCount: msg.chunkCount, contentType: msg.contentType });
        } catch (e) {
          this.emit('msg-error', { from: msg.from, reason: 'file envelope: ' + e.message });
        }
        return;
      }
      case 'file-chunk': {
        const fk = this.fileKeys.get(msg.id);
        if (!fk) return;
        fk.chunks.set(msg.seq, msg.data);
        this.emit('file-chunk', { id: msg.id, from: msg.from, seq: msg.seq, total: fk.meta.chunkCount });
        return;
      }
      case 'file-complete': {
        const fk = this.fileKeys.get(msg.id);
        if (!fk) return;
        try {
          const seqs = [...fk.chunks.keys()].sort((a, b) => a - b);
          const parts = [];
          for (const s of seqs) {
            const env = JSON.parse(fk.chunks.get(s));
            parts.push(await mc.decryptChunk(fk.key, env));
          }
          const total = parts.reduce((n, p) => n + p.length, 0);
          const buf = new Uint8Array(total);
          let o = 0;
          for (const p of parts) { buf.set(p, o); o += p.length; }
          this.emit('file-complete', { id: msg.id, from: msg.from, name: fk.meta.name, contentType: fk.meta.contentType, bytes: buf });
        } catch (e) {
          this.emit('msg-error', { from: msg.from, reason: 'file assembly: ' + e.message });
        }
        this.fileKeys.delete(msg.id);
        return;
      }
      case 'error': {
        this.emit('error', msg);
        return;
      }
    }
  }

  async _addPeer({ id, pubkey, fp }) {
    const pub = await mc.importPub(pubkey);
    const pairK = await mc.pairKey(this.identity.priv, pub);
    this.peers.set(id, { id, pubB64: pubkey, pub, fp, pairKey: pairK });
  }

  _peerPairKeys() {
    const m = new Map();
    for (const [id, p] of this.peers) m.set(id, p.pairKey);
    return m;
  }

  async send(text, meta = null) {
    if (this.status !== 'open') {
      this.outbox.push({ text, meta });
      return null;
    }
    return this._sendMsg(text, meta);
  }

  async _sendMsg(text, meta) {
    const ts = Date.now();
    if (this.peers.size === 0) {
      this.emit('msg', { from: this.myId, fromFp: this.identity.fp, ts, meta, text, self: true, solo: true });
      return { ts, solo: true };
    }
    const payload = await mc.encryptText(text, this._peerPairKeys());
    this.ws.send(JSON.stringify({ type: 'msg', payload, meta }));
    this.emit('msg', { from: this.myId, fromFp: this.identity.fp, ts, meta, text, self: true });
    return { ts };
  }

  async sendFile(file, { chunkSize = 256 * 1024, onProgress } = {}) {
    if (this.status !== 'open') throw new Error('not connected');
    if (this.peers.size === 0) throw new Error('no peers to send to');
    const id = 'f_' + crypto.getRandomValues(new Uint32Array(2)).join('');
    const { key, envelope } = await mc.newEnvelopeForPeers(this._peerPairKeys());
    const buf = new Uint8Array(await file.arrayBuffer());
    const chunkCount = Math.max(1, Math.ceil(buf.length / chunkSize));

    this.ws.send(JSON.stringify({
      type: 'file-init',
      id,
      size: buf.length,
      chunkCount,
      name: file.name,
      contentType: file.type || 'application/octet-stream',
      envelope,
    }));

    this.emit('file-sent-init', { id, name: file.name, size: buf.length, chunkCount });

    for (let seq = 0; seq < chunkCount; seq++) {
      const slice = buf.subarray(seq * chunkSize, (seq + 1) * chunkSize);
      const env = await mc.encryptChunk(key, slice);
      this.ws.send(JSON.stringify({
        type: 'file-chunk',
        id, seq,
        data: JSON.stringify(env),
      }));
      if (onProgress) onProgress({ id, seq, total: chunkCount });
      if (seq % 4 === 3) await new Promise(r => setTimeout(r, 0));
    }
    this.ws.send(JSON.stringify({ type: 'file-complete', id }));
    this.emit('file-sent-complete', { id });
    return { id };
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}
