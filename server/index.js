import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import config, { lanAddresses } from './config.js';
import { handleConnection } from './relay.js';
import { generateRoomCode, snapshot } from './rooms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const app = Fastify({
  logger: { level: process.env.MEMSHARE_LOG || 'info' },
  bodyLimit: config.maxMessageBytes * 4,
});

await app.register(fastifyWebsocket, {
  options: { maxPayload: config.maxMessageBytes * 4 },
});

await app.register(fastifyStatic, {
  root: publicDir,
  prefix: '/',
  index: false,
});

// The local server is the app, not a marketing site — `/` lands on the
// chat. The landing page is still served by GitHub Pages for discovery.
app.get('/', async (req, reply) => {
  const qIdx = req.url.indexOf('?');
  const qs = qIdx >= 0 ? req.url.slice(qIdx) : '';
  return reply.redirect('/app.html' + qs, 302);
});

// Old marketing landing is still reachable at /landing if you want it.
app.get('/landing', async (req, reply) => reply.sendFile('index.html'));

app.get('/healthz', async () => ({ ok: true, mode: config.mode, ...snapshot() }));

app.get('/api/new-room', async () => ({ code: generateRoomCode() }));

app.get('/api/info', async () => ({
  mode: config.mode,
  lan: config.mode === 'local' ? lanAddresses() : [],
  port: config.port,
}));

app.get('/ws', { websocket: true }, (socket, req) => {
  handleConnection(socket, req);
});

app.setNotFoundHandler(async (req, reply) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/ws')) {
    return reply.code(404).send({ error: 'not-found' });
  }
  return reply.sendFile('app.html');
});

try {
  await app.listen({ host: config.host, port: config.port });
  const banner = [
    '',
    '  Memshare ' + (config.mode === 'local' ? '· local mode' : '· network mode'),
    '  ' + '─'.repeat(40),
    `  Listening on ${config.host}:${config.port}`,
  ];
  if (config.mode === 'local') {
    const ips = lanAddresses();
    if (ips.length) {
      banner.push('  LAN URLs:');
      for (const ip of ips) banner.push(`    http://${ip}:${config.port}`);
    }
  }
  banner.push('');
  console.log(banner.join('\n'));
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
