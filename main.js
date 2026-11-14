/* Yutang Qiao — site interactions
   1. XY-model spin background with vortex pairs that reacts to the cursor
   2. Theme toggle, scroll reveal, section highlight, card spotlight */

(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- theme toggle ---------------- */
  const toggle = document.querySelector('.theme-toggle');
  const stored = (() => { try { return localStorage.getItem('theme'); } catch (e) { return null; } })();
  root.dataset.theme = stored === 'light' ? 'light' : 'dark';   // night mode unless the visitor chose light

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

  /* ---------------- XY-model background: spin waves and interacting vortices ----------------
     Each mark is a planar spin. Its angle is a pair of travelling spin waves plus the winding
     of every vortex on screen. Vortices (+1) and antivortices (-1) are free particles: like
     charges repel, opposite charges attract, they drift thermally, annihilate when they meet,
     and new pairs nucleate to replace them. This is the picture behind the
     Berezinskii-Kosterlitz-Thouless transition. The cursor is itself a +1 vortex: it pushes
     vortices away and pulls antivortices toward it. */
  const lattice = (() => {
    const canvas = document.getElementById('lattice');
    if (!canvas) return { readColors() {}, redraw() {} };
    const ctx = canvas.getContext('2d');

    const S = 30;          // lattice spacing (px)
    const L = 11;          // spin length
    const R = 170;         // cursor highlight radius
    const MU = 0.25;       // vortex mobility: velocity = MU * q1*q2 / r   (px/ms)
    const CURSOR = 12;     // how much stronger the cursor vortex is
    const CORE = 46;       // antivortices hover at this distance from the cursor
    const ANNIHILATE = 13; // opposite charges closer than this cancel
    const VMAX = 0.14;     // speed limit (px/ms)

    let W = 0, H = 0, cols = 0, rows = 0, target = 4;
    let vort = [];                      // { x, y, q, dx, dy, kx, ky, fade }
    let col = { base: '0,53,107', glow: '0,90,190', hop: '0,90,190' };
    let gain = 1;                       // brightness of the spins, set per theme
    const mouse = { x: 0, y: 0, on: false };
    const cursor = { x: 0, y: 0, on: false, fade: 0 };
    let running = false, now = 0, prev = 0, spawnTimer = 0;
    const rnd = Math.random;

    function readColors() {
      const s = getComputedStyle(root);
      col = {
        base: s.getPropertyValue('--lat-rgb').trim() || col.base,
        glow: s.getPropertyValue('--lat-glow-rgb').trim() || col.glow,
        hop: s.getPropertyValue('--lat-hop-rgb').trim() || col.hop,
      };
      gain = parseFloat(s.getPropertyValue('--lat-gain')) || 1;
    }

    function spawnPair(x, y, kick, half) {
      const a = rnd() * 6.2832, ux = Math.cos(a), uy = Math.sin(a);
      const make = (q, sgn) => ({
        x: x + sgn * ux * half, y: y + sgn * uy * half, q,
        dx: 0, dy: 0, kx: sgn * ux * kick, ky: sgn * uy * kick, fade: 0,
      });
      vort.push(make(1, 1), make(-1, -1));
    }

    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / S) + 2; rows = Math.ceil(H / S) + 3;
      target = Math.max(3, Math.min(6, Math.round((W * H) / 240000)));
      if (!vort.length) {
        for (let k = 0; k < target; k++) {
          spawnPair(W * (0.12 + 0.76 * rnd()), H * (0.12 + 0.76 * rnd()), 0, 40 + rnd() * 40);
        }
        vort.forEach((v) => { v.fade = 1; });
      }
    }

    function update(dt) {
      // cursor vortex appears with an antivortex partner, so the far field never jumps
      if (mouse.on && !cursor.on) {
        cursor.on = true; cursor.x = mouse.x; cursor.y = mouse.y; cursor.fade = 0;
        const a = rnd() * 6.2832;
        vort.push({ x: mouse.x + Math.cos(a) * 26, y: mouse.y + Math.sin(a) * 26, q: -1, dx: 0, dy: 0, kx: 0, ky: 0, fade: 0 });
      } else if (!mouse.on && cursor.on) {
        cursor.on = false;      // release it as an ordinary free vortex
        vort.push({ x: cursor.x, y: cursor.y, q: 1, dx: 0, dy: 0, kx: 0, ky: 0, fade: 1 });
      }
      if (cursor.on) {
        const k = Math.min(1, dt * 0.02);
        cursor.x += (mouse.x - cursor.x) * k; cursor.y += (mouse.y - cursor.y) * k;
        cursor.fade = Math.min(1, cursor.fade + dt / 400);
      }

      const decay = Math.exp(-dt / 700);
      for (let i = 0; i < vort.length; i++) {
        const v = vort[i];
        let fx = 0, fy = 0;
        for (let j = 0; j < vort.length; j++) {
          if (j === i) continue;
          const u = vort[j], dx = v.x - u.x, dy = v.y - u.y;
          const f = MU * v.q * u.q / (dx * dx + dy * dy + 400);
          fx += f * dx; fy += f * dy;
        }
        if (cursor.on) {
          const dx = v.x - cursor.x, dy = v.y - cursor.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2) || 1;
          let f;
          if (v.q > 0) f = CURSOR * MU / (r2 + 400);                                   // pushed away
          else if (r > CORE) f = -CURSOR * MU / (r2 + 400) * Math.min(1, (r - CORE) / 40); // pulled in
          else f = 0.002 * (CORE - r) / r;                                              // held at the core
          fx += f * dx; fy += f * dy;
        }
        // thermal drift
        v.dx += ((rnd() - 0.5) * 0.00045 - v.dx * 0.001) * dt;
        v.dy += ((rnd() - 0.5) * 0.00045 - v.dy * 0.001) * dt;
        v.kx *= decay; v.ky *= decay;
        // keep them on screen
        const m = 50;
        if (v.x < m) fx += (m - v.x) * 0.0006; else if (v.x > W - m) fx -= (v.x - (W - m)) * 0.0006;
        if (v.y < m) fy += (m - v.y) * 0.0006; else if (v.y > H - m) fy -= (v.y - (H - m)) * 0.0006;

        let vx = fx + v.dx + v.kx, vy = fy + v.dy + v.ky;
        const sp = Math.hypot(vx, vy);
        if (sp > VMAX) { vx *= VMAX / sp; vy *= VMAX / sp; }
        v.nx = v.x + vx * dt; v.ny = v.y + vy * dt;
        v.fade = Math.min(1, v.fade + dt / 600);
      }
      for (const v of vort) { v.x = v.nx; v.y = v.ny; }

      // annihilation of opposite charges
      for (let i = 0; i < vort.length; i++) {
        const a = vort[i];
        if (a.dead) continue;
        for (let j = i + 1; j < vort.length; j++) {
          const b = vort[j];
          if (b.dead || a.q === b.q) continue;
          if (Math.hypot(a.x - b.x, a.y - b.y) < ANNIHILATE) { a.dead = b.dead = true; break; }
        }
      }
      if (vort.some((v) => v.dead)) vort = vort.filter((v) => !v.dead);

      // nucleate new pairs to keep the population up
      spawnTimer += dt;
      if (spawnTimer > 1600 && vort.length < target * 2) {
        spawnPair(W * (0.1 + 0.8 * rnd()), H * (0.1 + 0.8 * rnd()), 0.1, 14);
        spawnTimer = 0;
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      const oy = -((window.scrollY * 0.1) % S);
      const n = vort.length + (cursor.on ? 1 : 0);
      const vx = new Float32Array(n), vy = new Float32Array(n), vq = new Float32Array(n);
      for (let k = 0; k < vort.length; k++) { vx[k] = vort[k].x; vy[k] = vort[k].y; vq[k] = vort[k].q; }
      if (cursor.on) { vx[n - 1] = cursor.x; vy[n - 1] = cursor.y; vq[n - 1] = 1; }

      const near = [], heads = [], crest = [];
      const R2 = R * R;

      ctx.lineCap = 'round';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${col.base},${0.17 * gain})`;
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        const y = (j - 1) * S + oy + S / 2;
        for (let i = 0; i < cols; i++) {
          const x = (i - 0.5) * S;
          // two travelling spin waves
          const w1 = Math.sin(x * 0.014 + y * 0.008 - t * 0.0011);
          const w2 = Math.sin(x * 0.007 - y * 0.012 + t * 0.0007);
          let th = 0.62 * w1 + 0.4 * w2;
          for (let k = 0; k < n; k++) th += vq[k] * Math.atan2(y - vy[k], x - vx[k]);
          const c = Math.cos(th) * L / 2, s = Math.sin(th) * L / 2;
          ctx.moveTo(x - c, y - s); ctx.lineTo(x + c, y + s);
          heads.push(x + c, y + s);
          if (w1 > 0.55) crest.push(x, y, c, s);
          if (mouse.on) {
            const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
            if (d2 < R2) { const f = 1 - Math.sqrt(d2) / R; near.push(x, y, c, s, f * f); }
          }
        }
      }
      ctx.stroke();

      // wave crests are drawn stronger, so the spin wave shows as moving bands
      ctx.strokeStyle = `rgba(${col.base},${0.2 * gain})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < crest.length; k += 4) {
        ctx.moveTo(crest[k] - crest[k + 2], crest[k + 1] - crest[k + 3]);
        ctx.lineTo(crest[k] + crest[k + 2], crest[k + 1] + crest[k + 3]);
      }
      ctx.stroke();

      // arrow heads
      ctx.fillStyle = `rgba(${col.base},${Math.min(1, 0.36 * gain)})`;
      ctx.beginPath();
      for (let k = 0; k < heads.length; k += 2) {
        ctx.moveTo(heads[k] + 1.4, heads[k + 1]); ctx.arc(heads[k], heads[k + 1], 1.4, 0, 6.2832);
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
      ctx.lineWidth = 1.3;
      for (const v of vort) {
        ctx.strokeStyle = `rgba(${col.glow},${(0.6 * v.fade).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(v.x, v.y, 8, 0, 6.2832); ctx.stroke();
        if (v.q > 0) {
          ctx.fillStyle = `rgba(${col.glow},${(0.7 * v.fade).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(v.x, v.y, 2.8, 0, 6.2832); ctx.fill();
        }
      }
      // the cursor vortex is marked by the page's own cursor (see style.css)
    }

    function step(t) {
      if (!running) return;
      const dt = Math.min(40, prev ? t - prev : 16);
      prev = t; now = t;
      update(dt);
      draw(t);
      requestAnimationFrame(step);
    }

    function start() {
      if (reduceMotion || running || document.hidden) return;
      running = true; prev = 0; requestAnimationFrame(step);
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
