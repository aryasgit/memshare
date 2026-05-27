// Tiny markdown for chat. Supports: fenced code (```lang ... ```),
// inline code (`x`), **bold**, *italic*, ~~strike~~, [text](url),
// autolinked http(s) URLs. Everything else stays as plain text with
// line breaks preserved.
//
// Syntax highlighting calls window.hljs if it exists; otherwise code
// blocks render unstyled (still monospace + dark, still readable).

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

function renderInline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(URL_RE, (m) => {
    if (s.includes(`href="${m}"`) || s.includes(`>${m}</a>`)) return m;
    return `<a href="${m}" target="_blank" rel="noopener">${m}</a>`;
  });
  return s;
}

const LANG_LABELS = {
  js: 'javascript', javascript: 'javascript', mjs: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript', jsx: 'javascript',
  py: 'python', python: 'python',
  rb: 'ruby', ruby: 'ruby',
  go: 'go', golang: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java', kt: 'kotlin', kotlin: 'kotlin', swift: 'swift',
  c: 'c', 'c++': 'cpp', cpp: 'cpp', cxx: 'cpp', cs: 'csharp', csharp: 'csharp',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash',
  html: 'xml', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  sql: 'sql',
  md: 'markdown', markdown: 'markdown',
  diff: 'diff', patch: 'diff',
};

function normalizeLang(raw) {
  if (!raw) return '';
  const k = raw.trim().toLowerCase();
  return LANG_LABELS[k] || k;
}

export function render(input) {
  const src = String(input || '');
  const out = [];
  const lines = src.split('\n');
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join('\n');
    out.push(`<p>${renderInline(text).replace(/\n/g, '<br>')}</p>`);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    const fence = /^(```|~~~)([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      const marker = fence[1];
      const lang = normalizeLang(fence[2]);
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(marker)) {
        buf.push(lines[i]); i++;
      }
      i++;
      const code = buf.join('\n');
      const label = lang || 'text';
      const langClass = lang ? ` class="language-${esc(lang)}"` : '';
      out.push(
        `<pre data-lang="${esc(label)}">` +
          `<div class="pre-bar">` +
            `<span>${esc(label)}</span>` +
            `<button type="button" class="copy-btn" data-copy>copy</button>` +
          `</div>` +
          `<code${langClass}>${esc(code)}</code>` +
        `</pre>`
      );
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      i++; continue;
    }

    if (line.startsWith('> ')) {
      flushPara();
      const bq = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        bq.push(lines[i].slice(2)); i++;
      }
      out.push(`<blockquote>${renderInline(bq.join('\n')).replace(/\n/g, '<br>')}</blockquote>`);
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      const items = [];
      while (i < lines.length) {
        const m = /^[-*]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(`<li>${renderInline(m[1])}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    const ol = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      const items = [];
      while (i < lines.length) {
        const m = /^\d+\.\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(`<li>${renderInline(m[1])}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return out.join('');
}

export function highlight(root) {
  if (!root || !globalThis.hljs) return;
  for (const el of root.querySelectorAll('pre code')) {
    if (el.dataset.hl === '1') continue;
    el.dataset.hl = '1';
    try { globalThis.hljs.highlightElement(el); } catch {}
  }
}

export function wireCopyButtons(root) {
  if (!root) return;
  for (const btn of root.querySelectorAll('button[data-copy]')) {
    if (btn.dataset.wired === '1') continue;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
      const code = btn.closest('pre')?.querySelector('code')?.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'copied';
        btn.classList.add('done');
        setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('done'); }, 1400);
      } catch {}
    });
  }
}

export function humanBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
