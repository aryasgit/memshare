# Memshare

End-to-end encrypted real-time collaboration for developer teams. Encrypted chat, code paste with syntax highlighting, file transfer — sibling project to [Memcon](https://github.com/).

The server is a dumb relay. It never sees plaintext, never holds keys, and stores file blobs only as opaque ciphertext with a short TTL. Everything cryptographic happens in the browser via WebCrypto.

## Two modes

- **Network mode.** One server deployed publicly. Teams join by 6-character room codes. The room key is derived from a passphrase that the team agrees on out-of-band.
- **Local mode.** One teammate runs Memshare on their machine. Others join over LAN via a URL that carries the key in the fragment (`#k=...`) — the key never reaches the server.

## Run

```sh
npm install
npm start             # network mode, listening on 0.0.0.0:8787
npm run local         # local mode, bound to LAN interfaces with broadcast URL
```

Then open <http://localhost:8787>.

## Security model

- Key exchange: ECDH P-256 between every pair of peers in a room.
- Symmetric: AES-GCM-256, fresh 96-bit IV per message.
- Files: encrypted in 256 KB chunks before they leave the browser.
- Optional passphrase: PBKDF2 (SHA-256, 250k iterations) gates room entry server-side. Without it the URL fragment alone is the secret.
- Server stores: room codes, public keys, encrypted blobs (TTL 1h).
- Server never stores: plaintext, private keys, passphrases.

## Status

Pre-alpha. See `docs/DESIGN_SYSTEM.md` for the visual language.
