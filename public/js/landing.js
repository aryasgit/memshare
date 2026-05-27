// Landing-page interactions. Each section gets its own micro-interaction:
//   - live clock in nav and philosophy row
//   - cursor crosshair (hero only)
//   - accordion (loop section)
//   - hover-pause marquee (CSS only, this file just renders the lane)
//   - underline tabs (install section)
//   - reveal on scroll (every section)

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function tickClock() {
  const d = new Date();
  const pad = n => n < 10 ? '0' + n : '' + n;
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  for (const el of $$('[data-clock]')) el.textContent = t;
}
setInterval(tickClock, 1000); tickClock();

function setupCrosshair() {
  const ch = $('.crosshair');
  if (!ch) return;
  const v = ch.querySelector('.vline');
  const h = ch.querySelector('.hline');
  const coord = ch.querySelector('.coord');
  const hero = $('.hero');
  if (!hero) return;

  window.addEventListener('mousemove', (e) => {
    const r = hero.getBoundingClientRect();
    const inHero = e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inHero) { ch.classList.remove('on'); return; }
    ch.classList.add('on');
    v.style.left = e.clientX + 'px';
    h.style.top  = e.clientY + 'px';
    coord.style.left = (e.clientX + 8) + 'px';
    coord.style.top  = (e.clientY + 8) + 'px';
    coord.textContent = `x ${e.clientX}  y ${e.clientY}`;
  });
  window.addEventListener('mouseleave', () => ch.classList.remove('on'));
}

function setupAccordion() {
  for (const step of $$('.step')) {
    step.addEventListener('click', () => {
      const open = step.classList.contains('open');
      for (const s of $$('.step')) s.classList.remove('open');
      if (!open) step.classList.add('open');
    });
  }
  // open the first step by default for visual interest
  $('.step')?.classList.add('open');
}

function setupTabs() {
  const tabs = $$('.tabs button');
  const panels = $$('.panel');
  function pick(name) {
    for (const t of tabs) t.classList.toggle('on', t.dataset.tab === name);
    for (const p of panels) p.classList.toggle('on', p.dataset.panel === name);
  }
  for (const t of tabs) t.addEventListener('click', () => pick(t.dataset.tab));
  // default by UA
  const ua = (navigator.userAgent + ' ' + (navigator.platform || '')).toLowerCase();
  const initial = $('.tabs')?.dataset.kind === 'os'
    ? (ua.includes('win') ? 'win' : (ua.includes('mac') || ua.includes('iphone') || ua.includes('ipad') ? 'mac' : 'linux'))
    : tabs[0]?.dataset.tab;
  if (initial) pick(initial);
}

function setupReveal() {
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  for (const el of $$('.reveal')) io.observe(el);
}

function setupMarquee() {
  // The CSS animation requires the lane content to be duplicated so the
  // -50% translate loops seamlessly. Build it from the items in the
  // first lane.
  const lane = $('.marquee .lane');
  if (!lane) return;
  lane.innerHTML += lane.innerHTML;
}

setupCrosshair();
setupAccordion();
setupTabs();
setupReveal();
setupMarquee();
