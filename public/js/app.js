// Memshare chat app — wires the UI to the Connection layer.

import { Connection } from './ws.js';
import { render as renderMarkdown, highlight, wireCopyButtons, esc, humanBytes } from './format.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  conn: null,
  fileCards: new Map(),
};

const els = {
  bar: $('.bar'),
  pulse: $('.bar .pulse'),
  statusLabel: $('.bar .status-label'),
  roomTag: $('.bar .room-tag .code'),
  roomTagWrap: $('.bar .room-tag'),
  copyRoom: $('.bar .copy-room'),
  peerCount: $('.bar .peer-count'),
  clock: $('.bar .clock'),
  asideRoom: $('.aside .room-code'),
  asideCopyUrl: $('.aside .copy-url'),
  asideCopyCode: $('.aside .copy-code'),
  asidePeers: $('.peers-section'),
  asideFiles: $('.files-section'),
  asideMyFp: $('.aside .my-fp'),
  thread: $('.thread'),
  joiner: $('.joiner'),
  joinerInput: $('.joiner input[name=room]'),
  joinerJoin: $('.joiner .join-btn'),
  joinerNew: $('.joiner .new'),
  joinerFp: $('.joiner .fp'),
  joinerId: $('.joiner .id-block'),
  composer: $('.composer'),
  textarea: $('.composer textarea'),
  fileInput: $('.composer input[type=file]'),
  fileBtn: $('.composer .file-btn'),
  sendBtn: $('.composer .send-btn'),
  dropOverlay: $('.drop-overlay'),
};

function tickClock() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : '' + n;
  els.clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
setInterval(tickClock, 1000); tickClock();

function setStatus(text, kind = 'on') {
  els.statusLabel.textContent = text;
  els.pulse.classList.remove('off', 'warn');
  if (kind === 'off') els.pulse.classList.add('off');
  if (kind === 'warn') els.pulse.classList.add('warn');
}

function autosizeTextarea() {
  const ta = els.textarea;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
}

function setComposerEnabled(on) {
  els.textarea.disabled = !on;
  els.fileInput.disabled = !on;
  els.fileBtn.style.pointerEvents = on ? '' : 'none';
  els.fileBtn.style.opacity = on ? '' : '.4';
  els.sendBtn.disabled = !on;
}

function pushSystem(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'sys ' + kind;
  el.textContent = text;
  els.thread.appendChild(el);
  scrollToBottom();
  return el;
}

function timeOf(ts) {
  const d = new Date(ts);
  const pad = n => n < 10 ? '0' + n : '' + n;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function makeMsgEl(opts) {
  const { from, fp, ts, body, self, kind = 'text', fileMeta } = opts;
  const el = document.createElement('div');
  el.className = 'msg' + (self ? ' self' : '');
  const who = self ? 'me' : esc(from);
  const fpTag = fp ? `<span class="fp">${esc(fp)}</span>` : '';
  const head = `<div class="head"><span class="who">${who}</span>${fpTag}<span class="time">${timeOf(ts)}</span></div>`;
  let bodyHtml;
  if (kind === 'file') {
    bodyHtml = renderFileCard(fileMeta);
  } else {
    bodyHtml = `<div class="body">${renderMarkdown(body)}</div>`;
  }
  el.innerHTML = head + bodyHtml;
  return el;
}

function renderFileCard({ id, name, size, state: st = 'pending', url }) {
  const sizeStr = humanBytes(size);
  const cls = st === 'ready' ? '' : 'pending';
  const dl = st === 'ready'
    ? `<a class="download" href="${esc(url)}" download="${esc(name)}">download</a>`
    : `<span class="download">downloading…</span>`;
  return `<div class="body"><div class="file-card ${cls}" data-file-id="${esc(id)}">
    <div class="name">${esc(name)}</div>
    <div class="meta">${esc(sizeStr)}</div>
    ${dl}
  </div></div>`;
}

function scrollToBottom() {
  els.thread.scrollTop = els.thread.scrollHeight;
}

function appendMessage(opts) {
  const el = makeMsgEl(opts);
  els.thread.appendChild(el);
  highlight(el);
  wireCopyButtons(el);
  scrollToBottom();
  return el;
}

function refreshPeers() {
  const conn = state.conn;
  const section = els.asidePeers;
  const list = section.querySelector('.peer-list');
  list.innerHTML = '';

  const me = conn?.identity;
  if (me) {
    const div = document.createElement('div');
    div.className = 'peer me';
    div.innerHTML = `<div class="id">${esc(conn.myId || '…')}</div>
      <div class="tag">you</div>
      <div class="fp">${esc(me.fp)}</div>`;
    list.appendChild(div);
  }

  if (!conn || conn.peers.size === 0) {
    const div = document.createElement('div');
    div.className = 'peer empty';
    div.innerHTML = `<div class="id">waiting for peers…</div>`;
    list.appendChild(div);
  } else {
    for (const p of conn.peers.values()) {
      const div = document.createElement('div');
      div.className = 'peer';
      div.innerHTML = `<div class="id">${esc(p.id)}</div>
        <div class="tag">peer</div>
        <div class="fp">${esc(p.fp || '—')}</div>`;
      list.appendChild(div);
    }
  }

  const cnt = conn?.peers.size ?? 0;
  els.peerCount.textContent = cnt === 1 ? '1 peer' : `${cnt} peers`;
}

function refreshFiles() {
  const list = els.asideFiles.querySelector('.file-list');
  list.innerHTML = '';
  if (state.fileCards.size === 0) {
    const div = document.createElement('div');
    div.className = 'file-line empty';
    div.textContent = 'none yet';
    list.appendChild(div);
    return;
  }
  for (const card of [...state.fileCards.values()].reverse()) {
    const div = document.createElement('div');
    div.className = 'file-line';
    if (card.state === 'ready') {
      div.innerHTML = `<a href="${esc(card.url)}" download="${esc(card.name)}">${esc(card.name)}</a>
        <span class="size">${esc(humanBytes(card.size))}</span>`;
    } else {
      div.innerHTML = `<span>${esc(card.name)}</span> <span class="size">${esc(card.state)}</span>`;
    }
    list.appendChild(div);
  }
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const prev = btn.textContent;
      btn.classList.add('done');
      btn.textContent = 'copied';
      setTimeout(() => { btn.classList.remove('done'); btn.textContent = prev; }, 1400);
    }
  } catch (e) {
    console.error('clipboard', e);
  }
}

async function newRoom() {
  const r = await fetch('/api/new-room').then(x => x.json());
  return r.code;
}

function shareUrlFor(code) {
  const u = new URL(location.href);
  u.searchParams.set('room', code);
  u.hash = '';
  return u.toString();
}

async function showJoiner() {
  els.joiner.style.display = 'flex';
  els.composer.style.display = 'none';
  els.thread.style.display = 'none';
  els.bar.classList.add('idle');
  setStatus('idle', 'off');

  const temp = await import('./crypto.js').then(m => m.newIdentity());
  els.joinerFp.textContent = temp.fp;
  els.joinerInput.focus();
}

function hideJoiner() {
  els.joiner.style.display = 'none';
  els.composer.style.display = 'flex';
  els.thread.style.display = 'flex';
}

async function connectToRoom(code) {
  code = String(code).toUpperCase().trim();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    pushSystem('invalid room code', 'err');
    return;
  }
  hideJoiner();
  els.thread.innerHTML = '';

  const conn = new Connection({ room: code });
  state.conn = conn;
  els.roomTag.textContent = code;
  els.asideRoom.textContent = code;
  els.roomTagWrap.style.visibility = 'visible';
  setStatus('connecting', 'warn');

  conn.on('status', s => {
    if (s === 'open') setStatus('live', 'on');
    else if (s === 'closed') setStatus('closed', 'off');
    else setStatus(s, 'warn');
  });
  conn.on('welcome', () => {
    els.asideMyFp.textContent = conn.identity.fp;
    refreshPeers();
    setComposerEnabled(true);
    els.textarea.focus();
    pushSystem(`joined room ${code} as ${conn.myId}`);
  });
  conn.on('peer-joined', p => {
    pushSystem(`peer joined · ${p.id} · fp ${p.fp}`);
    refreshPeers();
  });
  conn.on('peer-left', p => {
    pushSystem(`peer left · ${p.id}`);
    refreshPeers();
  });
  conn.on('msg', m => {
    appendMessage({
      from: m.from, fp: m.fromFp, ts: m.ts, body: m.text, self: m.self,
    });
  });
  conn.on('msg-error', e => {
    pushSystem(`decrypt error from ${e.from}: ${e.reason}`, 'err');
  });
  conn.on('error', e => {
    pushSystem(`${e.code || 'error'}: ${e.reason || ''}`, 'err');
  });
  conn.on('file-init', f => {
    const card = { id: f.id, name: f.name, size: f.size, state: 'incoming' };
    state.fileCards.set(f.id, card);
    const el = appendMessage({
      from: f.from, fp: state.conn.peers.get(f.from)?.fp, ts: Date.now(),
      kind: 'file', fileMeta: card,
    });
    card.el = el;
    refreshFiles();
  });
  conn.on('file-chunk', f => {
    const card = state.fileCards.get(f.id);
    if (!card) return;
    const pct = Math.round(((f.seq + 1) / f.total) * 100);
    card.state = `${pct}%`;
    const cardEl = card.el?.querySelector('.file-card');
    if (cardEl) {
      const dl = cardEl.querySelector('.download');
      if (dl) dl.textContent = `${pct}%`;
    }
    refreshFiles();
  });
  conn.on('file-complete', f => {
    const card = state.fileCards.get(f.id);
    if (!card) return;
    const blob = new Blob([f.bytes], { type: f.contentType });
    card.url = URL.createObjectURL(blob);
    card.state = 'ready';
    if (card.el) {
      card.el.querySelector('.file-card').outerHTML =
        renderFileCard({ id: card.id, name: card.name, size: card.size, state: 'ready', url: card.url })
          .replace(/^<div class="body">|<\/div>$/g, '');
    }
    refreshFiles();
  });
  conn.on('file-sent-init', f => {
    const card = { id: f.id, name: f.name, size: f.size, state: 'sending', sent: true };
    state.fileCards.set(f.id, card);
    const el = appendMessage({
      from: state.conn.myId, fp: state.conn.identity.fp, ts: Date.now(),
      self: true, kind: 'file', fileMeta: card,
    });
    card.el = el;
    refreshFiles();
  });
  conn.on('file-sent-complete', f => {
    const card = state.fileCards.get(f.id);
    if (!card) return;
    card.state = 'sent';
    if (card.el) {
      const dl = card.el.querySelector('.download');
      if (dl) dl.textContent = 'sent';
    }
    refreshFiles();
  });

  await conn.connect();
  refreshPeers();
  refreshFiles();

  const u = new URL(location.href);
  u.searchParams.set('room', code);
  history.replaceState({}, '', u.toString());
}

async function sendCurrent() {
  const text = els.textarea.value.trim();
  if (!text || !state.conn) return;
  els.textarea.value = '';
  autosizeTextarea();
  await state.conn.send(text);
}

async function sendFile(file) {
  if (!file || !state.conn) return;
  try {
    await state.conn.sendFile(file);
  } catch (e) {
    pushSystem('file send failed: ' + e.message, 'err');
  }
}

function wireComposer() {
  els.textarea.addEventListener('input', autosizeTextarea);
  els.textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCurrent();
    }
  });
  els.sendBtn.addEventListener('click', sendCurrent);
  els.fileBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    const f = els.fileInput.files[0];
    if (f) sendFile(f);
    els.fileInput.value = '';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', e => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    dragDepth++;
    els.dropOverlay.classList.add('on');
  });
  window.addEventListener('dragleave', () => {
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; els.dropOverlay.classList.remove('on'); }
  });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    els.dropOverlay.classList.remove('on');
    const file = e.dataTransfer?.files?.[0];
    if (file) sendFile(file);
  });
}

function wireJoiner() {
  els.joinerJoin.addEventListener('click', () => {
    connectToRoom(els.joinerInput.value);
  });
  els.joinerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') connectToRoom(els.joinerInput.value);
  });
  els.joinerInput.addEventListener('input', () => {
    els.joinerInput.value = els.joinerInput.value.toUpperCase();
  });
  els.joinerNew.addEventListener('click', async () => {
    const code = await newRoom();
    els.joinerInput.value = code;
    await connectToRoom(code);
  });
}

function wireAside() {
  els.asideCopyCode.addEventListener('click', () => {
    if (!state.conn) return;
    copyText(state.conn.room, els.asideCopyCode);
  });
  els.asideCopyUrl.addEventListener('click', () => {
    if (!state.conn) return;
    copyText(shareUrlFor(state.conn.room), els.asideCopyUrl);
  });
  els.copyRoom.addEventListener('click', () => {
    if (!state.conn) return;
    copyText(shareUrlFor(state.conn.room), els.copyRoom);
  });
}

// Heuristic: does this look like code we should auto-fence?
function looksLikeCode(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return false;

  let score = 0;

  // Indentation — at least 2 lines starting with whitespace
  const indented = lines.filter(l => /^[\t ]{2,}/.test(l)).length;
  if (indented >= 2) score += 2;

  // Code-ish tokens
  const tokenRe = /[{};]|=>|\b(function|const|let|var|def|class|return|import|from|export|public|private|fn|impl|pub|async|await|yield|throw)\b|#include|::|->/g;
  const tokenHits = (text.match(tokenRe) || []).length;
  if (tokenHits >= 3) score += 2;
  else if (tokenHits >= 1) score += 1;

  // Balanced brackets
  const opens = (text.match(/[{[(]/g) || []).length;
  const closes = (text.match(/[}\])]/g) || []).length;
  if (opens >= 2 && Math.abs(opens - closes) <= 2) score += 1;

  // Semicolon line endings
  const semiEnds = lines.filter(l => /;\s*$/.test(l)).length;
  if (semiEnds >= 2) score += 1;

  // Shebang or comment-y first line
  if (/^#!|^\/\/|^\/\*|^#\s|^--\s/.test(lines[0])) score += 1;

  // Negative: lots of long prose lines
  const prose = lines.filter(l => {
    const t = l.trim();
    return t.length > 80 && !/[{};=]|=>/.test(t) && /[a-z][a-z ]{30,}/.test(t);
  }).length;
  if (prose >= 2) score -= 3;

  return score >= 3;
}

function guessLanguage(text) {
  if (!globalThis.hljs?.highlightAuto) return '';
  try {
    const r = globalThis.hljs.highlightAuto(text, [
      'javascript', 'typescript', 'python', 'go', 'rust', 'java',
      'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin',
      'bash', 'json', 'yaml', 'xml', 'css', 'sql', 'markdown', 'diff',
    ]);
    return (r && r.language && r.relevance >= 5) ? r.language : '';
  } catch { return ''; }
}

function insertAtCursor(ta, text) {
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.dispatchEvent(new Event('input'));
}

function wirePaste() {
  document.addEventListener('paste', (e) => {
    if (document.activeElement !== els.textarea) return;

    // 1) File paste (existing behaviour)
    const items = e.clipboardData?.items;
    if (items) {
      for (const it of items) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            sendFile(f);
            return;
          }
        }
      }
    }

    // 2) Code paste — auto-fence if it looks like code
    const text = e.clipboardData?.getData('text/plain');
    if (!text || text.length < 40) return;

    const ta = els.textarea;
    const before = ta.value.slice(0, ta.selectionStart);
    // Skip if cursor is already inside an open ``` fence
    if (((before.match(/```/g) || []).length) % 2 === 1) return;

    if (!looksLikeCode(text)) return;

    e.preventDefault();
    const lang = guessLanguage(text);
    const trimmed = text.replace(/^[\r\n]+|[\r\n]+$/g, '');
    const fence = '```' + lang + '\n' + trimmed + '\n```\n';
    insertAtCursor(ta, fence);
    autosizeTextarea();
  });
}

async function boot() {
  setComposerEnabled(false);
  wireJoiner();
  wireAside();
  wireComposer();
  wirePaste();

  const u = new URL(location.href);
  const code = (u.searchParams.get('room') || '').toUpperCase();
  if (/^[A-Z2-9]{6}$/.test(code)) {
    await connectToRoom(code);
  } else {
    await showJoiner();
  }
}

boot().catch(e => {
  console.error(e);
  pushSystem('boot failed: ' + e.message, 'err');
});
