// Turns a saved room into SVG: the shell, the furniture in depth order and
// any characters standing in it.

import { ROOM, roomShell, CHAR_SCALE } from './rooms.js';
import { getItem, itemArt, placeTransform, itemBounds } from './furniture.js';
import { avatarInner } from './avatar.js';
import { esc } from '../util.js';

/** Items in draw order: wall pieces first, then by depth (y), then by layer. */
export function sortedItems(room) {
  return room.items
    .map((placed, index) => ({ placed, index, def: getItem(placed.def) }))
    .filter((entry) => entry.def)
    .sort((a, b) => {
      const wallA = a.def.anchor === 'wall' ? 0 : 1;
      const wallB = b.def.anchor === 'wall' ? 0 : 1;
      if (wallA !== wallB) return wallA - wallB;
      const zA = a.placed.z || 0, zB = b.placed.z || 0;
      if (zA !== zB) return zA - zB;
      if (a.placed.y !== b.placed.y) return a.placed.y - b.placed.y;
      return a.index - b.index;
    });
}

export function itemGroup({ placed, def }, { interactive = false } = {}) {
  const shadow = def.anchor === 'wall'
    ? ''
    : `<ellipse cx="0" cy="0" rx="${(def.w * (placed.scale || 1)) / 2.4}" ry="${10 * (placed.scale || 1)}" fill="#40302b" opacity=".13"
         transform="translate(${placed.x} ${placed.y})"/>`;
  return `${shadow}<g class="item" data-uid="${placed.uid}" ${interactive ? '' : 'pointer-events="none"'}
    transform="${placeTransform(def, placed)}">${itemArt(def, placed.tint, placed.on)}</g>`;
}

/** Everything inside a room's <svg>, minus characters. */
export function roomInner(room, opts = {}) {
  const items = sortedItems(room).map((entry) => itemGroup(entry, opts)).join('');
  return `${roomShell(room.style)}${items}`;
}

/** One character standing (or sitting) in room space. */
export function characterGroup(character, { x, y, facing = 1, pose = 'idle', walking = false, scale = CHAR_SCALE, id = '' } = {}) {
  const sx = facing < 0 ? -scale : scale;
  return `<g class="pw-avatar ${walking ? 'walking' : pose}" ${id ? `id="${id}"` : ''} pointer-events="none"
      transform="translate(${x} ${y}) scale(${sx} ${scale}) translate(-100 -340)"
      aria-label="${esc(character.name)}">
      <ellipse cx="100" cy="332" rx="52" ry="11" fill="#40302b" opacity=".16"/>
      ${avatarInner(character, pose)}
    </g>`;
}

/** Complete room <svg> markup — used for menu thumbnails. */
export function roomThumb(room, character = null) {
  const cast = character
    ? characterGroup(character, { x: 760, y: 620, scale: CHAR_SCALE * 0.9 })
    : '';
  return `<svg viewBox="0 0 ${ROOM.w} ${ROOM.h}" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice" style="border-radius:14px">${roomInner(room)}${cast}</svg>`;
}

/** Hit test in room coords, front-most first. */
export function hitTest(room, x, y) {
  const entries = sortedItems(room);
  for (let i = entries.length - 1; i >= 0; i--) {
    const { placed, def } = entries[i];
    const b = itemBounds(def, placed);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return placed;
  }
  return null;
}

export { ROOM, CHAR_SCALE };
