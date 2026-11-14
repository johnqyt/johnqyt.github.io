/* Yutang Qiao — site interactions
   1. Graphene-lattice background that reacts to the cursor
   2. Theme toggle, scroll reveal, section highlight, card spotlight, figure lightbox */

(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- theme toggle ---------------- */
  const toggle = document.querySelector('.theme-toggle');
  const stored = (() => { try { return localStorage.getItem('theme'); } catch (e) { return null; } })();
  if (stored === 'light' || stored === 'dark') root.dataset.theme = stored;

  const isDark = () =>
    root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;

  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
      lattice.readColors();
      lattice.redraw();
    });
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    lattice.readColors();
    lattice.redraw();
  });

  /* ---------------- graphene lattice background ---------------- */
  const lattice = (() => {
    const canvas = document.getElementById('lattice');
    if (!canvas) return { readColors() {}, redraw() {} };
    const ctx = canvas.getContext('2d');

    const A = 30;                      // carbon-carbon bond length (px)
    const ROW = A * 1.5;               // row height of the honeycomb
    const COL = A * Math.sqrt(3);      // column width
    const R = 190;                     // cursor influence radius
    let W = 0, H = 0, sites = [], bonds = [], adj = [], electrons = [];
    let col = { base: '0,53,107', glow: '0,90,190', hop: '214,138,30' };
    const mouse = { x: -9999, y: -9999, on: false };
    let last = 0, running = false;

    function readColors() {
      const s = getComputedStyle(root);
      col = {
        base: s.getPropertyValue('--lat-rgb').trim() || col.base,
        glow: s.getPropertyValue('--lat-glow-rgb').trim() || col.glow,
        hop: s.getPropertyValue('--lat-hop-rgb').trim() || col.hop,
      };
    }

    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(W / COL) + 4;
      const rows = Math.ceil(H / ROW) + 8;
      const id = (i, j, b) => (i < 0 || j < 0 || i >= cols || j >= rows) ? -1 : (j * cols + i) * 2 + b;

      // honeycomb: two atoms per cell, A at the cell origin and B one bond below it
      sites = new Array(cols * rows * 2);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = (i - 2 + (j & 1) / 2) * COL, y = (j - 3) * ROW;
          sites[id(i, j, 0)] = { x, y, px: 0, py: 0, g: 0 };
          sites[id(i, j, 1)] = { x, y: y + A, px: 0, py: 0, g: 0 };
        }
      }

      bonds = []; adj = sites.map(() => []);
      const link = (p, q) => { if (p < 0 || q < 0) return; bonds.push([p, q]); adj[p].push(q); adj[q].push(p); };
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const b = id(i, j, 1), odd = j & 1;
          link(id(i, j, 0), b);                               // vertical bond
          link(b, id(odd ? i + 1 : i, j + 1, 0));             // down-right
          link(b, id(odd ? i : i - 1, j + 1, 0));             // down-left
        }
      }

      const n = reduceMotion ? 0 : Math.max(3, Math.min(6, Math.round((W * H) / 300000)));
      electrons = [];
      for (let k = 0; k < n; k++) electrons.push(spawn());
    }

    function spawn() {
      let from = Math.floor(Math.random() * sites.length);
      for (let t = 0; t < 20 && !adj[from].length; t++) from = Math.floor(Math.random() * sites.length);
      const to = adj[from][Math.floor(Math.random() * adj[from].length)] ?? from;
      return { from, to, prev: -1, p: Math.random(), v: 0.0005 + Math.random() * 0.0005 };
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      const oy = -((window.scrollY * 0.12) % (2 * ROW));
      const mx = mouse.x, my = mouse.y, R2 = R * R;

      // positions + cursor response
      for (let k = 0; k < sites.length; k++) {
        const s = sites[k];
        let x = s.x, y = s.y + oy, target = 0, ux = 0, uy = 0;
        if (mouse.on) {
          const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1, f = 1 - d / R;
            target = f * f; ux = dx / d; uy = dy / d;
          }
        }
        s.g += (target - s.g) * 0.14;
        if (s.g < 0.002) s.g = 0;
        s.px = x + ux * s.g * 10; s.py = y + uy * s.g * 10;
      }

      // base bonds
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${col.base},0.13)`;
      ctx.beginPath();
      for (let k = 0; k < bonds.length; k++) {
        const a = sites[bonds[k][0]], b = sites[bonds[k][1]];
        ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py);
      }
      ctx.stroke();

      // highlighted bonds near the cursor
      for (let k = 0; k < bonds.length; k++) {
        const a = sites[bonds[k][0]], b = sites[bonds[k][1]];
        const g = Math.min(a.g, b.g);
        if (g > 0.01) {
          ctx.strokeStyle = `rgba(${col.glow},${(g * 0.75).toFixed(3)})`;
          ctx.lineWidth = 1 + g * 0.8;
          ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
        }
      }

      // base sites, with a slow travelling wave
      ctx.fillStyle = `rgba(${col.base},0.26)`;
      ctx.beginPath();
      for (let k = 0; k < sites.length; k++) {
        const s = sites[k];
        ctx.moveTo(s.px + 1.4, s.py); ctx.arc(s.px, s.py, 1.4, 0, 6.2832);
      }
      ctx.fill();

      ctx.fillStyle = `rgba(${col.base},0.2)`;
      ctx.beginPath();
      for (let k = 0; k < sites.length; k++) {
        const s = sites[k];
        const w = Math.sin(s.x * 0.007 + s.y * 0.005 - t * 0.0005);
        if (w > 0.72) { ctx.moveTo(s.px + 2, s.py); ctx.arc(s.px, s.py, 2, 0, 6.2832); }
      }
      ctx.fill();

      // glowing sites near the cursor
      for (let k = 0; k < sites.length; k++) {
        const s = sites[k];
        if (s.g > 0.01) {
          ctx.fillStyle = `rgba(${col.glow},${Math.min(1, 0.25 + s.g * 0.9).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(s.px, s.py, 1.6 + s.g * 2.2, 0, 6.2832); ctx.fill();
        }
      }

      // hopping particles
      for (let k = 0; k < electrons.length; k++) {
        const e = electrons[k], a = sites[e.from], b = sites[e.to];
        const p = e.p < 0.5 ? 2 * e.p * e.p : 1 - Math.pow(-2 * e.p + 2, 2) / 2; // ease in-out
        const x = a.px + (b.px - a.px) * p, y = a.py + (b.py - a.py) * p;
        ctx.fillStyle = `rgba(${col.hop},0.10)`;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.2832); ctx.fill();
        ctx.fillStyle = `rgba(${col.hop},0.55)`;
        ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 6.2832); ctx.fill();
      }
    }

    function step(t) {
      if (!running) return;
      const dt = Math.min(50, t - last || 16); last = t;
      for (let k = 0; k < electrons.length; k++) {
        const e = electrons[k];
        e.p += dt * e.v;
        if (e.p >= 1) {
          const options = adj[e.to];
          let next = options[Math.floor(Math.random() * options.length)];
          if (next === e.from && options.length > 1) next = options[Math.floor(Math.random() * options.length)];
          e.prev = e.from; e.from = e.to; e.to = next ?? e.from; e.p = 0;
          const s = sites[e.from];
          if (s.x < -80 || s.x > W + 80 || s.y < -160 || s.y > H + 160) electrons[k] = spawn();
        }
      }
      draw(t);
      requestAnimationFrame(step);
    }

    function start() {
      if (reduceMotion || running || document.hidden) return;
      running = true; last = 0; requestAnimationFrame(step);
    }
    function stop() { running = false; }
    function redraw() { if (!running) draw(performance.now()); }

    readColors(); build(); draw(0); start();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { build(); redraw(); }, 120);
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { mouse.on = false; });
    window.addEventListener('blur', () => { mouse.on = false; });
    window.addEventListener('scroll', () => redraw(), { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    return { readColors, redraw };
  })();

  /* ---------------- scroll reveal ---------------- */
  const revealTargets = [...document.querySelectorAll('main section > h2, .bio p, .edu li, .card, #honors li')];
  let pending = [];
  if (!reduceMotion) {
    // only hide what starts below the fold, so nothing is ever stuck invisible
    pending = revealTargets.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    pending.forEach((el) => el.classList.add('reveal'));
  }
  function revealVisible() {
    if (!pending.length) return;
    const limit = window.innerHeight * 0.94;
    pending = pending.filter((el) => {
      if (el.getBoundingClientRect().top < limit) { el.classList.add('in'); return false; }
      return true;
    });
  }

  /* ---------------- section highlight in the side menu ---------------- */
  const navLinks = [...document.querySelectorAll('.nav a')];
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const progress = document.querySelector('.progress');
  function onScroll() {
    const y = window.scrollY + window.innerHeight * 0.3;
    let current = sections[0];
    sections.forEach((s) => { if (s.offsetTop <= y) current = s; });
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= max - 4) current = sections[sections.length - 1];
    navLinks.forEach((a) => a.classList.toggle('active', current && a.getAttribute('href') === '#' + current.id));
    if (progress) progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    revealVisible();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------------- cursor spotlight on cards ---------------- */
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ---------------- figure lightbox ---------------- */
  const box = document.querySelector('.lightbox');
  if (box) {
    const img = box.querySelector('img');
    const close = () => { box.classList.remove('open'); document.body.style.overflow = ''; };
    document.querySelectorAll('a.fig').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        img.src = a.getAttribute('href');
        img.alt = a.querySelector('img')?.alt || '';
        box.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });
    box.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }
})();
