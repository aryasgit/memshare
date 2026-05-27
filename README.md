# Memshare

End-to-end encrypted real-time collaboration for developer teams.
Encrypted chat, code paste with syntax highlighting, file transfer.
Sibling project to Memcon.

The server is a dumb relay. It never sees plaintext, never holds keys,
and stores file blobs only as opaque ciphertext with a short TTL.
Everything cryptographic happens in the browser via WebCrypto.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   Browser A                  ┌──────────┐                Browser B  │
│   ECDH P-256                 │  RELAY   │                ECDH P-256 │
│   AES-GCM-256        ──────▶ │ (opaque  │ ─────▶         AES-GCM-256│
│   ▲                          │ ciphertxt│                           │
│   │  pubkey + ciphertext     │  only)   │      pubkey + ciphertext  │
│   └──────────────────────────┴──────────┴───────────────────────────┘
│
│   Server sees: room codes, public keys, ciphertext.
│   Server never sees: plaintext, keys, passphrases.
└─────────────────────────────────────────────────────────────────────┘
```

## Two modes

| Mode    | How                                                        | When                                                |
| ------- | ---------------------------------------------------------- | --------------------------------------------------- |
| Network | One server deployed publicly. Teams join by room code.     | Convenient. Default. Server still cannot decrypt.   |
| Local   | One teammate runs Memshare on their laptop; others join via LAN URL. | Highest assurance — there is no third party.        |

## Run

```sh
npm install
npm start          # network mode, listens on 0.0.0.0:8787
npm run local      # local mode, prints LAN URLs to share with teammates
npm run dev        # network mode with file-watch restart
```

Then open <http://localhost:8787>. The landing page is at `/`, the app
is at `/app.html`. Hit "Start a new room" to get a code, then send the
URL to a teammate.

### Environment

| Variable                | Default      | Meaning                                  |
| ----------------------- | ------------ | ---------------------------------------- |
| `MEMSHARE_MODE`         | `network`    | `local` to bind for LAN broadcast        |
| `MEMSHARE_PORT`         | `8787`       | TCP port                                 |
| `MEMSHARE_HOST`         | `0.0.0.0`    | Bind address                             |
| `MEMSHARE_MAX_PEERS`    | `16`         | Hard cap per room                        |
| `MEMSHARE_MAX_MSG`      | `65536`      | Max bytes per WebSocket frame            |
| `MEMSHARE_MAX_FILE`     | `52428800`   | Max file size (50 MB)                    |
| `MEMSHARE_FILE_TTL`     | `3600000`    | Blob TTL in ms (1 h)                     |
| `MEMSHARE_LOG`          | `info`       | Pino log level                           |

## Security model

The threat model assumes a hostile server. The crypto layer
(`public/js/crypto.js`) does the following on the client:

1. On connect, each browser generates an **ephemeral ECDH P-256
   keypair**. The private half lives only in the JS heap; the public
   half is sent to the server during the `hello` frame.
2. For every other peer in the room, the browser derives a pairwise
   **AES-GCM-256 key** via ECDH.
3. To send a message: generate a random 256-bit content key, encrypt
   the plaintext with it (12-byte random IV), then **wrap the content
   key once per recipient** using the pair key. The on-the-wire payload
   is `{ body: {iv, ct}, envelope: { peerId: {iv, ct}, … } }`. This is
   the standard "envelope encryption" pattern.
4. Files use the same envelope, but the content key is reused across
   all 256 KB chunks of one file. Each chunk gets a fresh IV.

Things the server sees:

- Room codes (6 chars, unambiguous alphabet)
- Per-session public keys
- Opaque ciphertext
- Metadata it needs to route: peer IDs, file sizes, chunk counts

Things the server never sees:

- Plaintext messages, file contents
- Private keys, content keys
- Passphrases (none are involved in v0)

### Fingerprint verification

The first four 16-bit chunks of `SHA-256(pubkey)`, formatted as four
space-separated hex quartets like `0E31 0547 6468 26FE`, are shown
prominently in the app — yours in the bottom-left aside, every peer's
under their entry in the peer list.

**Verify these out-of-band** (Signal, phone, in person) before sharing
anything sensitive. If the fingerprint the other side reads matches
what your app shows, the server cannot have swapped a public key on
you mid-handshake.

### Caveats

- The relay can drop your connection or refuse you, but cannot read
  your traffic.
- The relay *can* try to give you a fake public key for a peer. This
  is exactly what fingerprint verification defends against.
- We do **not yet** layer a passphrase-derived key over the envelope.
  In v0 the room code alone is enough to *join*; security comes from
  fingerprint verification. A passphrase option is a planned follow-up.
- No persistence. Close the last tab in a room → room dies → server
  forgets. This is intentional.

## Architecture

```
server/
  config.js     env-driven limits + LAN address probe
  rooms.js      in-memory rooms map; peers, history ring, file blobs
  relay.js      WS protocol handler (hello, msg, file-*, ping)
  index.js      Fastify boot + static + /healthz, /api/new-room, /ws

public/
  index.html       landing page
  app.html         the chat app
  test.html        bare-bones two-tab test harness
  css/base.css     design-system foundation (color ladder, type)
  css/app.css      chat-specific layout + monochrome hljs theme
  css/landing.css  landing-specific (hero, accordion, marquee, tabs, footer)
  js/crypto.js     WebCrypto primitives (newIdentity, pairKey, envelope)
  js/ws.js         Connection class — wraps the wire protocol
  js/format.js     mini-markdown for chat + highlight.js bridge
  js/app.js        chat UI wiring
  js/landing.js    landing-page interactions

scripts/
  smoke.mjs     end-to-end test: two virtual peers, encrypted text +
                a 200 KB random file, byte-perfect round trip

docs/
  DESIGN_SYSTEM.md   visual language reference
```

## Wire protocol

All messages are JSON over WebSocket at `/ws?room=ABCD23`.

### Client → server

```js
{ type: "hello",        pubkey: "<b64url>", fp: "<safety-quartets>" }
{ type: "msg",          to?: "c_xyz", payload: {body:{iv,ct}, envelope:{…}}, meta? }
{ type: "file-init",    id, size, chunkCount, name, contentType, envelope: {…} }
{ type: "file-chunk",   id, seq, data: "<stringified env>" }
{ type: "file-complete",id }
{ type: "file-request", id }   // request replay if you joined late
{ type: "ping" }
```

### Server → client

```js
{ type: "welcome",      id, room, peers: [{id,pubkey,fp}], history: [...] }
{ type: "peer-joined",  id, pubkey, fp }
{ type: "peer-left",    id }
{ type: "msg",          from, ts, meta, payload }
{ type: "file-init",    from, id, size, chunkCount, name, contentType, envelope, ts }
{ type: "file-chunk",   from, id, seq, data }
{ type: "file-complete",from, id }
{ type: "error",        code, reason }
{ type: "pong",         ts }
```

The `replay: true` flag is set on `file-*` frames sent in response to a
`file-request`.

## Status

Pre-alpha. The encrypted loop works, the UI works, the smoke test
passes. Not yet covered: passphrase-wrapped keys, group rekey on
peer-left for forward secrecy, message history for late joiners (we
keep ciphertext in memory but late joiners can't decrypt it), TURN/STUN
NAT traversal (we relay everything intentionally).

## License

MIT.
