// Boot, routing and the iOS/iPadOS touch housekeeping.

import { qs } from './util.js';
import { commit } from './store.js';
import { primeAudio } from './ui/sound.js';
import { createHomeScreen } from './screens/home.js';
import { createAvatarScreen } from './screens/avatar.js';
import { createHouseScreen } from './screens/house.js';
import { createPlayScreen } from './screens/play.js';

const root = qs('#app');
const app = { root, go };

const screens = {
  home: createHomeScreen(app),
  avatar: createAvatarScreen(app),
  house: createHouseScreen(app),
  play: createPlayScreen(app),
};

let current = null;

function go(name, { push = true } = {}) {
  const next = screens[name] || screens.home;
  if (current === next) { next.enter(); return; }
  if (current) {
    current.leave();
    current.el.classList.remove('screen--active', 'screen--in');
  }
  current = next;
  next.el.classList.add('screen--active', 'screen--in');
  next.enter();
  if (push) {
    try { history.pushState({ screen: name }, '', name === 'home' ? '#' : `#${name}`); } catch { /* file:// */ }
  }
}

for (const screen of Object.values(screens)) root.append(screen.el);

window.addEventListener('popstate', (event) => {
  const name = event.state?.screen || (location.hash || '#home').slice(1) || 'home';
  go(screens[name] ? name : 'home', { push: false });
});

/* --------------------------------------------------- iOS touch behaviour */

// Stop pinch-zooming the page itself; the app does its own pinching.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Kill the double-tap-to-zoom delay on iOS without blocking real taps.
let lastTouch = 0;
document.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTouch < 320) event.preventDefault();
  lastTouch = now;
}, { passive: false });

// Rubber-band scrolling would drag the whole app around.
document.addEventListener('touchmove', (event) => {
  if (!event.target.closest?.('.options, .tabs, .picker, .home, .roomtabs, .tray')) event.preventDefault();
}, { passive: false });

// Keep the layout honest when the URL bar or the keyboard changes the height.
const setHeight = () => {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
};
window.addEventListener('resize', setHeight);
window.addEventListener('orientationchange', () => setTimeout(setHeight, 120));
setHeight();

// Save before the app is backgrounded or closed.
window.addEventListener('pagehide', () => commit());
document.addEventListener('visibilitychange', () => { if (document.hidden) commit(); });

/* ------------------------------------------------------------------ boot */

primeAudio();

const start = (location.hash || '#home').slice(1);
go(screens[start] ? start : 'home', { push: false });

requestAnimationFrame(() => {
  const boot = qs('#boot');
  if (boot) {
    boot.classList.add('boot--gone');
    setTimeout(() => boot.remove(), 350);
  }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: './' })
      .catch((err) => console.warn('Offline mode unavailable:', err));
  });
}
