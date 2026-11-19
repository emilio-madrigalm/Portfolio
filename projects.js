/* ==========================================================================
   Selected Work — card interactions + full-screen project view.
   Project pages are deep-linkable: #work/<id> (e.g. #work/esp32).
   Content lives in <template id="case-<id>"> blocks in index.html.
   ========================================================================== */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ROUTE = /^#work\/([a-z0-9-]+)$/;

  function initCards() {
    $$('.bento .project').forEach((card) => {
      const media = $('.project-media', card);
      const body = $('.project-body', card);

      // cursor spotlight on the body + a few pixels of image drift
      card.addEventListener('pointermove', (e) => {
        const b = body.getBoundingClientRect();
        card.style.setProperty('--mx', e.clientX - b.left + 'px');
        card.style.setProperty('--my', e.clientY - b.top + 'px');
        if (reduceMotion || !media) return;
        const m = media.getBoundingClientRect();
        const dx = ((e.clientX - m.left) / m.width - 0.5) * -8;
        const dy = ((e.clientY - m.top) / m.height - 0.5) * -6;
        card.style.setProperty('--px', dx.toFixed(1) + 'px');
        card.style.setProperty('--py', dy.toFixed(1) + 'px');
      }, { passive: true });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--px', '0px');
        card.style.setProperty('--py', '0px');
      });

      // ESP32: play the real demo clip on hover (loaded on first hover only)
      const video = $('.hover-video', card);
      if (video && canHover && !reduceMotion) {
        card.addEventListener('pointerenter', () => {
          if (!video.src) video.src = video.dataset.src;
          video.play().then(() => media.classList.add('is-playing')).catch(() => {});
        });
        card.addEventListener('pointerleave', () => {
          video.pause();
          media.classList.remove('is-playing');
        });
      }
    });
  }

  function initProjectView() {
    const dialog = $('#pv');
    const content = $('#pv-content');
    const scroller = $('#pv-scroll');
    const pos = $('#pv-pos');
    const bar = $('#pv-progress');
    const nextCard = $('#pv-next-card');
    const nextTitle = $('#pv-next-title');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const order = $$('.bento .project').map((c) => c.id.replace('p-', ''));
    const titleOf = (id) => $(`#p-${id} .project-title`).textContent.trim();
    let current = null;
    let pushed = false;

    function hydrate() {
      // reuse diagrams that already exist on the page (e.g. the CPU datapath)
      $$('[data-clone]', content).forEach((slot) => {
        const src = $(slot.dataset.clone);
        if (src) slot.append(src.cloneNode(true));
      });
      // videos load only when the project opens
      $$('video[data-src]', content).forEach((v) => { v.src = v.dataset.src; });
      // every still opens full-size in a new tab
      $$('.pv-hero img, .pv-gallery img, .pv-triptych img, .pv-phones img', content).forEach((img) => {
        const a = document.createElement('a');
        a.href = img.getAttribute('src');
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', `Open full-size image: ${img.alt}`);
        img.replaceWith(a);
        a.append(img);
      });
    }

    function render(id) {
      const tpl = document.getElementById(`case-${id}`);
      if (!tpl) return false;
      const i = order.indexOf(id);
      const next = order[(i + 1) % order.length];
      content.replaceChildren(tpl.content.cloneNode(true));
      hydrate();
      pos.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> / ${String(order.length).padStart(2, '0')} · ${titleOf(id)}`;
      nextTitle.textContent = titleOf(next);
      nextCard.href = `#work/${next}`;
      nextCard.dataset.id = next;
      scroller.scrollTop = 0;
      bar.style.transform = 'scaleX(0)';
      document.title = `${titleOf(id)} — Emilio Madrigal Mendoza`;
      current = id;
      return true;
    }

    function open(id, { push = true } = {}) {
      if (!render(id)) return;
      if (!dialog.open) {
        dialog.showModal();
        document.documentElement.style.overflow = 'hidden';
      }
      if (push) {
        history.pushState({ pv: id }, '', `#work/${id}`);
        pushed = true;
      }
      const h = $('#pv-title', content); if (h) h.focus({ preventScroll: true });
    }

    function close({ fromHistory = false } = {}) {
      if (!dialog.open) return;
      const last = current;
      $$('video', content).forEach((v) => v.pause());
      dialog.close();
      document.documentElement.style.overflow = '';
      document.title = 'Emilio Madrigal Mendoza — Electrical & Computer Engineering';
      current = null;
      if (!fromHistory) {
        if (pushed) { pushed = false; history.back(); }
        else history.replaceState(null, '', '#projects');
      }
      const hit = last && $(`#p-${last} .project-hit`);
      if (hit) { hit.scrollIntoView({ block: 'center', behavior: 'instant' }); hit.focus({ preventScroll: true }); }
    }

    const step = (d) => {
      const i = order.indexOf(current);
      const id = order[(i + d + order.length) % order.length];
      render(id);
      history.replaceState({ pv: id }, '', `#work/${id}`);
    };

    // open from cards
    $$('.project-hit').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      open(a.dataset.open);
    }));
    // whole-card click (anywhere not on a secondary link)
    $$('.bento .project').forEach((card) => card.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      open(card.id.replace('p-', ''));
    }));

    $$('[data-pv-close]', dialog).forEach((b) => b.addEventListener('click', () => close()));
    $('#pv-prev').addEventListener('click', () => step(-1));
    $('#pv-next').addEventListener('click', () => step(1));
    nextCard.addEventListener('click', (e) => { e.preventDefault(); step(1); });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dialog.addEventListener('keydown', (e) => {
      if (e.target.closest('video, input, textarea')) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });

    scroller.addEventListener('scroll', () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? scroller.scrollTop / max : 0})`;
    }, { passive: true });

    window.addEventListener('popstate', () => {
      const m = location.hash.match(ROUTE);
      if (m) { open(m[1], { push: false }); pushed = false; }
      else close({ fromHistory: true });
    });

    // deep link on load (e.g. a recruiter opening …/#work/cochlear)
    const m = location.hash.match(ROUTE);
    if (m) open(m[1], { push: false });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initCards();
    initProjectView();
  });
})();
