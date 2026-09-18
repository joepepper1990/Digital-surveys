// The room shell: wall papers, floors and the scene coordinate system.
// Every room is drawn side-on in a fixed 1000 x 640 user space; the screen
// just scales that box to fit, which keeps layouts identical on phone and
// tablet, portrait or landscape.

import { shade } from '../util.js';

export const ROOM = { w: 1000, h: 640, floorY: 430 };

/** Characters are drawn this tall inside a room (avatar art is 340 tall). */
export const CHAR_H = 300;
export const CHAR_SCALE = CHAR_H / 340;

// Pattern ids must be unique across the whole document: several rooms can be
// on the page at once (thumbnails, the editor, play) and a repeated id would
// make one of them paint with another's — or with nothing at all.
let seq = 0;
const hash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${Math.abs(h).toString(36)}${(seq++).toString(36)}`;
};

const pattern = (id, size, body) =>
  `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${body}</pattern>`;

export const WALL_PATTERNS = {
  plain: { label: 'Plain', fill: (c) => ({ defs: '', fill: c }) },
  stripes: {
    label: 'Stripes',
    fill: (c) => {
      const id = `ws${hash(c)}`;
      return { defs: pattern(id, 80, `<rect width="80" height="80" fill="${c}"/><rect width="40" height="80" fill="${shade(c, -.07)}"/>`), fill: `url(#${id})` };
    },
  },
  dots: {
    label: 'Dots',
    fill: (c) => {
      const id = `wd${hash(c)}`;
      return { defs: pattern(id, 70, `<rect width="70" height="70" fill="${c}"/><circle cx="18" cy="18" r="7" fill="${shade(c, -.12)}"/><circle cx="53" cy="53" r="7" fill="${shade(c, -.12)}"/>`), fill: `url(#${id})` };
    },
  },
  hearts: {
    label: 'Hearts',
    fill: (c) => {
      const id = `wh${hash(c)}`;
      const h = `<path d="M35 44 C18 32 14 24 20 18 c5 -5 11 -2 15 4 c4 -6 10 -9 15 -4 c6 6 2 14 -15 26 Z" fill="${shade(c, -.14)}"/>`;
      return { defs: pattern(id, 90, `<rect width="90" height="90" fill="${c}"/>${h}`), fill: `url(#${id})` };
    },
  },
  stars: {
    label: 'Stars',
    fill: (c) => {
      const id = `wt${hash(c)}`;
      const star = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12 l3.6 7.8 8.4 1 -6.3 5.8 1.8 8.4 -7.5 -4.3 -7.5 4.3 1.8 -8.4 -6.3 -5.8 8.4 -1 Z" fill="${shade(c, -.16)}"/>`;
      return { defs: pattern(id, 110, `<rect width="110" height="110" fill="${c}"/>${star(30, 34, 1)}${star(82, 80, .7)}`), fill: `url(#${id})` };
    },
  },
  panel: {
    label: 'Panels',
    fill: (c) => {
      const id = `wp${hash(c)}`;
      return { defs: pattern(id, 120, `<rect width="120" height="120" fill="${c}"/><rect x="10" y="10" width="100" height="100" rx="10" fill="none" stroke="${shade(c, -.1)}" stroke-width="6"/>`), fill: `url(#${id})` };
    },
  },
  brick: {
    label: 'Bricks',
    fill: (c) => {
      const id = `wb${hash(c)}`;
      const body = `<rect width="120" height="120" fill="${c}"/>
        <g fill="${shade(c, -.1)}"><rect x="2" y="2" width="56" height="26" rx="6"/><rect x="62" y="2" width="56" height="26" rx="6"/>
        <rect x="-26" y="32" width="56" height="26" rx="6"/><rect x="34" y="32" width="56" height="26" rx="6"/><rect x="94" y="32" width="56" height="26" rx="6"/>
        <rect x="2" y="62" width="56" height="26" rx="6"/><rect x="62" y="62" width="56" height="26" rx="6"/>
        <rect x="-26" y="92" width="56" height="26" rx="6"/><rect x="34" y="92" width="56" height="26" rx="6"/><rect x="94" y="92" width="56" height="26" rx="6"/></g>`;
      return { defs: pattern(id, 120, body), fill: `url(#${id})` };
    },
  },
};

export const FLOOR_PATTERNS = {
  plain: { label: 'Plain', fill: (c) => ({ defs: '', fill: c }) },
  planks: {
    label: 'Planks',
    fill: (c) => {
      const id = `fp${hash(c)}`;
      return { defs: pattern(id, 60, `<rect width="60" height="60" fill="${c}"/><rect y="0" width="60" height="4" fill="${shade(c, -.18)}"/><rect x="0" y="30" width="60" height="4" fill="${shade(c, -.1)}"/>`), fill: `url(#${id})` };
    },
  },
  tiles: {
    label: 'Tiles',
    fill: (c) => {
      const id = `ft${hash(c)}`;
      return { defs: pattern(id, 80, `<rect width="80" height="80" fill="${c}"/><rect width="40" height="40" fill="${shade(c, .28)}"/><rect x="40" y="40" width="40" height="40" fill="${shade(c, .28)}"/>`), fill: `url(#${id})` };
    },
  },
  dots: {
    label: 'Spots',
    fill: (c) => {
      const id = `fd${hash(c)}`;
      return { defs: pattern(id, 64, `<rect width="64" height="64" fill="${c}"/><circle cx="32" cy="32" r="9" fill="${shade(c, .3)}"/>`), fill: `url(#${id})` };
    },
  },
  grass: {
    label: 'Grass',
    fill: (c) => {
      const id = `fg${hash(c)}`;
      const blade = (x, y) => `<path d="M${x} ${y} q4 -12 8 0" stroke="${shade(c, -.2)}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      return { defs: pattern(id, 70, `<rect width="70" height="70" fill="${c}"/>${blade(10, 30)}${blade(44, 58)}`), fill: `url(#${id})` };
    },
  },
};

export const ROOM_PRESETS = [
  { name: 'Living room', wall: '#ffe9c9', wallPattern: 'stripes', floor: '#c98f5e', floorPattern: 'planks' },
  { name: 'Bedroom', wall: '#ffd9e2', wallPattern: 'hearts', floor: '#e0b183', floorPattern: 'planks' },
  { name: 'Kitchen', wall: '#d7ecff', wallPattern: 'panel', floor: '#e6dcc8', floorPattern: 'tiles' },
  { name: 'Bathroom', wall: '#cfe9e6', wallPattern: 'dots', floor: '#e3e8f0', floorPattern: 'tiles' },
  { name: 'Garden', wall: '#d7ecff', wallPattern: 'plain', floor: '#bcd9c6', floorPattern: 'grass' },
  { name: 'Play room', wall: '#ece0ff', wallPattern: 'stars', floor: '#d7c6e8', floorPattern: 'dots' },
];

/** Background markup (defs + wall + floor) for one room. */
export function roomShell(style) {
  const wall = (WALL_PATTERNS[style.wallPattern] || WALL_PATTERNS.plain).fill(style.wall);
  const floor = (FLOOR_PATTERNS[style.floorPattern] || FLOOR_PATTERNS.plain).fill(style.floor);
  const { w, h, floorY } = ROOM;
  return `
    <defs>${wall.defs}${floor.defs}</defs>
    <rect x="0" y="0" width="${w}" height="${floorY}" fill="${wall.fill}"/>
    <rect x="0" y="${floorY}" width="${w}" height="${h - floorY}" fill="${floor.fill}"/>
    <rect x="0" y="${floorY - 14}" width="${w}" height="16" fill="${shade(style.floor, -.28)}" opacity=".45"/>
    <rect x="0" y="${floorY}" width="${w}" height="30" fill="#000" opacity=".05"/>`;
}

/** A tiny swatch of a wall/floor combination, used by the style tray. */
export function styleThumb(kind, patternId, color) {
  const set = kind === 'wall' ? WALL_PATTERNS : FLOOR_PATTERNS;
  const p = (set[patternId] || set.plain).fill(color);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs>${p.defs}</defs>
    <rect width="100" height="100" rx="12" fill="${p.fill}"/></svg>`;
}
