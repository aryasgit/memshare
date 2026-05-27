// Memshare E2EE primitives.
//
// - Per-session ephemeral ECDH P-256 identity.
// - Pair key = ECDH-derived AES-GCM-256.
// - Per-message random content key; the bytes of the content key are wrapped
//   once per recipient with the pair key (envelope pattern).
// - Files reuse one content key across all chunks of that file.
//
// The server only ever sees ciphertext and public keys. No primitives leave
// this module in plain form.

const subtle = crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64e(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64d(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function newIdentity() {
  const kp = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
  const pubRaw = await subtle.exportKey('raw', kp.publicKey);
  const pubB64 = b64e(pubRaw);
  const fpDigest = await subtle.digest('SHA-256', pubRaw);
  const fpHex = [...new Uint8Array(fpDigest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const fp = fpHex.match(/.{1,4}/g).slice(0, 4).join(' ').toUpperCase();
  return { pub: kp.publicKey, priv: kp.privateKey, pubB64, fp };
}

export async function importPub(pubB64) {
  return subtle.importKey(
    'raw', b64d(pubB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true, []
  );
}

export async function pairKey(privKey, peerPubKey) {
  return subtle.deriveKey(
    { name: 'ECDH', public: peerPubKey },
    privKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function newContentKey() {
  return subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function aesEncBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: b64e(iv), ct: b64e(ct) };
}

async function aesDecBytes(key, env) {
  const iv = b64d(env.iv);
  const ct = b64d(env.ct);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(pt);
}

async function wrapKey(contentKey, pairKey) {
  const raw = await subtle.exportKey('raw', contentKey);
  return aesEncBytes(pairKey, new Uint8Array(raw));
}

async function unwrapKey(env, pairKey) {
  const raw = await aesDecBytes(pairKey, env);
  return subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptText(text, peerPairKeys) {
  const k = await newContentKey();
  const body = await aesEncBytes(k, enc.encode(text));
  const envelope = {};
  for (const [peerId, pairK] of peerPairKeys) {
    envelope[peerId] = await wrapKey(k, pairK);
  }
  return { body, envelope };
}

export async function decryptText(payload, myId, fromPairKey) {
  const wrapped = payload.envelope?.[myId];
  if (!wrapped) throw new Error('not-addressed-to-me');
  const k = await unwrapKey(wrapped, fromPairKey);
  const bytes = await aesDecBytes(k, payload.body);
  return dec.decode(bytes);
}

export async function newEnvelopeForPeers(peerPairKeys) {
  const k = await newContentKey();
  const envelope = {};
  for (const [peerId, pairK] of peerPairKeys) {
    envelope[peerId] = await wrapKey(k, pairK);
  }
  return { key: k, envelope };
}

export async function openEnvelope(envelope, myId, fromPairKey) {
  const wrapped = envelope?.[myId];
  if (!wrapped) throw new Error('not-addressed-to-me');
  return unwrapKey(wrapped, fromPairKey);
}

export async function encryptChunk(contentKey, bytes) {
  return aesEncBytes(contentKey, bytes);
}

export async function decryptChunk(contentKey, env) {
  return aesDecBytes(contentKey, env);
}
