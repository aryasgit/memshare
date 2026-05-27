// End-to-end smoke test.
// Boots no server itself — expects one running at MEMSHARE_URL (default localhost:8787).
// Spawns two virtual peers, runs the handshake, sends an encrypted message
// from A → B and a file, verifies B receives both correctly.

import WebSocket from 'ws';
import * as mc from '../public/js/crypto.js';

const URL = process.env.MEMSHARE_URL || 'ws://localhost:8787';
const ROOM = process.env.MEMSHARE_ROOM || randCode();

function randCode() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function peer(name) {
  return new Promise(async (resolve, reject) => {
    const ident = await mc.newIdentity();
    const ws = new WebSocket(`${URL}/ws?room=${ROOM}`);
    const p = {
      name, ident, ws, id: null, peers: new Map(),
      received: [], files: new Map(),
      on(type, fn) { (this._h ||= {})[type] = fn; },
    };
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', pubkey: ident.pubB64, fp: ident.fp }));
    });
    ws.on('message', async raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'welcome') {
        p.id = msg.id;
        for (const pe of msg.peers) {
          const pub = await mc.importPub(pe.pubkey);
          const pk = await mc.pairKey(ident.priv, pub);
          p.peers.set(pe.id, { ...pe, pairKey: pk });
        }
        resolve(p);
      } else if (msg.type === 'peer-joined') {
        const pub = await mc.importPub(msg.pubkey);
        const pk = await mc.pairKey(ident.priv, pub);
        p.peers.set(msg.id, { id: msg.id, pubkey: msg.pubkey, fp: msg.fp, pairKey: pk });
        p._h?.peerJoined?.(msg);
      } else if (msg.type === 'msg') {
        const from = p.peers.get(msg.from);
        const text = await mc.decryptText(msg.payload, p.id, from.pairKey);
        p.received.push({ from: msg.from, text });
        p._h?.msg?.({ from: msg.from, text });
      } else if (msg.type === 'file-init') {
        const from = p.peers.get(msg.from);
        const k = await mc.openEnvelope(msg.envelope, p.id, from.pairKey);
        p.files.set(msg.id, { key: k, meta: msg, chunks: new Map() });
      } else if (msg.type === 'file-chunk') {
        const f = p.files.get(msg.id);
        if (!f) return;
        f.chunks.set(msg.seq, msg.data);
      } else if (msg.type === 'file-complete') {
        const f = p.files.get(msg.id);
        if (!f) return;
        const seqs = [...f.chunks.keys()].sort((a, b) => a - b);
        const parts = [];
        for (const s of seqs) {
          const env = JSON.parse(f.chunks.get(s));
          parts.push(await mc.decryptChunk(f.key, env));
        }
        const total = parts.reduce((n, p) => n + p.length, 0);
        const buf = new Uint8Array(total);
        let o = 0;
        for (const p of parts) { buf.set(p, o); o += p.length; }
        f.bytes = buf;
        p._h?.fileComplete?.({ id: msg.id, bytes: buf, meta: f.meta });
      }
    });
    ws.on('error', reject);
  });
}

async function send(p, text) {
  const map = new Map();
  for (const [id, pe] of p.peers) map.set(id, pe.pairKey);
  const payload = await mc.encryptText(text, map);
  p.ws.send(JSON.stringify({ type: 'msg', payload }));
}

async function sendFile(p, name, bytes, chunkSize = 64 * 1024) {
  const map = new Map();
  for (const [id, pe] of p.peers) map.set(id, pe.pairKey);
  const { key, envelope } = await mc.newEnvelopeForPeers(map);
  const id = 'f_' + Math.random().toString(36).slice(2, 10);
  const chunkCount = Math.max(1, Math.ceil(bytes.length / chunkSize));
  p.ws.send(JSON.stringify({
    type: 'file-init',
    id, size: bytes.length, chunkCount,
    name, contentType: 'application/octet-stream',
    envelope,
  }));
  for (let s = 0; s < chunkCount; s++) {
    const slice = bytes.subarray(s * chunkSize, (s + 1) * chunkSize);
    const env = await mc.encryptChunk(key, slice);
    p.ws.send(JSON.stringify({ type: 'file-chunk', id, seq: s, data: JSON.stringify(env) }));
  }
  p.ws.send(JSON.stringify({ type: 'file-complete', id }));
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('room:', ROOM);
  const A = await peer('A');
  console.log('A joined:', A.id, '(fp', A.ident.fp + ')');
  const B = await peer('B');
  console.log('B joined:', B.id, '(fp', B.ident.fp + ')');
  await wait(200);

  // A → B text
  const msg = 'hello from A — π ≈ 3.14 — 漢字';
  await send(A, msg);
  await wait(150);
  const got = B.received[0];
  console.log('B received:', JSON.stringify(got?.text));
  if (got?.text !== msg) { console.error('TEXT MISMATCH'); process.exit(1); }

  // A → B file (random binary)
  const bytes = new Uint8Array(200 * 1024);
  for (let o = 0; o < bytes.length; o += 65536) {
    globalThis.crypto.getRandomValues(bytes.subarray(o, Math.min(o + 65536, bytes.length)));
  }
  let resolved;
  const fileDone = new Promise(r => { resolved = r; });
  B.on('fileComplete', resolved);
  await sendFile(A, 'random.bin', bytes);
  const result = await Promise.race([fileDone, wait(3000).then(() => null)]);
  if (!result) { console.error('FILE TIMEOUT'); process.exit(1); }
  if (result.bytes.length !== bytes.length) {
    console.error('FILE LENGTH MISMATCH', result.bytes.length, '!=', bytes.length);
    process.exit(1);
  }
  for (let i = 0; i < bytes.length; i++) {
    if (result.bytes[i] !== bytes[i]) {
      console.error('FILE BYTE MISMATCH at', i);
      process.exit(1);
    }
  }
  console.log('OK — text + file round-trip verified');

  A.ws.close(); B.ws.close();
  setTimeout(() => process.exit(0), 100);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
