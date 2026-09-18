// Furniture catalogue. Each entry draws itself into a local box (0,0,w,h);
// the scene places it with a transform. Items can be tinted, sat on, or
// switched on and off in play mode.

import { shade } from '../util.js';
import { CLOTH, ACCENT, WALLS } from './palette.js';

export const CATS = [
  { id: 'living', label: 'Living', emoji: '🛋️' },
  { id: 'bed', label: 'Bedroom', emoji: '🛏️' },
  { id: 'kitchen', label: 'Kitchen', emoji: '🍳' },
  { id: 'bath', label: 'Bathroom', emoji: '🛁' },
  { id: 'fun', label: 'Fun', emoji: '🎈' },
  { id: 'garden', label: 'Garden', emoji: '🌳' },
  { id: 'walls', label: 'On the wall', emoji: '🖼️' },
];

const wood = '#c98f5e';
const metal = '#b9c3cf';

const ITEMS = [
  /* ------------------------------------------------------------- living */
  {
    id: 'sofa', name: 'Sofa', cat: 'living', w: 330, h: 190, tint: '#ff8fab',
    sit: { x: 165, y: 96 },
    draw: (c) => `<rect x="6" y="20" width="318" height="120" rx="30" fill="${shade(c, -.14)}"/>
      <rect x="40" y="86" width="250" height="78" rx="20" fill="${shade(c, .12)}"/>
      <rect x="0" y="76" width="56" height="94" rx="24" fill="${c}"/>
      <rect x="274" y="76" width="56" height="94" rx="24" fill="${c}"/>
      <rect x="48" y="60" width="116" height="46" rx="16" fill="${c}"/>
      <rect x="168" y="60" width="116" height="46" rx="16" fill="${c}"/>
      <rect x="30" y="164" width="22" height="24" rx="8" fill="${shade(wood, -.2)}"/>
      <rect x="278" y="164" width="22" height="24" rx="8" fill="${shade(wood, -.2)}"/>`,
  },
  {
    id: 'armchair', name: 'Armchair', cat: 'living', w: 170, h: 180, tint: '#7ad9b3',
    sit: { x: 85, y: 96 },
    draw: (c) => `<rect x="10" y="14" width="150" height="120" rx="28" fill="${shade(c, -.14)}"/>
      <rect x="28" y="86" width="114" height="72" rx="18" fill="${shade(c, .12)}"/>
      <rect x="0" y="74" width="44" height="86" rx="20" fill="${c}"/>
      <rect x="126" y="74" width="44" height="86" rx="20" fill="${c}"/>
      <rect x="24" y="156" width="20" height="22" rx="7" fill="${shade(wood, -.2)}"/>
      <rect x="126" y="156" width="20" height="22" rx="7" fill="${shade(wood, -.2)}"/>`,
  },
  {
    id: 'coffeeTable', name: 'Table', cat: 'living', w: 210, h: 110, tint: wood,
    draw: (c) => `<rect x="0" y="0" width="210" height="26" rx="12" fill="${c}"/>
      <rect x="16" y="26" width="18" height="84" rx="8" fill="${shade(c, -.2)}"/>
      <rect x="176" y="26" width="18" height="84" rx="8" fill="${shade(c, -.2)}"/>
      <rect x="24" y="66" width="162" height="12" rx="6" fill="${shade(c, -.1)}"/>`,
  },
  {
    id: 'tv', name: 'TV', cat: 'living', w: 240, h: 190, tint: '#5a6b8c', toggle: 'Watch TV',
    draw: (c, on) => `<rect x="0" y="0" width="240" height="140" rx="16" fill="${shade(c, -.3)}"/>
      <rect x="12" y="12" width="216" height="112" rx="8" fill="${on ? '#8fd6ff' : '#2b3442'}"/>
      ${on ? `<circle cx="80" cy="66" r="24" fill="#ffd166"/><path d="M130 100 l40 -44 l40 44 Z" fill="#7ad9b3"/><rect x="12" y="96" width="216" height="28" fill="#46bd93" opacity=".5"/>` : ''}
      <rect x="92" y="140" width="56" height="26" fill="${shade(c, -.2)}"/>
      <rect x="56" y="166" width="128" height="20" rx="10" fill="${c}"/>`,
  },
  {
    id: 'bookshelf', name: 'Bookshelf', cat: 'living', w: 200, h: 320, tint: wood,
    draw: (c) => {
      const books = (y) => [0, 1, 2, 3, 4, 5].map((i) => {
        const col = ACCENT[(i + y) % ACCENT.length];
        return `<rect x="${22 + i * 26}" y="${y + 14}" width="${18 - (i % 2) * 3}" height="${62 - (i % 3) * 10}" rx="4" fill="${col}"/>`;
      }).join('');
      return `<rect x="0" y="0" width="200" height="320" rx="14" fill="${c}"/>
        <rect x="14" y="14" width="172" height="292" rx="8" fill="${shade(c, .28)}"/>
        ${[8, 104, 200].map((y) => `${books(y)}<rect x="14" y="${y + 84}" width="172" height="12" fill="${c}"/>`).join('')}`;
    },
  },
  {
    id: 'rug', name: 'Rug', cat: 'living', w: 340, h: 60, tint: '#b39ddb',
    draw: (c) => `<ellipse cx="170" cy="30" rx="170" ry="30" fill="${c}"/>
      <ellipse cx="170" cy="30" rx="120" ry="20" fill="${shade(c, .3)}"/>
      <ellipse cx="170" cy="30" rx="60" ry="10" fill="${shade(c, -.12)}"/>`,
  },
  {
    id: 'floorLamp', name: 'Lamp', cat: 'living', w: 120, h: 300, tint: '#ffd166', toggle: 'Switch light',
    draw: (c, on) => `<rect x="52" y="60" width="16" height="220" fill="${metal}"/>
      <ellipse cx="60" cy="286" rx="46" ry="14" fill="${shade(metal, -.2)}"/>
      <path d="M18 60 L102 60 L86 4 L34 4 Z" fill="${on ? shade(c, .3) : c}"/>
      ${on ? `<ellipse cx="60" cy="76" rx="58" ry="22" fill="#fff3c4" opacity=".75"/>` : ''}`,
  },
  {
    id: 'plant', name: 'Plant', cat: 'living', w: 150, h: 240, tint: '#46bd93',
    draw: (c) => `<path d="M75 160 C20 150 8 92 30 52 C58 64 78 104 78 152 Z" fill="${c}"/>
      <path d="M75 160 C130 148 146 92 122 50 C92 64 74 106 74 152 Z" fill="${shade(c, .18)}"/>
      <path d="M75 162 C70 110 78 70 92 38" stroke="${shade(c, -.25)}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M36 160 h78 l-12 78 q-2 12 -14 12 H62 q-12 0 -14 -12 Z" fill="#e08b5a"/>
      <rect x="30" y="150" width="90" height="22" rx="10" fill="#f09f6c"/>`,
  },
  {
    id: 'cat', name: 'Cat', cat: 'living', w: 130, h: 110, tint: '#f7b731', say: 'Meow!',
    draw: (c) => `<ellipse cx="62" cy="80" rx="58" ry="30" fill="${c}"/>
      <path d="M108 78 q26 -6 18 -42 q-2 -8 -10 -2 q-6 24 -18 34 Z" fill="${c}"/>
      <circle cx="34" cy="52" r="30" fill="${c}"/>
      <path d="M12 36 l2 -24 l20 14 Z" fill="${c}"/><path d="M58 36 l-2 -24 l-20 14 Z" fill="${c}"/>
      <circle cx="24" cy="50" r="5" fill="#2f2622"/><circle cx="46" cy="50" r="5" fill="#2f2622"/>
      <path d="M30 62 q5 6 10 0" stroke="#2f2622" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  },

  /* ------------------------------------------------------------ bedroom */
  {
    id: 'bed', name: 'Bed', cat: 'bed', w: 400, h: 220, tint: '#72c7f2',
    sit: { x: 250, y: 120 },
    draw: (c) => `<rect x="0" y="20" width="60" height="180" rx="16" fill="${shade(wood, -.05)}"/>
      <rect x="340" y="70" width="60" height="130" rx="16" fill="${shade(wood, -.05)}"/>
      <rect x="30" y="118" width="340" height="66" rx="16" fill="${shade(wood, .1)}"/>
      <rect x="40" y="96" width="330" height="48" rx="18" fill="${c}"/>
      <path d="M40 120 h150 v24 H40 Z" fill="${shade(c, .25)}"/>
      <rect x="54" y="66" width="120" height="48" rx="18" fill="#fff"/>
      <rect x="44" y="184" width="20" height="30" rx="8" fill="${shade(wood, -.25)}"/>
      <rect x="336" y="184" width="20" height="30" rx="8" fill="${shade(wood, -.25)}"/>`,
  },
  {
    id: 'bunk', name: 'Bunk bed', cat: 'bed', w: 340, h: 380, tint: '#b39ddb',
    sit: { x: 180, y: 290 },
    draw: (c) => `<rect x="10" y="0" width="22" height="380" rx="10" fill="${wood}"/>
      <rect x="308" y="0" width="22" height="380" rx="10" fill="${wood}"/>
      <rect x="20" y="120" width="300" height="34" rx="12" fill="${shade(wood, .1)}"/>
      <rect x="30" y="92" width="280" height="36" rx="14" fill="${c}"/>
      <rect x="20" y="330" width="300" height="34" rx="12" fill="${shade(wood, .1)}"/>
      <rect x="30" y="302" width="280" height="36" rx="14" fill="${shade(c, .25)}"/>
      <rect x="40" y="70" width="90" height="30" rx="12" fill="#fff"/>
      <rect x="40" y="280" width="90" height="30" rx="12" fill="#fff"/>
      <path d="M180 160 v140" stroke="${wood}" stroke-width="14" stroke-linecap="round"/>
      ${[0, 1, 2].map((i) => `<rect x="150" y="${186 + i * 38}" width="60" height="12" rx="6" fill="${shade(wood, -.1)}"/>`).join('')}`,
  },
  {
    id: 'nightstand', name: 'Nightstand', cat: 'bed', w: 130, h: 150, tint: wood,
    draw: (c) => `<rect x="0" y="0" width="130" height="130" rx="14" fill="${c}"/>
      <rect x="14" y="20" width="102" height="44" rx="8" fill="${shade(c, .28)}"/>
      <rect x="14" y="74" width="102" height="44" rx="8" fill="${shade(c, .28)}"/>
      <circle cx="65" cy="42" r="7" fill="${shade(c, -.3)}"/><circle cx="65" cy="96" r="7" fill="${shade(c, -.3)}"/>
      <rect x="8" y="130" width="16" height="20" rx="6" fill="${shade(c, -.3)}"/>
      <rect x="106" y="130" width="16" height="20" rx="6" fill="${shade(c, -.3)}"/>`,
  },
  {
    id: 'wardrobe', name: 'Wardrobe', cat: 'bed', w: 220, h: 340, tint: '#f4e1d2',
    draw: (c) => `<rect x="0" y="0" width="220" height="340" rx="16" fill="${c}"/>
      <rect x="12" y="14" width="92" height="300" rx="10" fill="${shade(c, -.1)}"/>
      <rect x="116" y="14" width="92" height="300" rx="10" fill="${shade(c, -.1)}"/>
      <circle cx="96" cy="170" r="8" fill="${shade(c, -.45)}"/><circle cx="124" cy="170" r="8" fill="${shade(c, -.45)}"/>
      <rect x="6" y="314" width="20" height="26" rx="8" fill="${shade(c, -.4)}"/>
      <rect x="194" y="314" width="20" height="26" rx="8" fill="${shade(c, -.4)}"/>`,
  },
  {
    id: 'toybox', name: 'Toy box', cat: 'bed', w: 190, h: 140, tint: '#ff9f68',
    draw: (c) => `<rect x="0" y="30" width="190" height="110" rx="14" fill="${c}"/>
      <rect x="-6" y="14" width="202" height="30" rx="12" fill="${shade(c, -.16)}"/>
      <circle cx="60" cy="88" r="16" fill="${shade(c, .35)}"/><path d="M110 74 h44 v44 h-44 Z" fill="${shade(c, .35)}"/>
      <path d="M40 22 q20 -22 40 0" stroke="${shade(c, -.3)}" stroke-width="6" fill="none"/>`,
  },
  {
    id: 'teddy', name: 'Teddy', cat: 'bed', w: 110, h: 130, tint: '#c98f5e', say: 'Hug!',
    draw: (c) => `<circle cx="22" cy="24" r="17" fill="${c}"/><circle cx="88" cy="24" r="17" fill="${c}"/>
      <ellipse cx="55" cy="96" rx="40" ry="34" fill="${c}"/><ellipse cx="55" cy="104" rx="24" ry="20" fill="${shade(c, .35)}"/>
      <circle cx="55" cy="46" r="34" fill="${c}"/><ellipse cx="55" cy="56" rx="17" ry="13" fill="${shade(c, .35)}"/>
      <circle cx="44" cy="40" r="4.5" fill="#2f2622"/><circle cx="66" cy="40" r="4.5" fill="#2f2622"/>
      <ellipse cx="55" cy="52" rx="6" ry="4" fill="#2f2622"/>`,
  },

  /* ------------------------------------------------------------ kitchen */
  {
    id: 'fridge', name: 'Fridge', cat: 'kitchen', w: 170, h: 330, tint: '#e3e8f0', toggle: 'Open fridge',
    draw: (c, on) => `<rect x="0" y="0" width="170" height="330" rx="18" fill="${c}"/>
      ${on
        ? `<rect x="10" y="10" width="150" height="310" rx="12" fill="#cfe9ff"/>
           <rect x="24" y="40" width="122" height="14" rx="6" fill="#fff"/><rect x="24" y="120" width="122" height="14" rx="6" fill="#fff"/>
           <rect x="24" y="200" width="122" height="14" rx="6" fill="#fff"/>
           <circle cx="60" cy="86" r="16" fill="#ff8fab"/><rect x="92" y="70" width="34" height="34" rx="6" fill="#ffd166"/>
           <rect x="40" y="150" width="46" height="40" rx="8" fill="#7ad9b3"/>`
        : `<rect x="10" y="10" width="150" height="120" rx="12" fill="${shade(c, -.07)}"/>
           <rect x="10" y="140" width="150" height="180" rx="12" fill="${shade(c, -.07)}"/>
           <rect x="132" y="50" width="12" height="46" rx="6" fill="${shade(c, -.45)}"/>
           <rect x="132" y="170" width="12" height="60" rx="6" fill="${shade(c, -.45)}"/>`}`,
  },
  {
    id: 'stove', name: 'Stove', cat: 'kitchen', w: 200, h: 220, tint: '#b9c3cf', toggle: 'Start cooking',
    draw: (c, on) => `<rect x="0" y="30" width="200" height="190" rx="14" fill="${c}"/>
      <rect x="0" y="0" width="200" height="40" rx="12" fill="${shade(c, -.25)}"/>
      <circle cx="56" cy="20" r="11" fill="${on ? '#ff8fab' : shade(c, .2)}"/><circle cx="144" cy="20" r="11" fill="${on ? '#ff8fab' : shade(c, .2)}"/>
      <rect x="18" y="58" width="164" height="112" rx="10" fill="${shade(c, -.1)}"/>
      <rect x="30" y="70" width="140" height="88" rx="8" fill="${on ? '#ffca6b' : '#42505f'}"/>
      ${on ? `<circle cx="100" cy="120" r="24" fill="#ff9f68"/>` : ''}
      <rect x="18" y="180" width="164" height="14" rx="7" fill="${shade(c, -.3)}"/>`,
  },
  {
    id: 'counter', name: 'Sink unit', cat: 'kitchen', w: 260, h: 200, tint: '#f4e1d2',
    draw: (c) => `<rect x="0" y="24" width="260" height="176" rx="14" fill="${c}"/>
      <rect x="0" y="0" width="260" height="30" rx="12" fill="${shade(c, -.25)}"/>
      <rect x="18" y="46" width="104" height="140" rx="10" fill="${shade(c, -.1)}"/>
      <rect x="138" y="46" width="104" height="140" rx="10" fill="${shade(c, -.1)}"/>
      <rect x="150" y="2" width="80" height="24" rx="10" fill="${metal}"/>
      <path d="M118 0 v-34 q0 -14 14 -14 h34" stroke="${metal}" stroke-width="10" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'kitchenTable', name: 'Dining table', cat: 'kitchen', w: 280, h: 170, tint: wood,
    draw: (c) => `<rect x="0" y="0" width="280" height="26" rx="12" fill="${c}"/>
      <rect x="24" y="26" width="20" height="144" rx="8" fill="${shade(c, -.2)}"/>
      <rect x="236" y="26" width="20" height="144" rx="8" fill="${shade(c, -.2)}"/>
      <rect x="34" y="70" width="212" height="14" rx="7" fill="${shade(c, -.1)}"/>`,
  },
  {
    id: 'chair', name: 'Chair', cat: 'kitchen', w: 120, h: 210, tint: '#ffd166',
    sit: { x: 60, y: 112 },
    draw: (c) => `<rect x="10" y="0" width="100" height="120" rx="16" fill="${c}"/>
      <rect x="26" y="20" width="68" height="80" rx="12" fill="${shade(c, .3)}"/>
      <rect x="0" y="112" width="120" height="26" rx="12" fill="${shade(c, -.1)}"/>
      <rect x="12" y="138" width="18" height="72" rx="8" fill="${shade(c, -.25)}"/>
      <rect x="90" y="138" width="18" height="72" rx="8" fill="${shade(c, -.25)}"/>`,
  },
  {
    id: 'cupboard', name: 'Cupboard', cat: 'kitchen', w: 220, h: 150, anchor: 'wall', tint: '#f4e1d2',
    draw: (c) => `<rect x="0" y="0" width="220" height="150" rx="14" fill="${c}"/>
      <rect x="12" y="12" width="92" height="126" rx="10" fill="${shade(c, -.12)}"/>
      <rect x="116" y="12" width="92" height="126" rx="10" fill="${shade(c, -.12)}"/>
      <circle cx="96" cy="75" r="7" fill="${shade(c, -.45)}"/><circle cx="124" cy="75" r="7" fill="${shade(c, -.45)}"/>`,
  },
  {
    id: 'cake', name: 'Cake', cat: 'kitchen', w: 120, h: 110, tint: '#ff8fab', say: 'Yum!',
    draw: (c) => `<ellipse cx="60" cy="100" rx="56" ry="10" fill="#fff"/>
      <path d="M8 56 h104 v38 q0 12 -14 12 H22 q-14 0 -14 -12 Z" fill="${shade(c, .5)}"/>
      <path d="M8 56 q12 16 26 0 q12 16 26 0 q12 16 26 0 q12 16 26 0 v-14 q0 -10 -12 -10 H20 q-12 0 -12 10 Z" fill="${c}"/>
      <rect x="56" y="14" width="8" height="24" rx="4" fill="#fff"/><path d="M60 14 q10 -12 0 -14 q-10 8 0 14" fill="#ffd166"/>`,
  },

  /* ----------------------------------------------------------- bathroom */
  {
    id: 'bath', name: 'Bathtub', cat: 'bath', w: 300, h: 180, tint: '#ffffff',
    sit: { x: 150, y: 110 },
    draw: (c) => `<path d="M0 40 h300 v90 q0 40 -40 40 H40 q-40 0 -40 -40 Z" fill="${c}"/>
      <path d="M14 54 h272 v72 q0 28 -28 28 H42 q-28 0 -28 -28 Z" fill="#cfefff"/>
      <path d="M14 76 q30 16 60 0 q30 16 60 0 q30 16 60 0 q30 16 60 0 v50 q0 28 -28 28 H42 q-28 0 -28 -28 Z" fill="#9fdcff"/>
      <circle cx="90" cy="70" r="14" fill="#fff" opacity=".8"/><circle cx="170" cy="62" r="9" fill="#fff" opacity=".8"/>
      <path d="M286 40 v-30 q0 -12 -14 -12 h-30" stroke="${metal}" stroke-width="10" fill="none" stroke-linecap="round"/>
      <rect x="20" y="170" width="22" height="10" rx="5" fill="${shade(c, -.35)}"/><rect x="258" y="170" width="22" height="10" rx="5" fill="${shade(c, -.35)}"/>`,
  },
  {
    id: 'toilet', name: 'Toilet', cat: 'bath', w: 130, h: 200, tint: '#ffffff',
    sit: { x: 62, y: 118 },
    draw: (c) => `<rect x="70" y="0" width="60" height="100" rx="12" fill="${c}"/>
      <circle cx="100" cy="20" r="9" fill="${metal}"/>
      <path d="M0 96 h96 v40 q0 26 -30 26 H36 q-30 0 -36 -26 Z" fill="${c}"/>
      <ellipse cx="48" cy="112" rx="42" ry="16" fill="#cfefff"/>
      <rect x="30" y="158" width="46" height="42" rx="10" fill="${shade(c, -.12)}"/>`,
  },
  {
    id: 'basin', name: 'Basin', cat: 'bath', w: 150, h: 200, tint: '#ffffff',
    draw: (c) => `<rect x="0" y="0" width="150" height="46" rx="16" fill="${c}"/>
      <ellipse cx="75" cy="18" rx="46" ry="14" fill="#cfefff"/>
      <rect x="58" y="46" width="34" height="120" rx="10" fill="${shade(c, -.08)}"/>
      <rect x="30" y="166" width="90" height="34" rx="12" fill="${shade(c, -.14)}"/>
      <path d="M75 0 v-26" stroke="${metal}" stroke-width="10" stroke-linecap="round"/>`,
  },
  {
    id: 'towels', name: 'Towels', cat: 'bath', w: 130, h: 120, anchor: 'wall', tint: '#7ad9b3',
    draw: (c) => `<rect x="0" y="0" width="130" height="12" rx="6" fill="${metal}"/>
      <rect x="14" y="10" width="46" height="100" rx="10" fill="${c}"/>
      <rect x="70" y="10" width="46" height="84" rx="10" fill="${shade(c, .3)}"/>
      <rect x="14" y="76" width="46" height="10" fill="${shade(c, -.18)}"/>`,
  },
  {
    id: 'duck', name: 'Rubber duck', cat: 'bath', w: 90, h: 80, tint: '#ffd166', say: 'Squeak!',
    draw: (c) => `<ellipse cx="44" cy="58" rx="42" ry="22" fill="${c}"/>
      <circle cx="26" cy="30" r="22" fill="${c}"/><path d="M4 30 q-14 4 -2 12 q10 4 16 -6 Z" fill="#ff9f68"/>
      <circle cx="30" cy="24" r="4" fill="#2f2622"/>
      <path d="M50 46 q26 -6 34 10 q-18 12 -34 4 Z" fill="${shade(c, -.14)}"/>`,
  },

  /* ---------------------------------------------------------------- fun */
  {
    id: 'balloons', name: 'Balloons', cat: 'fun', w: 160, h: 320, tint: '#ff8fab', say: 'Pop!',
    draw: (c) => `<path d="M40 130 q30 60 40 190" stroke="#c9b9a8" stroke-width="4" fill="none"/>
      <path d="M120 120 q-20 60 -40 200" stroke="#c9b9a8" stroke-width="4" fill="none"/>
      <ellipse cx="40" cy="80" rx="46" ry="54" fill="${c}"/>
      <ellipse cx="120" cy="70" rx="40" ry="48" fill="${shade(c, .35)}"/>
      <ellipse cx="26" cy="60" rx="12" ry="16" fill="#fff" opacity=".55"/>`,
  },
  {
    id: 'beanbag', name: 'Bean bag', cat: 'fun', w: 200, h: 140, tint: '#b39ddb',
    sit: { x: 100, y: 60 },
    draw: (c) => `<path d="M14 140 q-24 -70 40 -104 q54 -28 108 4 q40 32 24 100 Z" fill="${c}"/>
      <path d="M54 44 q50 -16 92 18" stroke="${shade(c, .3)}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: 'easel', name: 'Easel', cat: 'fun', w: 200, h: 320, tint: '#e0b183',
    draw: (c) => `<path d="M96 40 L30 320" stroke="${c}" stroke-width="16" stroke-linecap="round"/>
      <path d="M104 40 L170 320" stroke="${c}" stroke-width="16" stroke-linecap="round"/>
      <rect x="20" y="170" width="160" height="16" rx="8" fill="${shade(c, -.2)}"/>
      <rect x="24" y="30" width="152" height="140" rx="8" fill="#fff"/>
      <path d="M44 140 l36 -60 l30 44 l22 -26 l24 42 Z" fill="#7ad9b3"/>
      <circle cx="140" cy="62" r="16" fill="#ffd166"/>`,
  },
  {
    id: 'drums', name: 'Drum', cat: 'fun', w: 170, h: 160, tint: '#ff8fab', say: 'Boom!',
    draw: (c) => `<rect x="20" y="40" width="130" height="90" rx="10" fill="${c}"/>
      <ellipse cx="85" cy="40" rx="65" ry="22" fill="#fff6e8"/>
      <ellipse cx="85" cy="40" rx="52" ry="16" fill="#fff"/>
      ${[0, 1, 2, 3].map((i) => `<path d="M${30 + i * 34} 44 l16 80" stroke="${shade(c, -.25)}" stroke-width="7"/>`).join('')}
      <path d="M120 30 l40 -46" stroke="#c98f5e" stroke-width="9" stroke-linecap="round"/>
      <circle cx="162" cy="-20" r="11" fill="#c98f5e"/>`,
  },
  {
    id: 'skateboard', name: 'Skateboard', cat: 'fun', w: 200, h: 60, tint: '#72c7f2',
    draw: (c) => `<path d="M0 20 q14 -14 30 -14 h140 q16 0 30 14 q-14 14 -30 14 H30 q-16 0 -30 -14 Z" fill="${c}"/>
      <circle cx="46" cy="44" r="14" fill="#40302b"/><circle cx="154" cy="44" r="14" fill="#40302b"/>
      <circle cx="46" cy="44" r="6" fill="#ffd166"/><circle cx="154" cy="44" r="6" fill="#ffd166"/>`,
  },
  {
    id: 'dog', name: 'Dog', cat: 'fun', w: 150, h: 120, tint: '#e0b183', say: 'Woof!',
    draw: (c) => `<ellipse cx="72" cy="78" rx="56" ry="32" fill="${c}"/>
      <rect x="30" y="94" width="18" height="26" rx="8" fill="${c}"/><rect x="96" y="94" width="18" height="26" rx="8" fill="${c}"/>
      <path d="M126 62 q28 -18 20 -44 q-14 -2 -22 14 q-6 16 2 30 Z" fill="${c}"/>
      <circle cx="36" cy="46" r="30" fill="${c}"/>
      <ellipse cx="20" cy="54" rx="14" ry="11" fill="${shade(c, .35)}"/><circle cx="12" cy="52" r="6" fill="#2f2622"/>
      <path d="M8 22 q-14 12 -2 28 q12 4 16 -12 Z" fill="${shade(c, -.2)}"/>
      <circle cx="42" cy="38" r="5" fill="#2f2622"/>`,
  },

  /* ------------------------------------------------------------- garden */
  {
    id: 'tree', name: 'Tree', cat: 'garden', w: 300, h: 400, tint: '#46bd93',
    draw: (c) => `<rect x="128" y="220" width="46" height="180" rx="16" fill="#a9754a"/>
      <circle cx="150" cy="150" r="110" fill="${c}"/>
      <circle cx="70" cy="196" r="66" fill="${shade(c, .12)}"/>
      <circle cx="232" cy="196" r="62" fill="${shade(c, -.1)}"/>
      <circle cx="120" cy="104" r="18" fill="#ff8fab"/><circle cx="196" cy="158" r="16" fill="#ff8fab"/>`,
  },
  {
    id: 'bush', name: 'Bush', cat: 'garden', w: 190, h: 120, tint: '#7ad9b3',
    draw: (c) => `<circle cx="52" cy="76" r="46" fill="${c}"/><circle cx="130" cy="72" r="52" fill="${shade(c, -.08)}"/>
      <circle cx="94" cy="50" r="42" fill="${shade(c, .14)}"/><rect x="0" y="100" width="190" height="20" rx="10" fill="${shade(c, -.2)}"/>`,
  },
  {
    id: 'flowers', name: 'Flowers', cat: 'garden', w: 170, h: 150, tint: '#ff8fab',
    draw: (c) => {
      const bloom = (x, y, col) => `<g transform="translate(${x} ${y})">
        ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-18" rx="11" ry="17" fill="${col}" transform="rotate(${a})"/>`).join('')}
        <circle r="9" fill="#ffd166"/></g>`;
      return `<path d="M36 150 V70 M86 150 V44 M136 150 V78" stroke="#46bd93" stroke-width="9" stroke-linecap="round"/>
        ${bloom(36, 66, c)}${bloom(86, 40, shade(c, .35))}${bloom(136, 74, shade(c, -.1))}`;
    },
  },
  {
    id: 'swing', name: 'Swing', cat: 'garden', w: 260, h: 360, tint: '#ffd166',
    sit: { x: 130, y: 250 },
    draw: (c) => `<path d="M20 360 L130 20 L240 360" stroke="#a9754a" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="M86 26 h88" stroke="#a9754a" stroke-width="16" stroke-linecap="round"/>
      <path d="M92 30 v220 M168 30 v220" stroke="#8d8d8d" stroke-width="6"/>
      <rect x="74" y="248" width="112" height="22" rx="10" fill="${c}"/>`,
  },
  {
    id: 'sandbox', name: 'Sandpit', cat: 'garden', w: 260, h: 120, tint: '#f7b731',
    draw: (c) => `<rect x="0" y="30" width="260" height="90" rx="14" fill="${shade(c, -.3)}"/>
      <rect x="16" y="44" width="228" height="62" rx="10" fill="${shade(c, .45)}"/>
      <path d="M80 92 q24 -34 48 0 Z" fill="${c}"/><rect x="150" y="70" width="40" height="26" rx="6" fill="#72c7f2"/>`,
  },
  {
    id: 'picnic', name: 'Picnic table', cat: 'garden', w: 280, h: 170, tint: '#c98f5e',
    sit: { x: 140, y: 124 },
    draw: (c) => `<rect x="0" y="40" width="280" height="24" rx="10" fill="${c}"/>
      <path d="M40 64 L18 170 M240 64 L262 170" stroke="${shade(c, -.2)}" stroke-width="18" stroke-linecap="round"/>
      <rect x="0" y="112" width="280" height="18" rx="8" fill="${shade(c, -.1)}"/>
      <rect x="60" y="14" width="60" height="26" rx="8" fill="#ff8fab"/>`,
  },
  {
    id: 'fence', name: 'Fence', cat: 'garden', w: 300, h: 140, tint: '#ffffff',
    draw: (c) => `${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${10 + i * 50} 140 V30 l16 -20 l16 20 v110 Z" fill="${c}"/>`).join('')}
      <rect x="0" y="52" width="300" height="16" rx="6" fill="${shade(c, -.12)}"/>
      <rect x="0" y="100" width="300" height="16" rx="6" fill="${shade(c, -.12)}"/>`,
  },

  /* -------------------------------------------------------------- walls */
  {
    id: 'window', name: 'Window', cat: 'walls', w: 240, h: 230, anchor: 'wall', tint: '#ffffff',
    draw: (c) => `<rect x="0" y="0" width="240" height="230" rx="16" fill="${c}"/>
      <rect x="14" y="14" width="212" height="202" rx="10" fill="#9fdcff"/>
      <circle cx="176" cy="60" r="26" fill="#fff3c4"/>
      <ellipse cx="70" cy="80" rx="42" ry="22" fill="#fff" opacity=".85"/>
      <rect x="14" y="150" width="212" height="66" fill="#bfe8b8"/>
      <rect x="110" y="14" width="20" height="202" fill="${c}"/><rect x="14" y="104" width="212" height="18" fill="${c}"/>
      <rect x="-10" y="216" width="260" height="20" rx="8" fill="${shade(c, -.2)}"/>`,
  },
  {
    id: 'door', name: 'Door', cat: 'walls', w: 170, h: 320, anchor: 'floor', tint: '#c98f5e',
    say: 'Where to next?',
    draw: (c) => `<rect x="0" y="0" width="170" height="320" rx="16" fill="${shade(c, -.2)}"/>
      <rect x="12" y="12" width="146" height="308" rx="10" fill="${c}"/>
      <rect x="28" y="30" width="114" height="110" rx="8" fill="${shade(c, .2)}"/>
      <rect x="28" y="160" width="114" height="130" rx="8" fill="${shade(c, .2)}"/>
      <circle cx="132" cy="176" r="10" fill="#ffd166"/>`,
  },
  {
    id: 'picture', name: 'Picture', cat: 'walls', w: 160, h: 130, anchor: 'wall', tint: '#f7b731',
    draw: (c) => `<rect x="0" y="0" width="160" height="130" rx="10" fill="${c}"/>
      <rect x="12" y="12" width="136" height="106" rx="6" fill="#fff6e8"/>
      <circle cx="52" cy="46" r="16" fill="#ffd166"/>
      <path d="M20 108 l34 -44 l26 30 l22 -20 l38 34 Z" fill="#7ad9b3"/>`,
  },
  {
    id: 'clock', name: 'Clock', cat: 'walls', w: 110, h: 110, anchor: 'wall', tint: '#ff8fab',
    say: 'Tick tock!',
    draw: (c) => `<circle cx="55" cy="55" r="55" fill="${c}"/><circle cx="55" cy="55" r="43" fill="#fff6e8"/>
      <path d="M55 55 V26 M55 55 l22 14" stroke="#40302b" stroke-width="7" stroke-linecap="round"/>
      <circle cx="55" cy="55" r="6" fill="#40302b"/>`,
  },
  {
    id: 'shelf', name: 'Shelf', cat: 'walls', w: 210, h: 90, anchor: 'wall', tint: '#c98f5e',
    draw: (c) => `<rect x="0" y="70" width="210" height="18" rx="8" fill="${c}"/>
      <rect x="20" y="20" width="22" height="50" rx="5" fill="#ff8fab"/>
      <rect x="48" y="30" width="20" height="40" rx="5" fill="#72c7f2"/>
      <circle cx="120" cy="50" r="20" fill="#7ad9b3"/>
      <path d="M160 70 l18 -34 l18 34 Z" fill="#ffd166"/>`,
  },
  {
    id: 'bunting', name: 'Bunting', cat: 'walls', w: 340, h: 100, anchor: 'wall', tint: '#ff8fab',
    draw: (c) => `<path d="M0 10 q170 60 340 10" stroke="#c9b9a8" stroke-width="6" fill="none"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => {
        const x = 20 + i * 58, y = 20 + Math.sin(i / 5 * Math.PI) * 26;
        const col = [c, shade(c, .35), '#ffd166', '#7ad9b3', '#72c7f2', shade(c, -.1)][i];
        return `<path d="M${x} ${y} h44 l-22 46 Z" fill="${col}"/>`;
      }).join('')}`,
  },
];

export const FURNITURE = ITEMS.map((item) => ({
  anchor: 'floor',
  palette: item.cat === 'walls' ? [...CLOTH, ...WALLS] : CLOTH,
  ...item,
}));

const BY_ID = new Map(FURNITURE.map((item) => [item.id, item]));

export const getItem = (id) => BY_ID.get(id);

/** Markup for one catalogue item at its natural size. */
export function itemArt(def, tint, on = false) {
  return def.draw(tint || def.tint, on);
}

/** A standalone <svg> thumbnail for the tray. */
export function itemThumb(def, tint) {
  const pad = 8;
  return `<svg viewBox="${-pad} ${-pad} ${def.w + pad * 2} ${def.h + pad * 2}" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid meet" aria-label="${def.name}">${itemArt(def, tint, true)}</svg>`;
}

/** Transform string that places a placed-item record into room space. */
export function placeTransform(def, placed) {
  const s = placed.scale ?? 1;
  const sx = placed.flip ? -s : s;
  return `translate(${placed.x} ${placed.y}) scale(${sx} ${s}) translate(${-def.w / 2} ${-def.h})`;
}

/** Convert a point in item-local coords to room coords. */
export function localToRoom(def, placed, px, py) {
  const s = placed.scale ?? 1;
  const dx = (px - def.w / 2) * (placed.flip ? -s : s);
  return { x: placed.x + dx, y: placed.y + (py - def.h) * s };
}

/** Axis-aligned bounds of a placed item, in room coords. */
export function itemBounds(def, placed) {
  const s = placed.scale ?? 1;
  return {
    x: placed.x - (def.w * s) / 2,
    y: placed.y - def.h * s,
    w: def.w * s,
    h: def.h * s,
  };
}
