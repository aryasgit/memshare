import { networkInterfaces } from 'node:os';

const mode = process.env.MEMSHARE_MODE === 'local' ? 'local' : 'network';

const config = {
  mode,
  host: process.env.MEMSHARE_HOST || (mode === 'local' ? '0.0.0.0' : '0.0.0.0'),
  port: Number(process.env.MEMSHARE_PORT) || 8787,
  maxRoomPeers: Number(process.env.MEMSHARE_MAX_PEERS) || 16,
  maxMessageBytes: Number(process.env.MEMSHARE_MAX_MSG) || 64 * 1024,
  maxFileBytes: Number(process.env.MEMSHARE_MAX_FILE) || 50 * 1024 * 1024,
  fileTtlMs: Number(process.env.MEMSHARE_FILE_TTL) || 60 * 60 * 1000,
  historyBuffer: Number(process.env.MEMSHARE_HISTORY) || 50,
  roomCodeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  roomCodeLength: 6,
};

export default config;

export function lanAddresses() {
  const out = [];
  const ifs = networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}
