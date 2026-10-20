/* Small additions to the template's scripts (plain JS, no build step; loaded after main.min.js).
   - in-page scrolling honours prefers-reduced-motion,
   - theme toggle: exposes its state (aria-pressed) and keeps the browser's theme-color in sync,
   - masthead menu: keeps aria-expanded in sync; closes the menu after a link is chosen, on Escape,
     on an outside tap, or when keyboard focus leaves it; re-runs the greedy-nav layout once more
     because its first pass ignores the width of the menu button; on phones puts every section
     link in the menu,
   - un-pins the sticky profile when it does not fit in the window,
   - marks the masthead link of the homepage section in view (class "is-active"),
   - the profile's email link copies the address and says so, instead of opening a mail app. */
(function () {
  if (window.jQuery && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.jQuery.fx.off = true;
  }
})();

(function () {
  var toggle = document.getElementById('theme-toggle');
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  function syncTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (toggle) { toggle.setAttribute('aria-pressed', dark ? 'true' : 'false'); }
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute('content', dark ? '#121212' : '#ffffff');
    }
  }
  syncTheme();
  if (window.MutationObserver) {
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
})();

(function () {
  var nav = document.getElementById('site-nav');
  if (!nav) { return; }
  var button = nav.querySelector('button');
  var menu = nav.querySelector('.hidden-links');
  if (!button || !menu) { return; }

  function isOpen() {
    return !menu.classList.contains('hidden');
  }

  function sync() {
    button.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
  }

  function close() {
    if (!isOpen()) { return; }
    menu.classList.add('hidden');
    button.classList.remove('close');
    sync();
  }

  if (window.MutationObserver) {
    new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] });
  }

  nav.addEventListener('click', function (event) {
    var target = event.target;
    if (target.closest && target.closest('a')) {
      close();
    } else {
      sync();
    }
  });

  document.addEventListener('click', function (event) {
    if (isOpen() && !nav.contains(event.target)) { close(); }
  });

  document.addEventListener('keydown', function (event) {
    if ((event.key === 'Escape' || event.key === 'Esc') && isOpen()) {
      close();
      button.focus();
    }
  });

  nav.addEventListener('focusout', function (event) {
    if (isOpen() && event.relatedTarget && !nav.contains(event.relatedTarget)) { close(); }
  });

  /* On a phone every section link goes in the menu; the greedy layout would leave one link
     squeezed next to the button. window.breaks is the greedy-nav plugin's list of the widths at
     which it moved links, which it uses to bring them back on a wider screen. */
  var visible = nav.querySelector('.visible-links');
  var phone = window.matchMedia ? window.matchMedia('(max-width: 599px)') : null;
  function tuck() {
    if (!phone || !phone.matches || !visible || !Array.isArray(window.breaks)) { return; }
    var items = visible.querySelectorAll('li:not(.persist)');
    for (var i = items.length - 1; i >= 0; i--) {
      window.breaks.push(window.jQuery ? window.jQuery(visible).width() : visible.offsetWidth);
      menu.insertBefore(items[i], menu.firstChild);
    }
    if (items.length) {
      button.classList.remove('hidden');
      button.setAttribute('count', window.breaks.length);
    }
  }

  if (typeof window.updateNav === 'function') {
    window.updateNav();
    tuck();
    window.addEventListener('resize', function () { window.updateNav(); tuck(); });
  }
})();

(function () {
  var profile = document.querySelector('.profile');
  if (!profile) { return; }
  function fit() {
    profile.classList.toggle('profile--unpinned', profile.offsetHeight + 120 > window.innerHeight);
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
})();

/* Section in view: while the homepage scrolls, the masthead link whose #id belongs to the
   section at the top of the window gets class "is-active" and aria-current="true".
   Links are found by their #hash, so it keeps working when the menu script moves a link
   into the drop-down. A section counts as "in view" once its top passes a line 30% down the
   window (at most 180px, so a tall window doesn't mark Experience while About is still on top);
   nothing is marked before the visitor scrolls.
   Over the last quarter-screen of scrolling that line moves down to the bottom of the window,
   so a short last section (Service) is marked once it is on screen at the end of the page. */
(function () {
  var nav = document.getElementById('site-nav');
  if (!nav || !window.requestAnimationFrame || !document.documentElement.classList) { return; }
  function page(path) { return path.replace(/index\.html?$/, '').replace(/\/+$/, ''); }
  var here = page(location.pathname);
  var anchors = nav.getElementsByTagName('a');
  var spots = [];
  var i;
  for (i = 0; i < anchors.length; i++) {
    var link = anchors[i];
    if (!link.hash || link.hash.length < 2 || page(link.pathname) !== here) { continue; }
    var target = null;
    try { target = document.getElementById(decodeURIComponent(link.hash.slice(1))); } catch (e) { target = null; }
    if (!target) { continue; }
    spots.push({ link: link, section: (target.closest && target.closest('section')) || target });
  }
  if (!spots.length) { return; }

  var active = null;
  var queued = false;

  function setActive(spot) {
    if (spot === active) { return; }
    if (active) {
      active.link.classList.remove('is-active');
      active.link.removeAttribute('aria-current');
    }
    active = spot;
    if (spot) {
      spot.link.classList.add('is-active');
      spot.link.setAttribute('aria-current', 'true');
    }
  }

  function update() {
    queued = false;
    var doc = document.documentElement;
    var view = window.innerHeight;
    var scrolled = window.pageYOffset || doc.scrollTop || 0;
    var remaining = Math.max(0, doc.scrollHeight - (scrolled + view));
    var line = Math.min(view * 0.3, 180);
    if (scrolled > 0 && remaining < view * 0.25) {
      line += (view - line) * (1 - remaining / (view * 0.25));
    }
    var atEnd = scrolled > 0 && remaining <= 2;
    var current = null;
    var currentTop = -Infinity;
    var last = null;
    var lastTop = -Infinity;
    for (var j = 0; j < spots.length; j++) {
      var top = spots[j].section.getBoundingClientRect().top;
      if (top > lastTop) { last = spots[j]; lastTop = top; }
      if (top <= line && top > currentTop) { current = spots[j]; currentTop = top; }
    }
    setActive(scrolled <= 0 ? null : (atEnd ? last : current));
  }

  function queue() {
    if (!queued) {
      queued = true;
      window.requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', queue);
  window.addEventListener('resize', queue);
  window.addEventListener('load', queue);
  update();
})();

/* Email: a click (or Enter) on the profile's email link copies the address and shows
   "Email address copied", instead of opening a mail app. With a modifier key held, or when
   copying fails, it opens the mail app as before; without JavaScript it is a plain mailto: link. */
(function () {
  var links = document.querySelectorAll('.profile__links a[href^="mailto:"]');
  if (!links.length || !window.Promise) { return; }

  var toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  var timer = null;

  function show(address) {
    toast.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>' +
      '<div><strong>Email address copied</strong><span></span></div>';
    toast.querySelector('span').textContent = address;
    toast.classList.remove('is-visible');
    void toast.offsetWidth; /* restart the fade-in on a second click */
    toast.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2600);
  }

  /* the older way, for browsers without the async clipboard API (or when it refuses) */
  function copyBySelection(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!copyBySelection(text)) { throw new Error('copy failed'); }
      });
    }
    return copyBySelection(text) ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  Array.prototype.forEach.call(links, function (link) {
    var address = decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]);
    var hint = link.querySelector('.screen-reader-text');
    if (hint) { hint.textContent = ' (copies the address)'; }
    link.removeAttribute('target');
    link.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) { return; }
      event.preventDefault();
      copy(address).then(function () { show(address); }, function () { window.location.href = link.href; });
    });
  });
})();
