// Avatar art: a library of chunky vector parts plus the renderer that
// assembles them. Everything is plain SVG markup so a character can be drawn
// into a tray thumbnail, a room scene or a full-screen preview at any size.

import { SKIN, HAIR, CLOTH, EYES } from './palette.js';
import { shade, pick, esc, uid } from '../util.js';

export const VIEW = { w: 200, h: 340 };

const G = {
  headCx: 100, headCy: 96, headRx: 54, headRy: 52,
  torsoX: 60, torsoY: 150, torsoW: 80, torsoH: 86,
  hipY: 230,
  legW: 22, legH: 74, legLX: 72, legRX: 106,
  armW: 22, armH: 76, armY: 156, armLX: 44, armRX: 134,
};

/* ------------------------------------------------------------------ hair */

const CAP = 'M44 104 C44 54 68 32 100 32 C132 32 156 54 156 104 C156 84 132 74 100 74 C68 74 44 84 44 104 Z';
const CAP_SIDE = 'M44 104 C44 54 68 32 100 32 C132 32 156 54 156 104 C150 78 120 72 92 78 C70 82 52 90 44 104 Z';

const HAIR_STYLES = {
  buzz: {
    label: 'Buzz',
    front: (c) => `<path d="M46 96 C46 56 68 38 100 38 C132 38 154 56 154 96 C146 74 126 66 100 66 C74 66 54 74 46 96 Z" fill="${c}"/>`,
  },
  short: {
    label: 'Short',
    front: (c) => `<path d="${CAP}" fill="${c}"/><path d="M46 100 C50 84 70 76 96 76" stroke="${shade(c, .18)}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  },
  swoop: {
    label: 'Swoop',
    front: (c) => `<path d="${CAP_SIDE}" fill="${c}"/><path d="M150 60 C142 92 116 104 86 100" stroke="${shade(c, .2)}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  },
  bob: {
    label: 'Bob',
    back: (c) => `<path d="M38 100 C38 40 64 26 100 26 C136 26 162 40 162 100 L162 146 Q162 158 150 158 L50 158 Q38 158 38 146 Z" fill="${c}"/>`,
    front: (c) => `<path d="${CAP}" fill="${shade(c, .06)}"/>`,
  },
  long: {
    label: 'Long',
    back: (c) => `<rect x="36" y="26" width="128" height="230" rx="60" fill="${c}"/>
      <path d="M52 150 C48 190 48 220 54 248" stroke="${shade(c, -.12)}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M148 150 C152 190 152 220 146 248" stroke="${shade(c, -.12)}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    front: (c) => `<path d="${CAP}" fill="${shade(c, .05)}"/>`,
  },
  wavy: {
    label: 'Wavy',
    back: (c) => `<path d="M36 96 C36 32 66 22 100 22 C134 22 164 32 164 96 L164 216 C164 232 150 236 140 226 C128 240 112 236 104 224 C96 238 80 240 68 228 C56 238 36 230 36 212 Z" fill="${c}"/>`,
    front: (c) => `<path d="${CAP_SIDE}" fill="${shade(c, .06)}"/>`,
  },
  curly: {
    label: 'Curly',
    back: (c) => {
      const blobs = [[52, 62, 26], [100, 40, 30], [148, 62, 26], [40, 108, 24], [160, 108, 24], [56, 150, 22], [144, 150, 22]];
      return blobs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
    },
    front: (c) => `<circle cx="70" cy="62" r="20" fill="${shade(c, .08)}"/><circle cx="100" cy="52" r="22" fill="${shade(c, .08)}"/><circle cx="130" cy="62" r="20" fill="${shade(c, .08)}"/>`,
  },
  afro: {
    label: 'Afro',
    back: (c) => `<circle cx="100" cy="82" r="76" fill="${c}"/><circle cx="100" cy="70" r="60" fill="${shade(c, .07)}"/>`,
    front: (c) => `<path d="M46 96 C48 60 70 44 100 44 C130 44 152 60 154 96 C144 74 126 66 100 66 C74 66 56 74 46 96 Z" fill="${shade(c, .1)}"/>`,
  },
  bun: {
    label: 'Bun',
    back: (c) => `<circle cx="100" cy="24" r="28" fill="${c}"/><circle cx="100" cy="24" r="18" fill="${shade(c, .1)}"/>`,
    front: (c) => `<path d="${CAP}" fill="${c}"/>`,
  },
  ponytail: {
    label: 'Ponytail',
    back: (c) => `<path d="M150 90 C186 96 190 160 168 206 C160 226 138 222 142 202 C154 168 150 126 134 106 Z" fill="${c}"/>`,
    front: (c) => `<path d="${CAP_SIDE}" fill="${c}"/><circle cx="150" cy="92" r="12" fill="${shade(c, -.15)}"/>`,
  },
  twintails: {
    label: 'Twin tails',
    back: (c) => `<ellipse cx="34" cy="150" rx="22" ry="52" fill="${c}"/><ellipse cx="166" cy="150" rx="22" ry="52" fill="${c}"/>
      <circle cx="44" cy="96" r="14" fill="${shade(c, -.12)}"/><circle cx="156" cy="96" r="14" fill="${shade(c, -.12)}"/>`,
    front: (c) => `<path d="${CAP}" fill="${c}"/>`,
  },
  braids: {
    label: 'Braids',
    back: (c) => {
      const braid = (x) => [0, 1, 2].map((i) =>
        `<circle cx="${x}" cy="${148 + i * 28}" r="14" fill="${i % 2 ? shade(c, -.1) : c}"/>`).join('');
      return `<path d="M38 100 C38 40 64 26 100 26 C136 26 162 40 162 100 L162 122 Q162 136 148 136 L52 136 Q38 136 38 122 Z" fill="${c}"/>${braid(38)}${braid(162)}`;
    },
    front: (c) => `<path d="${CAP}" fill="${shade(c, .05)}"/><path d="M100 34 L100 74" stroke="${shade(c, -.2)}" stroke-width="5"/>`,
  },
  mohawk: {
    label: 'Mohawk',
    front: (c) => `<path d="M46 98 C48 74 70 62 100 62 C130 62 152 74 154 98 C146 86 126 80 100 80 C74 80 54 86 46 98 Z" fill="${shade(c, -.2)}"/>
      <path d="M78 76 C80 34 92 12 100 10 C108 12 120 34 122 76 Z" fill="${c}"/>`,
  },
};

/* ------------------------------------------------------------------ eyes */

const eyePair = (draw) => draw(78) + draw(122);

const EYE_STYLES = {
  dot: { label: 'Dots', draw: (c) => eyePair((x) => `<circle cx="${x}" cy="104" r="9" fill="#2f2622"/><circle cx="${x + 3}" cy="101" r="3" fill="#fff"/>`) },
  big: {
    label: 'Big',
    draw: (c) => eyePair((x) => `<ellipse cx="${x}" cy="104" rx="13" ry="15" fill="#fff"/>
      <circle cx="${x}" cy="105" r="10" fill="${c}"/><circle cx="${x}" cy="105" r="5" fill="#2f2622"/>
      <circle cx="${x + 4}" cy="100" r="4" fill="#fff"/>`),
  },
  wide: {
    label: 'Wide',
    draw: (c) => eyePair((x) => `<circle cx="${x}" cy="104" r="15" fill="#fff"/>
      <circle cx="${x}" cy="106" r="9" fill="${c}"/><circle cx="${x}" cy="106" r="4.5" fill="#2f2622"/>
      <circle cx="${x + 5}" cy="100" r="4" fill="#fff"/>`),
  },
  sleepy: { label: 'Sleepy', draw: (c) => eyePair((x) => `<path d="M${x - 12} 104 a12 10 0 0 0 24 0" fill="${c}"/><path d="M${x - 13} 102 h26" stroke="#2f2622" stroke-width="4" stroke-linecap="round"/>`) },
  happy: { label: 'Happy', draw: () => eyePair((x) => `<path d="M${x - 12} 108 q12 -18 24 0" stroke="#2f2622" stroke-width="6" fill="none" stroke-linecap="round"/>`) },
  wink: {
    label: 'Wink',
    draw: (c) => `<ellipse cx="78" cy="104" rx="12" ry="14" fill="#fff"/><circle cx="78" cy="105" r="9" fill="${c}"/>
      <circle cx="78" cy="105" r="4.5" fill="#2f2622"/><circle cx="82" cy="100" r="3.5" fill="#fff"/>
      <path d="M110 108 q12 -18 24 0" stroke="#2f2622" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  },
  star: {
    label: 'Stars',
    draw: (c) => eyePair((x) => `<ellipse cx="${x}" cy="104" rx="13" ry="15" fill="#fff"/>
      <path d="M${x} 93 l3.4 7.4 8 .9 -6 5.5 1.7 8 -7.1-4 -7.1 4 1.7-8 -6-5.5 8-.9 Z" fill="${c}"/>`),
  },
  lashes: {
    label: 'Lashes',
    draw: (c) => eyePair((x) => `<ellipse cx="${x}" cy="105" rx="12" ry="14" fill="#fff"/>
      <circle cx="${x}" cy="106" r="9" fill="${c}"/><circle cx="${x}" cy="106" r="4.5" fill="#2f2622"/>
      <circle cx="${x + 4}" cy="101" r="3" fill="#fff"/>
      <path d="M${x - 13} 96 l-6 -6 M${x} 90 l0 -8 M${x + 13} 96 l6 -6" stroke="#2f2622" stroke-width="4" stroke-linecap="round"/>`),
  },
};

/* ----------------------------------------------------------------- mouth */

const MOUTH_STYLES = {
  smile: { label: 'Smile', draw: () => `<path d="M84 128 q16 16 32 0" stroke="#a4534f" stroke-width="6" fill="none" stroke-linecap="round"/>` },
  grin: { label: 'Grin', draw: () => `<path d="M80 126 q20 24 40 0 Z" fill="#8f3f43"/><path d="M84 127 h32 v5 a16 16 0 0 1 -32 0 Z" fill="#fff"/>` },
  open: { label: 'Oh!', draw: () => `<ellipse cx="100" cy="132" rx="11" ry="13" fill="#8f3f43"/><ellipse cx="100" cy="139" rx="7" ry="5" fill="#ff8fab"/>` },
  small: { label: 'Small', draw: () => `<path d="M92 130 q8 8 16 0" stroke="#a4534f" stroke-width="6" fill="none" stroke-linecap="round"/>` },
  flat: { label: 'Hmm', draw: () => `<path d="M88 131 h24" stroke="#a4534f" stroke-width="6" fill="none" stroke-linecap="round"/>` },
  tongue: { label: 'Cheeky', draw: () => `<path d="M82 126 q18 22 36 0 Z" fill="#8f3f43"/><path d="M92 138 q8 14 16 0 Z" fill="#ff8fab"/>` },
  cat: { label: 'Cat', draw: () => `<path d="M88 128 q6 8 12 0 q6 8 12 0" stroke="#a4534f" stroke-width="5.5" fill="none" stroke-linecap="round"/>` },
};

/* ------------------------------------------------------------------ tops */

const sleeves = (c) => `<rect x="${G.armLX - 2}" y="152" width="26" height="42" rx="13" fill="${c}"/>
  <rect x="${G.armRX - 2}" y="152" width="26" height="42" rx="13" fill="${c}"/>`;

const TOP_STYLES = {
  tee: {
    label: 'T-shirt',
    draw: (c) => `<path d="M60 178 q0 -28 28 -30 h24 q28 2 28 30 v48 q0 12 -12 12 H72 q-12 0 -12 -12 Z" fill="${c}"/>${sleeves(c)}`,
  },
  stripes: {
    label: 'Stripes',
    draw: (c) => {
      const id = `stripe${Math.abs(hashCode(c)).toString(36)}${patternSeq++}`;
      return `<defs><pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="${c}"/><rect width="20" height="10" fill="${shade(c, .55)}"/></pattern></defs>
      <path d="M60 178 q0 -28 28 -30 h24 q28 2 28 30 v48 q0 12 -12 12 H72 q-12 0 -12 -12 Z" fill="url(#${id})"/>${sleeves(c)}`;
    },
  },
  hoodie: {
    label: 'Hoodie',
    draw: (c) => `<path d="M58 180 q0 -30 30 -32 h24 q30 2 30 32 v50 q0 12 -12 12 H70 q-12 0 -12 -12 Z" fill="${c}"/>
      <path d="M72 148 q28 24 56 0 q8 16 -6 22 q-22 12 -44 0 q-14 -6 -6 -22 Z" fill="${shade(c, -.14)}"/>
      <path d="M100 172 v34" stroke="${shade(c, -.2)}" stroke-width="5" stroke-linecap="round"/>
      ${sleeves(shade(c, -.06))}`,
  },
  tank: {
    label: 'Tank',
    draw: (c) => `<path d="M70 168 q6 -20 30 -20 q24 0 30 20 v58 q0 12 -12 12 H82 q-12 0 -12 -12 Z" fill="${c}"/>`,
  },
  jacket: {
    label: 'Jacket',
    draw: (c) => `<path d="M58 178 q0 -28 30 -30 h24 q30 2 30 30 v50 q0 12 -12 12 H70 q-12 0 -12 -12 Z" fill="${c}"/>
      <rect x="92" y="150" width="16" height="90" fill="${shade(c, .35)}"/>
      <path d="M100 150 v90" stroke="${shade(c, -.25)}" stroke-width="4"/>
      ${sleeves(c)}<circle cx="100" cy="196" r="4" fill="${shade(c, -.3)}"/>`,
  },
  overalls: {
    label: 'Overalls',
    draw: (c) => `<path d="M64 196 h72 v34 q0 12 -12 12 H76 q-12 0 -12 -12 Z" fill="${c}"/>
      <rect x="72" y="150" width="14" height="52" rx="7" fill="${c}"/>
      <rect x="114" y="150" width="14" height="52" rx="7" fill="${c}"/>
      <rect x="84" y="200" width="32" height="24" rx="6" fill="${shade(c, .25)}"/>`,
    coversLegs: true,
  },
  dress: {
    label: 'Dress',
    draw: (c) => `<path d="M68 166 q8 -18 32 -18 q24 0 32 18 l22 96 q2 10 -10 10 H56 q-12 0 -10 -10 Z" fill="${c}"/>
      <path d="M52 250 h96" stroke="${shade(c, .3)}" stroke-width="8"/>${sleeves(shade(c, .1))}`,
    coversLegs: true,
  },
  gown: {
    label: 'Gown',
    draw: (c) => `<path d="M70 164 q6 -16 30 -16 q24 0 30 16 v42 l28 92 q4 12 -10 12 H52 q-14 0 -10 -12 l28 -92 Z" fill="${c}"/>
      <path d="M70 206 q30 18 60 0" stroke="${shade(c, .35)}" stroke-width="7" fill="none"/>`,
    coversLegs: true,
  },
  jumper: {
    label: 'Jumper',
    draw: (c) => `<path d="M58 180 q0 -30 30 -32 h24 q30 2 30 32 v46 q0 14 -14 14 H72 q-14 0 -14 -14 Z" fill="${c}"/>
      <path d="M72 190 l28 22 l28 -22" stroke="${shade(c, .35)}" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${sleeves(c)}`,
  },
  space: {
    label: 'Space suit',
    draw: (c) => `<path d="M58 178 q0 -30 30 -30 h24 q30 0 30 30 v50 q0 12 -12 12 H70 q-12 0 -12 -12 Z" fill="${c}"/>
      <circle cx="100" cy="196" r="18" fill="${shade(c, .5)}"/><circle cx="100" cy="196" r="10" fill="${shade(c, -.25)}"/>
      <rect x="64" y="228" width="72" height="10" fill="${shade(c, -.2)}"/>${sleeves(shade(c, .12))}`,
  },
};

/* --------------------------------------------------------------- bottoms */

const BOTTOM_STYLES = {
  shorts: { label: 'Shorts', draw: (c) => `<path d="M64 224 h72 v28 q0 8 -8 8 h-18 q-6 0 -6 -8 v-8 h-8 v8 q0 8 -6 8 H72 q-8 0 -8 -8 Z" fill="${c}"/>` },
  pants: { label: 'Pants', draw: (c) => `<path d="M64 224 h72 v12 l-6 62 q-1 8 -9 8 h-10 q-8 0 -8 -8 l-3 -48 -3 48 q0 8 -8 8 H79 q-8 0 -9 -8 l-6 -62 Z" fill="${c}"/>` },
  joggers: { label: 'Joggers', draw: (c) => `<path d="M64 224 h72 v12 l-6 54 q-1 8 -9 8 h-10 q-8 0 -8 -8 l-3 -44 -3 44 q0 8 -8 8 H79 q-8 0 -9 -8 l-6 -54 Z" fill="${c}"/>
    <rect x="66" y="286" width="26" height="12" rx="6" fill="${shade(c, -.2)}"/><rect x="108" y="286" width="26" height="12" rx="6" fill="${shade(c, -.2)}"/>` },
  skirt: { label: 'Skirt', draw: (c) => `<path d="M64 222 h72 l16 42 q3 8 -8 8 H56 q-11 0 -8 -8 Z" fill="${c}"/><path d="M56 262 h88" stroke="${shade(c, .3)}" stroke-width="7"/>` },
  tutu: { label: 'Tutu', draw: (c) => `<path d="M62 222 h76 l20 30 q6 10 -8 10 H50 q-14 0 -8 -10 Z" fill="${c}"/>
    <path d="M44 252 q14 14 28 0 q14 14 28 0 q14 14 28 0 q14 14 28 0" stroke="${shade(c, .35)}" stroke-width="8" fill="none" stroke-linecap="round"/>` },
  none: { label: 'None', draw: () => '' },
};

/* ----------------------------------------------------------------- shoes */

// Feet live between x=62 and x=96 on the left; the right foot is a mirror,
// which leaves a clear gap down the middle so they read as two shoes.
const SHOE_STYLES = {
  sneakers: { label: 'Sneakers', draw: (c) => shoePair(`<path d="M66 290 h22 q10 0 10 10 v6 q0 6 -6 6 H66 q-6 0 -6 -6 v-6 q0 -10 6 -10 Z" fill="${c}"/><rect x="58" y="303" width="40" height="11" rx="5" fill="#fff"/>`) },
  boots: { label: 'Boots', draw: (c) => shoePair(`<path d="M66 272 h22 v30 h4 q6 0 6 6 v2 q0 4 -6 4 H64 q-6 0 -6 -6 Z" fill="${c}"/><rect x="58" y="304" width="40" height="10" rx="5" fill="${shade(c, -.35)}"/>`) },
  sandals: { label: 'Sandals', draw: (c) => shoePair(`<rect x="60" y="302" width="38" height="12" rx="6" fill="${c}"/><path d="M68 302 l10 -12 l10 12" stroke="${shade(c, -.2)}" stroke-width="6" fill="none" stroke-linecap="round"/>`) },
  socks: { label: 'Socks', draw: (c) => shoePair(`<path d="M66 278 h24 v24 q0 12 -12 12 q-12 0 -12 -12 Z" fill="${c}"/><rect x="66" y="278" width="24" height="8" fill="${shade(c, -.2)}"/>`) },
  wellies: { label: 'Wellies', draw: (c) => shoePair(`<path d="M64 266 h26 v36 q0 12 -13 12 q-13 0 -13 -12 Z" fill="${c}"/><rect x="60" y="266" width="34" height="9" rx="4" fill="${shade(c, .35)}"/>`) },
  none: { label: 'Bare feet', draw: () => '' },
};

function shoePair(markup) {
  return `<g>${markup}</g><g transform="translate(200,0) scale(-1,1)">${markup}</g>`;
}

/* ------------------------------------------------------------------ hats */

const HAT_STYLES = {
  none: { label: 'None', draw: () => '' },
  cap: { label: 'Cap', draw: (c) => `<path d="M46 62 q6 -40 54 -40 q48 0 54 40 q-54 -16 -108 0 Z" fill="${c}"/><path d="M150 58 q30 2 30 16 q-24 6 -34 -4 Z" fill="${shade(c, -.18)}"/><circle cx="100" cy="24" r="7" fill="${shade(c, .35)}"/>` },
  beanie: { label: 'Beanie', draw: (c) => `<path d="M44 66 q4 -46 56 -46 q52 0 56 46 Z" fill="${c}"/><rect x="40" y="58" width="120" height="18" rx="9" fill="${shade(c, .3)}"/><circle cx="100" cy="16" r="10" fill="${shade(c, .3)}"/>` },
  bow: { label: 'Bow', draw: (c) => `<path d="M100 44 l-32 -16 q-8 -4 -8 10 v16 q0 14 8 10 Z" fill="${c}"/><path d="M100 44 l32 -16 q8 -4 8 10 v16 q0 14 -8 10 Z" fill="${c}"/><circle cx="100" cy="46" r="10" fill="${shade(c, -.18)}"/>` },
  crown: { label: 'Crown', draw: (c) => `<path d="M54 56 l6 -34 l18 16 l22 -26 l22 26 l18 -16 l6 34 Z" fill="${c}"/><rect x="52" y="54" width="96" height="14" rx="7" fill="${shade(c, -.14)}"/><circle cx="100" cy="30" r="6" fill="#ff8fab"/>` },
  ears: { label: 'Ears', draw: (c) => `<circle cx="56" cy="34" r="24" fill="${c}"/><circle cx="144" cy="34" r="24" fill="${c}"/><circle cx="56" cy="36" r="13" fill="${shade(c, .45)}"/><circle cx="144" cy="36" r="13" fill="${shade(c, .45)}"/>` },
  headphones: { label: 'Headphones', draw: (c) => `<path d="M40 100 a60 58 0 0 1 120 0" stroke="${c}" stroke-width="14" fill="none" stroke-linecap="round"/><rect x="26" y="84" width="30" height="42" rx="14" fill="${shade(c, -.14)}"/><rect x="144" y="84" width="30" height="42" rx="14" fill="${shade(c, -.14)}"/>` },
  flower: { label: 'Flower', draw: (c) => `<g transform="translate(146,52)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-15" rx="10" ry="15" fill="${c}" transform="rotate(${a})"/>`).join('')}<circle r="8" fill="#ffd166"/></g>` },
  space: { label: 'Helmet', draw: (c) => `<circle cx="100" cy="96" r="68" fill="${c}" opacity=".35"/><circle cx="100" cy="96" r="68" fill="none" stroke="${c}" stroke-width="8"/><path d="M60 62 q18 -14 40 -12" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" opacity=".8"/>` },
};

/* --------------------------------------------------------------- glasses */

const GLASS_STYLES = {
  none: { label: 'None', draw: () => '' },
  round: { label: 'Round', draw: (c) => `<circle cx="78" cy="104" r="19" fill="#fff" opacity=".35"/><circle cx="122" cy="104" r="19" fill="#fff" opacity=".35"/><circle cx="78" cy="104" r="19" fill="none" stroke="${c}" stroke-width="6"/><circle cx="122" cy="104" r="19" fill="none" stroke="${c}" stroke-width="6"/><path d="M97 104 h6 M59 100 l-14 -6 M141 100 l14 -6" stroke="${c}" stroke-width="6" stroke-linecap="round"/>` },
  square: { label: 'Square', draw: (c) => `<rect x="58" y="90" width="40" height="30" rx="8" fill="#fff" opacity=".35"/><rect x="102" y="90" width="40" height="30" rx="8" fill="#fff" opacity=".35"/><rect x="58" y="90" width="40" height="30" rx="8" fill="none" stroke="${c}" stroke-width="6"/><rect x="102" y="90" width="40" height="30" rx="8" fill="none" stroke="${c}" stroke-width="6"/><path d="M98 104 h4 M58 98 l-14 -6 M142 98 l14 -6" stroke="${c}" stroke-width="6" stroke-linecap="round"/>` },
  sun: { label: 'Shades', draw: (c) => `<path d="M54 92 h40 q6 0 6 8 q0 20 -18 20 q-22 0 -26 -18 q-2 -10 -2 -10 Z" fill="${c}"/><path d="M146 92 h-40 q-6 0 -6 8 q0 20 18 20 q22 0 26 -18 q2 -10 2 -10 Z" fill="${c}"/><path d="M52 92 l-10 -4 M148 92 l10 -4" stroke="${c}" stroke-width="6" stroke-linecap="round"/>` },
  heart: { label: 'Hearts', draw: (c) => `${[78, 122].map((x) => `<path d="M${x} 116 c-16 -10 -20 -18 -14 -24 c5 -5 11 -2 14 3 c3 -5 9 -8 14 -3 c6 6 2 14 -14 24 Z" fill="none" stroke="${c}" stroke-width="6"/>`).join('')}<path d="M96 100 h8" stroke="${c}" stroke-width="6"/>` },
  goggles: { label: 'Goggles', draw: (c) => `<rect x="50" y="86" width="100" height="36" rx="18" fill="${c}"/><rect x="58" y="92" width="36" height="24" rx="12" fill="#cfefff"/><rect x="106" y="92" width="36" height="24" rx="12" fill="#cfefff"/>` },
};

/* ------------------------------------------------------------ definition */

export const CATEGORIES = [
  { id: 'skin', label: 'Skin', emoji: '🎨', colorKey: 'skin', colors: SKIN, view: '34 34 132 124' },
  { id: 'hair', label: 'Hair', emoji: '💇', styleKey: 'hairStyle', colorKey: 'hairColor', styles: HAIR_STYLES, colors: HAIR, view: '10 0 180 170' },
  { id: 'eyes', label: 'Eyes', emoji: '👀', styleKey: 'eyes', colorKey: 'eyeColor', styles: EYE_STYLES, colors: EYES, view: '50 74 100 60' },
  { id: 'mouth', label: 'Face', emoji: '😀', styleKey: 'mouth', styles: MOUTH_STYLES, view: '46 44 108 110', toggles: ['blush', 'freckles'] },
  { id: 'top', label: 'Top', emoji: '👕', styleKey: 'top', colorKey: 'topColor', styles: TOP_STYLES, colors: CLOTH, view: '36 140 128 128' },
  { id: 'bottom', label: 'Bottom', emoji: '👖', styleKey: 'bottom', colorKey: 'bottomColor', styles: BOTTOM_STYLES, colors: CLOTH, view: '46 210 108 108' },
  { id: 'shoes', label: 'Shoes', emoji: '👟', styleKey: 'shoes', colorKey: 'shoesColor', styles: SHOE_STYLES, colors: CLOTH, view: '46 258 108 70' },
  { id: 'hat', label: 'Hat', emoji: '🎩', styleKey: 'hat', colorKey: 'hatColor', styles: HAT_STYLES, colors: CLOTH, view: '10 0 180 160' },
  { id: 'glasses', label: 'Specs', emoji: '🕶️', styleKey: 'glasses', colorKey: 'glassesColor', styles: GLASS_STYLES, colors: CLOTH, view: '40 70 120 70' },
];

export const NAMES = ['Pip', 'Juno', 'Milo', 'Sora', 'Bean', 'Rue', 'Nico', 'Wren', 'Ollie', 'Kit', 'Suki', 'Remy', 'Ash', 'Tilly', 'Bo'];

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

// Every rendered pattern needs its own id — see the note in rooms.js.
let patternSeq = 0;

export function defaultCharacter(name = 'Pip') {
  return {
    id: uid('chr'),
    name,
    skin: SKIN[1],
    hairStyle: 'short', hairColor: HAIR[1],
    eyes: 'big', eyeColor: EYES[0],
    mouth: 'smile', blush: true, freckles: false,
    top: 'tee', topColor: CLOTH[0],
    bottom: 'pants', bottomColor: CLOTH[6],
    shoes: 'sneakers', shoesColor: CLOTH[10],
    hat: 'none', hatColor: CLOTH[2],
    glasses: 'none', glassesColor: CLOTH[11],
  };
}

export function randomCharacter(name) {
  const keys = (obj) => Object.keys(obj);
  return {
    ...defaultCharacter(name || pick(NAMES)),
    id: uid('chr'),
    skin: pick(SKIN),
    hairStyle: pick(keys(HAIR_STYLES)), hairColor: pick(HAIR),
    eyes: pick(keys(EYE_STYLES)), eyeColor: pick(EYES),
    mouth: pick(keys(MOUTH_STYLES)),
    blush: Math.random() > .4, freckles: Math.random() > .7,
    top: pick(keys(TOP_STYLES)), topColor: pick(CLOTH),
    bottom: pick(keys(BOTTOM_STYLES).filter((k) => k !== 'none')), bottomColor: pick(CLOTH),
    shoes: pick(keys(SHOE_STYLES)), shoesColor: pick(CLOTH),
    hat: Math.random() > .5 ? pick(keys(HAT_STYLES)) : 'none', hatColor: pick(CLOTH),
    glasses: Math.random() > .7 ? pick(keys(GLASS_STYLES)) : 'none', glassesColor: pick(CLOTH),
  };
}

/** Migrate/repair a character loaded from storage so unknown parts never crash. */
export function normalizeCharacter(raw) {
  const base = defaultCharacter(raw?.name || 'Pip');
  const c = { ...base, ...(raw || {}) };
  c.id = raw?.id || base.id;
  if (!HAIR_STYLES[c.hairStyle]) c.hairStyle = base.hairStyle;
  if (!EYE_STYLES[c.eyes]) c.eyes = base.eyes;
  if (!MOUTH_STYLES[c.mouth]) c.mouth = base.mouth;
  if (!TOP_STYLES[c.top]) c.top = base.top;
  if (!BOTTOM_STYLES[c.bottom]) c.bottom = base.bottom;
  if (!SHOE_STYLES[c.shoes]) c.shoes = base.shoes;
  if (!HAT_STYLES[c.hat]) c.hat = base.hat;
  if (!GLASS_STYLES[c.glasses]) c.glasses = base.glasses;
  return c;
}

/* -------------------------------------------------------------- renderer */

function legs(c, pose) {
  const skin = c.skin;
  const shoe = SHOE_STYLES[c.shoes] || SHOE_STYLES.none;
  const bottom = BOTTOM_STYLES[c.bottom] || BOTTOM_STYLES.none;
  const covered = (TOP_STYLES[c.top] || {}).coversLegs;

  const bare = `<rect x="${G.legLX}" y="${G.hipY - 6}" width="${G.legW}" height="${G.legH}" rx="11" fill="${skin}" class="pw-leg-l"/>
    <rect x="${G.legRX}" y="${G.hipY - 6}" width="${G.legW}" height="${G.legH}" rx="11" fill="${skin}" class="pw-leg-r"/>`;

  const stack = `${bare}${covered ? '' : bottom.draw(c.bottomColor)}${shoe.draw(c.shoesColor)}`;

  if (pose === 'sit') {
    // Knees come towards the viewer, so the legs read as foreshortened stubs
    // dangling over the front of the seat.
    return `<g class="pw-sit" transform="translate(100 ${G.hipY}) scale(1 .55) translate(-100 ${-G.hipY})">${stack}</g>`;
  }
  return stack;
}

function arms(c) {
  return `<g>
    <rect x="${G.armLX}" y="${G.armY}" width="${G.armW}" height="${G.armH}" rx="11" fill="${c.skin}" class="pw-arm-l"/>
    <rect x="${G.armRX}" y="${G.armY}" width="${G.armW}" height="${G.armH}" rx="11" fill="${c.skin}" class="pw-arm-r"/>
    <circle cx="${G.armLX + G.armW / 2}" cy="${G.armY + G.armH + 4}" r="13" fill="${c.skin}"/>
    <circle cx="${G.armRX + G.armW / 2}" cy="${G.armY + G.armH + 4}" r="13" fill="${c.skin}"/>
  </g>`;
}

function head(c) {
  const blush = c.blush
    ? `<ellipse cx="62" cy="122" rx="12" ry="8" fill="#ff8fab" opacity=".5"/><ellipse cx="138" cy="122" rx="12" ry="8" fill="#ff8fab" opacity=".5"/>` : '';
  const freckles = c.freckles
    ? [[70, 118], [78, 124], [86, 119], [114, 119], [122, 124], [130, 118]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${shade(c.skin, -.35)}" opacity=".7"/>`).join('') : '';

  return `<g class="pw-head">
    <ellipse cx="48" cy="104" rx="10" ry="12" fill="${c.skin}"/>
    <ellipse cx="152" cy="104" rx="10" ry="12" fill="${c.skin}"/>
    <ellipse cx="${G.headCx}" cy="${G.headCy}" rx="${G.headRx}" ry="${G.headRy}" fill="${c.skin}"/>
    <ellipse cx="${G.headCx}" cy="${G.headCy - 10}" rx="${G.headRx - 8}" ry="${G.headRy - 16}" fill="${shade(c.skin, .12)}" opacity=".5"/>
    ${blush}${freckles}
    ${(EYE_STYLES[c.eyes] || EYE_STYLES.big).draw(c.eyeColor)}
    <ellipse cx="100" cy="118" rx="5" ry="4" fill="${shade(c.skin, -.2)}" opacity=".6"/>
    ${(MOUTH_STYLES[c.mouth] || MOUTH_STYLES.smile).draw()}
  </g>`;
}

/**
 * Inner markup for a character, drawn in the 200x340 avatar space with the
 * feet resting on y = 314.
 */
export function avatarInner(character, pose = 'idle') {
  const c = normalizeCharacter(character);
  const hair = HAIR_STYLES[c.hairStyle] || HAIR_STYLES.short;
  const top = TOP_STYLES[c.top] || TOP_STYLES.tee;
  const hat = HAT_STYLES[c.hat] || HAT_STYLES.none;
  const glasses = GLASS_STYLES[c.glasses] || GLASS_STYLES.none;

  return `
    ${hair.back ? `<g class="pw-hair-back">${hair.back(c.hairColor)}</g>` : ''}
    <g class="pw-body">
      ${legs(c, pose)}
      <rect x="${G.torsoX}" y="${G.torsoY}" width="${G.torsoW}" height="${G.torsoH}" rx="28" fill="${c.skin}"/>
      <rect x="86" y="132" width="28" height="26" rx="12" fill="${shade(c.skin, -.08)}"/>
      ${arms(c)}
      <g class="pw-top">${top.draw(c.topColor)}</g>
      ${head(c)}
    </g>
    ${hair.front ? `<g class="pw-hair-front">${hair.front(c.hairColor)}</g>` : ''}
    <g class="pw-glasses">${glasses.draw(c.glassesColor)}</g>
    <g class="pw-hat">${hat.draw(c.hatColor)}</g>`;
}

/**
 * A complete <svg> for a character.
 * opts: { pose, view, className, width, height, shadow }
 */
export function avatarSVG(character, opts = {}) {
  const {
    pose = 'idle',
    view = `0 0 ${VIEW.w} ${VIEW.h}`,
    className = '',
    shadow = false,
  } = opts;
  const shadowArt = shadow ? `<ellipse cx="100" cy="318" rx="56" ry="12" fill="#40302b" opacity=".16"/>` : '';
  return `<svg class="pw-avatar ${pose} ${className}" viewBox="${view}" preserveAspectRatio="xMidYMax meet"
    xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(character?.name || 'character')}">
    ${shadowArt}${avatarInner(character, pose)}</svg>`;
}

/** Thumbnail for one option in the creator tray. */
export function optionThumb(character, category, styleId) {
  const draft = { ...character };
  if (category.styleKey) draft[category.styleKey] = styleId;
  return avatarSVG(draft, { view: category.view });
}

export const STYLE_SETS = {
  hair: HAIR_STYLES, eyes: EYE_STYLES, mouth: MOUTH_STYLES, top: TOP_STYLES,
  bottom: BOTTOM_STYLES, shoes: SHOE_STYLES, hat: HAT_STYLES, glasses: GLASS_STYLES,
};
