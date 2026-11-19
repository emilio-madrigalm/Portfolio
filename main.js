/* ==========================================================================
   Emilio Madrigal Mendoza — Portfolio interactions (vanilla, no deps)
   ========================================================================== */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (k) => 1 - Math.pow(1 - k, 4);

  /* ── Hero oscilloscope: a live travelling wave on the cochlear map ───────
     The lane is the 3.5 cm basilar membrane (512 sections). The cursor sets
     where the wave peaks; the HUD shows the frequency tuned to that place
     using the same map as the MATLAB model: fp = 7500 · 10^(−0.667·x).
     Desktop: the wave lives in its own lane to the right of the name.
     Mobile: it becomes a slim signal band between the buttons and the tags. */
  function initScope() {
    const canvas = $('#scope');
    const hero = $('.hero');
    if (!canvas || !hero) return;
    const ctx = canvas.getContext('2d');
    const grid = document.createElement('canvas');
    const trail = document.createElement('canvas');
    const gctx = grid.getContext('2d');
    const tctx = trail.getContext('2d');
    const hudF = $('#hud-f');
    const hudS = $('#hud-s');
    const nameEl = $('.hero-name');
    const introEl = $('.hero-intro');
    const tracksEl = $('.hero-tracks');

    let W = 0, H = 0, dpr = 1, running = false, visible = true, raf = 0;
    let lane = { x0: 0, x1: 1, y0: 0, A: 1, cycles: 7, mobile: false };
    let peak = 0.6, target = 0.6, amp = 1, ampTarget = 1;
    let lastPointer = -1e9, lastHud = '';
    let energy = 0, lastX = null; // quick cursor sweeps briefly excite the wave
    const t0 = performance.now();
    const POWER_ON = 1.1; // s — the trace "powers on" after the name lands

    function layout() {
      const hr = hero.getBoundingClientRect();
      const gutter = parseFloat(getComputedStyle(hero).paddingLeft) || 24;
      if (W > 860) {
        const nr = nameEl.getBoundingClientRect();
        const ir = introEl.getBoundingClientRect();
        const textRight = Math.max(nr.left + measureNameWidth(), ir.right) - hr.left;
        const x0 = clamp(textRight + 56, W * 0.4, W * 0.6);
        const x1 = W - gutter;
        const y0 = nr.top - hr.top + nr.height * 0.52;
        lane = { x0, x1, y0, A: Math.min(H * 0.2, (x1 - x0) * 0.32), cycles: (x1 - x0) > 560 ? 7 : 5, mobile: false };
      } else {
        const tr = tracksEl.getBoundingClientRect();
        const y0 = tr.top - hr.top - 56;
        lane = { x0: gutter, x1: W - gutter, y0, A: 24, cycles: 6, mobile: true };
      }
      hero.style.setProperty('--wave-x', lane.x0 + 'px');
    }

    // width of the longest line of the name (spans are inline-block)
    function measureNameWidth() {
      return Math.max(...$$('.line > span', nameEl).map((s) => s.getBoundingClientRect().width));
    }

    function resize() {
      const r = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      for (const c of [canvas, grid, trail]) { c.width = W * dpr; c.height = H * dpr; }
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      for (const c of [ctx, gctx, tctx]) c.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
      drawGrid();
      if (!running) frame(performance.now());
    }

    function drawGrid() {
      gctx.clearRect(0, 0, W, H);
      const div = Math.max(56, Math.round(W / 18));
      const { x0, x1, y0 } = lane;
      // faint full-bleed graticule
      gctx.lineWidth = 1;
      gctx.strokeStyle = 'rgba(255,255,255,0.03)';
      gctx.beginPath();
      for (let x = (W % div) / 2; x < W; x += div) { gctx.moveTo(x + .5, 0); gctx.lineTo(x + .5, H); }
      for (let y = y0 % div; y < H; y += div) { gctx.moveTo(0, y + .5); gctx.lineTo(W, y + .5); }
      gctx.stroke();
      // the lane's axis with minor ticks, fading in from its left edge
      const g = gctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.08, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0.10)');
      gctx.strokeStyle = g;
      gctx.beginPath();
      gctx.moveTo(x0, y0 + .5); gctx.lineTo(x1, y0 + .5);
      for (let x = x0; x <= x1; x += div / 5) { gctx.moveTo(x + .5, y0 - 3); gctx.lineTo(x + .5, y0 + 4); }
      gctx.stroke();
    }

    const placeToFreq = (u) => 7500 * Math.pow(10, -0.667 * u * 3.5);

    function updateHud() {
      const f = placeToFreq(peak);
      const txt = f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : Math.round(f) + ' Hz';
      if (txt === lastHud) return;
      lastHud = txt;
      hudF.textContent = txt;
      hudS.textContent = '§' + Math.round(peak * 511);
    }

    function frame(now) {
      const t = (now - t0) / 1000;
      if (now - lastPointer > 2500) target = 0.6 + 0.24 * Math.sin(t * 0.16);
      // scrolling away damps the signal and drifts it toward the apex (lower f)
      const sf = clamp(window.scrollY / (H * 0.85), 0, 1);
      peak += (Math.min(0.92, target + sf * 0.14) - peak) * 0.05;
      amp += (ampTarget - amp) * 0.05;
      energy *= 0.94;
      const power = reduceMotion ? 1 : easeOut(clamp((t - POWER_ON) / 1.6, 0, 1));

      const { x0, x1, y0, cycles, mobile } = lane;
      const span = x1 - x0;
      const A = lane.A * amp * power * (1 + energy) * (1 - 0.6 * sf);
      const step = W > 900 ? 2 : 3;
      const p = peak;
      const omega = t * 2.0;
      const edge = (u) => Math.min(1, u / 0.06); // soft fade-in at the lane's left edge

      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = reduceMotion ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0.2)';
      tctx.fillRect(0, 0, W, H);
      tctx.globalCompositeOperation = 'source-over';

      const env = (u) => (u <= p ? Math.pow(u / p, 3.2) : Math.exp(-Math.pow((u - p) / 0.022, 2)));
      const phase = (u) => 2 * Math.PI * cycles * Math.pow(u / p, 2.1);

      if (!mobile) {
        tctx.setLineDash([2, 6]);
        tctx.strokeStyle = 'rgba(110,231,242,0.2)';
        tctx.lineWidth = 1;
        for (const sgn of [1, -1]) {
          tctx.beginPath();
          for (let x = x0; x <= x1; x += step * 2) {
            const u = (x - x0) / span;
            const y = y0 - sgn * A * env(u) * edge(u);
            x === x0 ? tctx.moveTo(x, y) : tctx.lineTo(x, y);
          }
          tctx.stroke();
        }
        tctx.setLineDash([]);

        // broad undifferentiated pressure wave, very dim
        tctx.strokeStyle = 'rgba(232,235,238,0.09)';
        tctx.beginPath();
        for (let x = x0; x <= x1; x += step) {
          const u = (x - x0) / span;
          const e = u <= p ? 1 - 0.35 * (u / p) : Math.exp(-Math.pow((u - p) / 0.05, 2)) * 0.65;
          const y = y0 - A * 0.55 * e * edge(u) * Math.sin(omega - phase(u) * 0.55);
          x === x0 ? tctx.moveTo(x, y) : tctx.lineTo(x, y);
        }
        tctx.stroke();
      }

      const path = new Path2D();
      for (let x = x0; x <= x1; x += step) {
        const u = (x - x0) / span;
        const y = y0 - A * env(u) * edge(u) * Math.sin(omega - phase(u));
        x === x0 ? path.moveTo(x, y) : path.lineTo(x, y);
      }
      tctx.lineJoin = 'round';
      tctx.strokeStyle = 'rgba(110,231,242,0.16)'; tctx.lineWidth = mobile ? 4 : 6; tctx.stroke(path);
      tctx.strokeStyle = 'rgba(160,243,248,0.92)'; tctx.lineWidth = 1.3; tctx.stroke(path);

      if (!mobile && power > 0.05) {
        const px = x0 + p * span;
        tctx.strokeStyle = `rgba(110,231,242,${0.3 * power})`;
        tctx.setLineDash([1, 4]);
        tctx.beginPath(); tctx.moveTo(px, y0 - lane.A * 1.3); tctx.lineTo(px, y0 + lane.A * 1.3); tctx.stroke();
        tctx.setLineDash([]);
      }

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(grid, 0, 0, W, H);
      ctx.drawImage(trail, 0, 0, W, H);

      updateHud();
      if (running) raf = requestAnimationFrame(frame);
    }

    function start() { if (running || reduceMotion || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (x < lane.x0 - 40 && !lane.mobile) return; // only steer from the wave's lane
      target = clamp((x - lane.x0) / (lane.x1 - lane.x0), 0.14, 0.92);
      if (lastX !== null) energy = Math.min(0.35, energy + Math.abs(x - lastX) * 0.0025);
      lastX = x;
      ampTarget = 0.8 + 0.35 * (1 - clamp((e.clientY - r.top) / r.height, 0, 1));
      lastPointer = performance.now();
      if (reduceMotion) { peak = target; amp = ampTarget; frame(performance.now()); }
    }, { passive: true });

    new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); }).observe(hero);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
    // the name animates in from a mask; re-measure once fonts and layout settle
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { resize(); });
    resize();
    start();
  }

  /* ── Scroll: nav state, progress bar, hero parallax ─────────────────── */
  function initScroll() {
    const nav = $('#nav');
    const bar = $('.progress span');
    const heroInner = $('#hero-inner');
    const cue = $('.scroll-cue');
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      nav.classList.toggle('is-scrolled', y > 24);
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (cue) cue.style.visibility = y > 80 ? 'hidden' : '';
      if (!reduceMotion && heroInner && window.innerWidth > 860 && y < window.innerHeight * 1.2) {
        heroInner.style.transform = `translate3d(0, ${y * 0.18}px, 0)`;
        heroInner.style.opacity = String(Math.max(0, 1 - y / (window.innerHeight * 0.8)));
      }
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ── Active section indicator ───────────────────────────────────────── */
  function initActiveNav() {
    const links = $$('[data-nav]');
    const indicator = $('.nav-indicator');
    const byId = Object.fromEntries(links.map((a) => [a.hash.slice(1), a]));
    const move = (a) => {
      links.forEach((l) => l.classList.toggle('is-active', l === a));
      if (!a) { indicator.style.opacity = '0'; return; }
      indicator.style.opacity = '1';
      indicator.style.width = a.offsetWidth - 28 + 'px';
      indicator.style.transform = `translateX(${a.offsetLeft + 14}px)`;
    };
    const sections = ['top', ...Object.keys(byId)].map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) move(byId[en.target.id] || null); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
    window.addEventListener('resize', () => move($('.nav-links a.is-active')));
  }

  /* ── Mobile menu ────────────────────────────────────────────────────── */
  function initMobileMenu() {
    const btn = $('#nav-toggle');
    const menu = $('#mobile-menu');
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.hidden = !open;
      document.documentElement.style.overflow = open ? 'hidden' : '';
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
    window.matchMedia('(min-width: 861px)').addEventListener('change', (m) => { if (m.matches) set(false); });
  }

  /* ── Scroll reveals with sibling stagger ────────────────────────────── */
  function initReveals() {
    const els = $$('[data-reveal]');
    const counts = new Map();
    els.forEach((el) => {
      const parent = el.parentElement;
      const n = counts.get(parent) || 0;
      counts.set(parent, n + 1);
      // bento cards sit two per row, so stagger within the row only
      el.style.setProperty('--i', parent.classList.contains('bento') ? n % 2 : Math.min(n, 4));
    });
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ── Toolkit ⇄ projects: tools light their projects, projects light their stack ── */
  function initSkills() {
    const modules = $('.modules');
    const trace = $('#trace');
    const out = $('#trace-out');
    const bento = $('.bento');
    if (!modules || !trace || !out) return;
    const chips = $$('.chip', modules);
    const traceLinks = $$('[data-project]', trace);
    const cards = Object.fromEntries($$('.project', bento).map((c) => [c.id.replace('p-', ''), c]));
    const idle = out.textContent;
    const usedBy = new Map(chips.map((c) => [c, c.dataset.used.split(' ').filter(Boolean)]));
    let pinned = null;

    const clear = () => {
      chips.forEach((c) => c.classList.remove('is-on'));
      traceLinks.forEach((a) => a.classList.remove('is-lit'));
      Object.values(cards).forEach((c) => c.classList.remove('is-lit'));
      [modules, trace, bento].forEach((el) => el.classList.remove('has-active'));
      out.textContent = idle;
    };

    const showTool = (chip) => {
      clear();
      if (!chip) return;
      const ids = usedBy.get(chip);
      chip.classList.add('is-on');
      modules.classList.add('has-active');
      trace.classList.add('has-active');
      traceLinks.forEach((a) => a.classList.toggle('is-lit', ids.includes(a.dataset.project)));
      if (pinned === chip) {
        bento.classList.add('has-active');
        ids.forEach((id) => cards[id] && cards[id].classList.add('is-lit'));
      }
      const label = ids.length ? `<b>${ids.length}</b> project${ids.length > 1 ? 's' : ''}` : 'core skill · not yet in a featured project';
      out.innerHTML = `${chip.textContent.trim()} · ${label}${pinned === chip ? " · pinned" : ""}`;
    };

    const showProject = (id) => {
      clear();
      const stack = chips.filter((c) => usedBy.get(c).includes(id));
      stack.forEach((c) => c.classList.add('is-on'));
      modules.classList.add('has-active');
      trace.classList.add('has-active');
      traceLinks.forEach((a) => a.classList.toggle('is-lit', a.dataset.project === id));
      out.innerHTML = `<b>${stack.length}</b> tools in stack`;
    };

    const restore = () => (pinned ? showTool(pinned) : clear());

    chips.forEach((chip) => {
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('pointerenter', () => showTool(chip));
      chip.addEventListener('focus', () => showTool(chip));
      chip.addEventListener('click', () => {
        pinned = pinned === chip ? null : chip;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === pinned)));
        pinned ? showTool(pinned) : showTool(chip);
      });
    });
    traceLinks.forEach((a) => {
      a.addEventListener('pointerenter', () => showProject(a.dataset.project));
      a.addEventListener('focus', () => showProject(a.dataset.project));
    });
    modules.addEventListener('pointerleave', restore);
    trace.addEventListener('pointerleave', restore);
    [modules, trace].forEach((el) => el.addEventListener('focusout', (e) => {
      if (!modules.contains(e.relatedTarget) && !trace.contains(e.relatedTarget)) restore();
    }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && pinned) { pinned.setAttribute('aria-pressed', 'false'); pinned = null; clear(); }
    });
  }

  /* ── Copy email ─────────────────────────────────────────────────────── */
  function initCopy() {
    const btn = $('#copy-email');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.email);
        btn.textContent = 'Copied';
        btn.classList.add('is-copied');
      } catch {
        btn.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1800);
    });
  }

  /* ── Footer: a single wave packet travels the line, then settles ────── */
  function initFooterWave() {
    const path = $('#footer-path');
    const footer = $('.footer');
    if (!path || !footer || reduceMotion) return;
    let playing = false;
    const play = () => {
      if (playing) return;
      playing = true;
      const start = performance.now();
      const dur = 2800;
      const tick = (now) => {
        const k = Math.min(1, (now - start) / dur);
        const c = -150 + easeOut(k) * 1500;
        const fade = 1 - Math.pow(k, 3);
        let d = 'M0 30';
        for (let x = 0; x <= 1200; x += 6) {
          const g = Math.exp(-Math.pow((x - c) / 110, 2));
          d += ` L${x} ${(30 - 16 * fade * g * Math.sin((x - c) / 14)).toFixed(2)}`;
        }
        path.setAttribute('d', d);
        if (k < 1) requestAnimationFrame(tick); else { path.setAttribute('d', 'M0 30 H1200'); playing = false; }
      };
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([en]) => { if (en.isIntersecting) play(); }, { threshold: 0.6 }).observe(footer);
    footer.addEventListener('pointerenter', play);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
    initScope();
    initScroll();
    initActiveNav();
    initMobileMenu();
    initReveals();
    initSkills();
    initCopy();
    initFooterWave();
  });
})();
