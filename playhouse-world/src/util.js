// Small DOM/maths helpers shared by every screen.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const clone = (value) => JSON.parse(JSON.stringify(value));

/** Create an element: el('button', {class:'btn', onclick: fn}, ['Go']). */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

export const qs = (sel, root = document) => root.querySelector(sel);

/** Escape text destined for an SVG/HTML string. */
export function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A short vibration where supported — iOS Safari ignores it, which is fine. */
export function tick() {
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch { /* ignore */ } }
}

/** Convert a client point to the user-space coords of an <svg>. */
export function toSvgPoint(svg, clientX, clientY) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  return { x: clientX * inv.a + clientY * inv.c + inv.e, y: clientX * inv.b + clientY * inv.d + inv.f };
}

/** Shade a hex colour: amount > 0 lightens, < 0 darkens. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => clamp(Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount)), 0, 255);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Drag helper built on Pointer Events so mouse, pen and touch behave the same.
 * Returns a teardown function.
 */
export function onDrag(target, { onStart, onMove, onEnd, filter } = {}) {
  const active = new Map();

  function down(event) {
    if (filter && !filter(event)) return;
    target.setPointerCapture?.(event.pointerId);
    active.set(event.pointerId, event);
    if (active.size === 1) onStart?.(event, active);
    event.preventDefault();
  }
  function move(event) {
    if (!active.has(event.pointerId)) return;
    active.set(event.pointerId, event);
    onMove?.(event, active);
    event.preventDefault();
  }
  function up(event) {
    if (!active.has(event.pointerId)) return;
    active.delete(event.pointerId);
    target.releasePointerCapture?.(event.pointerId);
    if (active.size === 0) onEnd?.(event, active);
  }

  target.addEventListener('pointerdown', down);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  return () => {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
}

/** Distance between the first two live pointers of an onDrag map. */
export function pinchSpan(pointers) {
  const [a, b] = Array.from(pointers.values());
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
