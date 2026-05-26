// MIT License — DARE Method © 2026 Dewtech Technologies
'use strict';

/* ============================================================
   NAV SCROLL BEHAVIOUR
   ============================================================ */
(function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile toggle
  const toggle = document.querySelector('.nav-toggle');
  const links  = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', links.classList.contains('open'));
    });

    // Close on link click
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => links.classList.remove('open'));
    });
  }
})();

/* ============================================================
   WAITLIST FORM
   ============================================================ */
(function initWaitlist() {
  const form    = document.querySelector('.waitlist-form');
  const msgEl   = document.querySelector('.waitlist-message');
  const countEl = document.querySelector('.waitlist-count');
  if (!form) return;

  let count = 248; // seed count

  const showMsg = (text, type) => {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className   = `waitlist-message ${type}`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = form.querySelector('input[type="email"]');
    const btn        = form.querySelector('button');
    const email      = emailInput ? emailInput.value.trim() : '';

    if (!email) {
      showMsg('Please enter a valid email address.', 'error');
      return;
    }

    if (btn) {
      btn.disabled     = true;
      btn.textContent  = 'Joining…';
    }

    try {
      // POST to API endpoint (will 404 until backend exists — handle gracefully)
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok || res.status === 404) {
        // treat 404 (no backend yet) as optimistic success in demo
        count++;
        showMsg('You\'re in! We\'ll reach out when DARE CLI v3.0 ships.', 'success');
        if (emailInput) emailInput.value = '';
        if (countEl) countEl.textContent = `${count} developers already joined`;
      } else {
        const body = await res.json().catch(() => ({}));
        showMsg(body.message || 'Something went wrong. Try again.', 'error');
      }
    } catch (_) {
      // Network offline / CORS in static demo — optimistic
      count++;
      showMsg('You\'re in! We\'ll reach out when DARE CLI v3.0 ships.', 'success');
      if (emailInput) emailInput.value = '';
      if (countEl) countEl.textContent = `${count} developers already joined`;
    } finally {
      if (btn) {
        btn.disabled    = false;
        btn.textContent = 'Join Waitlist';
      }
    }
  });
})();

/* ============================================================
   SMOOTH SCROLL for anchor links
   ============================================================ */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ============================================================
   TERMINAL TYPEWRITER (optional progressive enhancement)
   ============================================================ */
(function initTypewriter() {
  const lines = document.querySelectorAll('.t-line[data-typewrite]');
  if (!lines.length) return;

  let delay = 400;
  lines.forEach(line => {
    const cmd = line.querySelector('.t-cmd');
    if (!cmd) return;
    const fullText = cmd.textContent;
    cmd.textContent = '';
    line.style.opacity = '0';

    setTimeout(() => {
      line.style.transition = 'opacity 0.2s';
      line.style.opacity = '1';
      let i = 0;
      const tick = setInterval(() => {
        cmd.textContent = fullText.slice(0, ++i);
        if (i >= fullText.length) clearInterval(tick);
      }, 32);
    }, delay);

    delay += fullText.length * 32 + 600;
  });
})();
