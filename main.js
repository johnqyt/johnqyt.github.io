/* Yutang Qiao — site interactions
   1. XY-model spin background with vortex pairs that reacts to the cursor
   2. Theme toggle, scroll reveal, section highlight, card spotlight */

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

  /* ---------------- XY-model background: planar spins with vortex pairs ----------------
     Each mark is a planar spin. Its angle is a slow spin wave plus the winding of a few
     vortex-antivortex pairs, the excitations behind the Berezinskii-Kosterlitz-Thouless
     transition. Moving the cursor pulls a new pair apart; when it rests, the pair
     recombines. */
  const lattice = (() => {
    const canvas = document.getElementById('lattice');
    if (!canvas) return { readColors() {}, redraw() {} };
    const ctx = canvas.getContext('2d');

    const S = 34;      // lattice spacing (px)
    const L = 12;      // spin length
    const R = 170;     // cursor highlight radius
    let W = 0, H = 0, cols = 0, rows = 0, pairs = [];
    let col = { base: '0,53,107', glow: '0,90,190', hop: '0,90,190' };
    const mouse = { x: 0, y: 0, on: false };
    const probe = { x: 0, y: 0, ax: 0, ay: 0, ready: false };   // cursor vortex and its antivortex
    let running = false, now = 0;

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
      cols = Math.ceil(W / S) + 2; rows = Math.ceil(H / S) + 3;

      const n = W * H > 900000 ? 3 : 2;
      const rnd = Math.random;
      pairs = [];
      for (let k = 0; k < n; k++) {
        pairs.push({
          cx: W * (0.2 + 0.6 * rnd()), cy: H * (0.2 + 0.6 * rnd()),
          ax: W * 0.16, ay: H * 0.15,
          fx: 0.00003 + rnd() * 0.00003, fy: 0.00003 + rnd() * 0.00003,
          px: rnd() * 6.2832, py: rnd() * 6.2832,
          d: 80 + rnd() * 70, phase: rnd() * 6.2832,
          spin: (rnd() < 0.5 ? -1 : 1) * (0.00010 + rnd() * 0.00010),
        });
      }
    }

    function vortices(t) {
      const list = [];
      for (const p of pairs) {
        const cx = p.cx + p.ax * Math.sin(t * p.fx + p.px);
        const cy = p.cy + p.ay * Math.sin(t * p.fy + p.py);
        const a = p.phase + t * p.spin;
        const dx = Math.cos(a) * p.d / 2, dy = Math.sin(a) * p.d / 2;
        list.push({ x: cx + dx, y: cy + dy, q: 1, s: 1 }, { x: cx - dx, y: cy - dy, q: -1, s: 1 });
      }
      if (probe.ready) {
        const sep = Math.hypot(probe.x - probe.ax, probe.y - probe.ay);
        const s = Math.min(1, sep / 50);
        if (s > 0.04) {
          list.push({ x: probe.x, y: probe.y, q: 1, s }, { x: probe.ax, y: probe.ay, q: -1, s });
        }
      }
      return list;
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      const oy = -((window.scrollY * 0.1) % S);
      const vs = vortices(t);
      const near = [];
      const heads = [];
      const R2 = R * R;

      ctx.lineCap = 'round';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${col.base},0.2)`;
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        const y = (j - 1) * S + oy + S / 2;
        for (let i = 0; i < cols; i++) {
          const x = (i - 0.5) * S;
          // spin wave
          let th = 0.34 * Math.sin(x * 0.0052 + y * 0.0037 - t * 0.0004)
                 + 0.20 * Math.sin(x * 0.0031 - y * 0.0058 + t * 0.00027);
          // winding from every vortex
          for (let k = 0; k < vs.length; k++) th += vs[k].q * Math.atan2(y - vs[k].y, x - vs[k].x);
          const c = Math.cos(th) * L / 2, s = Math.sin(th) * L / 2;
          ctx.moveTo(x - c, y - s); ctx.lineTo(x + c, y + s);
          heads.push(x + c, y + s);
          if (mouse.on) {
            const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
            if (d2 < R2) { const f = 1 - Math.sqrt(d2) / R; near.push(x, y, c, s, f * f); }
          }
        }
      }
      ctx.stroke();

      // arrow heads: a dot at the tip of each spin
      ctx.fillStyle = `rgba(${col.base},0.36)`;
      ctx.beginPath();
      for (let k = 0; k < heads.length; k += 2) {
        ctx.moveTo(heads[k] + 1.6, heads[k + 1]); ctx.arc(heads[k], heads[k + 1], 1.6, 0, 6.2832);
      }
      ctx.fill();

      // spins near the cursor light up
      for (let k = 0; k < near.length; k += 5) {
        const x = near[k], y = near[k + 1], c = near[k + 2], s = near[k + 3], f = near[k + 4];
        ctx.strokeStyle = `rgba(${col.glow},${(f * 0.85).toFixed(3)})`;
        ctx.lineWidth = 1.2 + f;
        ctx.beginPath(); ctx.moveTo(x - c, y - s); ctx.lineTo(x + c, y + s); ctx.stroke();
        ctx.fillStyle = `rgba(${col.glow},${(f * 0.95).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x + c, y + s, 1.6 + f, 0, 6.2832); ctx.fill();
      }

      // vortex cores: filled for +1, hollow for -1
      ctx.lineWidth = 1.2;
      for (const v of vs) {
        ctx.strokeStyle = `rgba(${col.glow},${(0.5 * v.s).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(v.x, v.y, 8, 0, 6.2832); ctx.stroke();
        if (v.q > 0) {
          ctx.fillStyle = `rgba(${col.glow},${(0.6 * v.s).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(v.x, v.y, 2.6, 0, 6.2832); ctx.fill();
        }
      }
    }

    function step(t) {
      if (!running) return;
      now = t;
      if (mouse.on) {
        if (!probe.ready) { probe.x = probe.ax = mouse.x; probe.y = probe.ay = mouse.y; probe.ready = true; }
        probe.x += (mouse.x - probe.x) * 0.2; probe.y += (mouse.y - probe.y) * 0.2;
        probe.ax += (probe.x - probe.ax) * 0.022; probe.ay += (probe.y - probe.ay) * 0.022;
      } else if (probe.ready) {
        probe.x += (probe.ax - probe.x) * 0.06; probe.y += (probe.ay - probe.y) * 0.06;
      }
      draw(t);
      requestAnimationFrame(step);
    }

    function start() {
      if (reduceMotion || running || document.hidden) return;
      running = true; requestAnimationFrame(step);
    }
    function stop() { running = false; }
    function redraw() { if (!running) draw(now); }

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

  /* ---------------- email button: also copy the address ---------------- */
  const email = document.querySelector('a.email');
  if (email) {
    const label = email.querySelector('span');
    const original = label.textContent;
    let timer;
    email.addEventListener('click', () => {
      const address = email.dataset.email;
      const done = () => {
        label.textContent = 'Address copied';
        clearTimeout(timer);
        timer = setTimeout(() => { label.textContent = original; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(done).catch(() => {});
      }
    });
  }
})();
