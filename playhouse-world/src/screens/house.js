// House builder: tap a thing to add it, drag it around, pinch to resize,
// paint it, flip it, stack it. Auto-saves after every change.

import { el, clamp, uid, clone, toSvgPoint, onDrag, pinchSpan } from '../util.js';
import { state, commit, activeHouse, activeRoom, addRoom, deleteRoom } from '../store.js';
import { ROOM, WALL_PATTERNS, FLOOR_PATTERNS, styleThumb, roomShell } from '../art/rooms.js';
import { WALLS, FLOORS } from '../art/palette.js';
import { CATS, FURNITURE, getItem, itemArt, itemThumb, itemBounds } from '../art/furniture.js';
import { sortedItems, hitTest } from '../art/scene.js';
import { button, topBar, tabButton, swatch, optionTile, askSheet, toast } from '../ui/components.js';
import { play } from '../ui/sound.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createHouseScreen(app) {
  let catId = 'living';
  let selected = null;          // uid of the selected item
  let undoStack = [];

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ROOM.w} ${ROOM.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'stage__svg');

  const handles = el('div', { class: 'handles', hidden: true });
  const stage = el('div', { class: 'stage stage--room' }, [svg, handles]);

  const roomTabs = el('div', { class: 'roomtabs' });
  const tabs = el('div', { class: 'tabs' });
  const paintRow = el('div', { class: 'options swatch-row', hidden: true });
  const optionsRow = el('div', { class: 'options' });
  const styleBox = el('div', { hidden: true });
  const tray = el('div', { class: 'tray' }, [roomTabs, tabs, paintRow, optionsRow, styleBox]);
  const bodyWrap = el('div', { class: 'screen__body' }, [stage, tray]);

  const bar = topBar({
    title: 'House',
    onBack: () => app.go('home'),
    right: [
      button('↩︎', { round: true, title: 'Undo', onTap: undo }),
      button('▶️', { round: true, variant: 'mint', title: 'Play', sound: 'happy', onTap: () => app.go('play') }),
    ],
  });
  const root = el('section', { class: 'screen screen--editor' }, [bar, bodyWrap]);
  const titleNode = bar.querySelector('.topbar__title');

  /* ------------------------------------------------------------- history */

  function pushUndo() {
    undoStack.push(clone(activeRoom().items));
    if (undoStack.length > 40) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length) { toast(stage, 'Nothing to undo'); return; }
    activeRoom().items = undoStack.pop();
    selected = null;
    commit();
    drawScene();
    drawTray();
    toast(stage, 'Undone');
  }

  /* --------------------------------------------------------------- scene */

  function itemNode(placed, def) {
    const s = placed.scale || 1;
    const wrap = document.createElementNS(SVG_NS, 'g');
    wrap.setAttribute('data-uid', placed.uid);
    wrap.setAttribute('data-def', placed.def);
    wrap.setAttribute('transform', `translate(${placed.x} ${placed.y})`);

    if (def.anchor !== 'wall') {
      const shadow = document.createElementNS(SVG_NS, 'ellipse');
      shadow.setAttribute('rx', (def.w * s) / 2.4);
      shadow.setAttribute('ry', 10 * s);
      shadow.setAttribute('fill', '#40302b');
      shadow.setAttribute('opacity', '.13');
      shadow.setAttribute('class', 'shadow');
      wrap.append(shadow);
    }

    const art = document.createElementNS(SVG_NS, 'g');
    art.setAttribute('class', 'art');
    art.setAttribute('transform', `scale(${placed.flip ? -s : s} ${s}) translate(${-def.w / 2} ${-def.h})`);
    art.innerHTML = itemArt(def, placed.tint, placed.on);
    wrap.append(art);
    return wrap;
  }

  function drawScene() {
    const room = activeRoom();
    svg.innerHTML = '';

    const shell = document.createElementNS(SVG_NS, 'g');
    shell.innerHTML = `${roomShellMarkup(room)}`;
    shell.setAttribute('pointer-events', 'none');
    svg.append(shell);

    for (const entry of sortedItems(room)) svg.append(itemNode(entry.placed, entry.def));

    const box = document.createElementNS(SVG_NS, 'rect');
    box.setAttribute('class', 'sel-box');
    box.setAttribute('rx', '14');
    box.setAttribute('pointer-events', 'none');
    box.setAttribute('id', 'selbox');
    svg.append(box);
    updateSelectionBox();
  }

  // The wall/floor markup only changes when the room style does.
  let lastShellKey = '';
  let lastShell = '';
  function roomShellMarkup(room) {
    const key = JSON.stringify(room.style);
    if (key !== lastShellKey) {
      lastShellKey = key;
      lastShell = roomShell(room.style);
    }
    return lastShell;
  }

  function findPlaced(id) {
    return activeRoom().items.find((it) => it.uid === id) || null;
  }

  function updateSelectionBox() {
    const box = svg.querySelector('#selbox');
    if (!box) return;
    const placed = selected && findPlaced(selected);
    if (!placed) {
      box.setAttribute('width', '0');
      box.setAttribute('height', '0');
      handles.hidden = true;
      return;
    }
    const def = getItem(placed.def);
    const b = itemBounds(def, placed);
    box.setAttribute('x', b.x - 10);
    box.setAttribute('y', b.y - 10);
    box.setAttribute('width', b.w + 20);
    box.setAttribute('height', b.h + 20);
    handles.hidden = false;
  }

  function select(id) {
    selected = id;
    updateSelectionBox();
    drawPaintRow();
  }

  /* ------------------------------------------------------------ dragging */

  let drag = null;

  onDrag(svg, {
    onStart(event, pointers) {
      const point = toSvgPoint(svg, event.clientX, event.clientY);
      const group = event.target.closest?.('g[data-uid]');
      const hit = group ? findPlaced(group.dataset.uid) : hitTest(activeRoom(), point.x, point.y);

      if (!hit) { select(null); drag = null; return; }

      if (hit.uid !== selected) { play('pop'); select(hit.uid); }
      pushUndo();
      drag = {
        uid: hit.uid,
        dx: hit.x - point.x,
        dy: hit.y - point.y,
        startScale: hit.scale || 1,
        startSpan: 0,
        moved: 0,
      };
      svg.querySelector(`g[data-uid="${hit.uid}"]`)?.classList.add('ghost-item');
    },

    onMove(event, pointers) {
      if (!drag) return;
      const placed = findPlaced(drag.uid);
      if (!placed) return;
      const def = getItem(placed.def);

      if (pointers.size >= 2) {
        const span = pinchSpan(pointers);
        if (!drag.startSpan) { drag.startSpan = span; drag.startScale = placed.scale || 1; }
        if (span > 0 && drag.startSpan > 0) {
          placed.scale = clamp(drag.startScale * (span / drag.startSpan), 0.35, 2.4);
          refreshNode(placed, def);
          updateSelectionBox();
        }
        return;
      }

      const point = toSvgPoint(svg, event.clientX, event.clientY);
      const nx = clamp(point.x + drag.dx, 40, ROOM.w - 40);
      const ny = def.anchor === 'wall'
        ? clamp(point.y + drag.dy, 90, ROOM.floorY - 6)
        : clamp(point.y + drag.dy, ROOM.floorY + 12, ROOM.h - 8);
      drag.moved += Math.abs(nx - placed.x) + Math.abs(ny - placed.y);
      placed.x = nx;
      placed.y = ny;
      svg.querySelector(`g[data-uid="${placed.uid}"]`)?.setAttribute('transform', `translate(${nx} ${ny})`);
      updateSelectionBox();
    },

    onEnd() {
      if (!drag) return;
      svg.querySelector(`g[data-uid="${drag.uid}"]`)?.classList.remove('ghost-item');
      if (drag.moved < 2) undoStack.pop();   // a tap, not a move: no undo step
      else play('place');
      drag = null;
      commit();
      drawScene();                            // re-sort depth
    },
  });

  function refreshNode(placed, def) {
    const node = svg.querySelector(`g[data-uid="${placed.uid}"]`);
    if (!node) return;
    const s = placed.scale || 1;
    node.setAttribute('transform', `translate(${placed.x} ${placed.y})`);
    node.querySelector('.art')?.setAttribute('transform',
      `scale(${placed.flip ? -s : s} ${s}) translate(${-def.w / 2} ${-def.h})`);
    const shadow = node.querySelector('.shadow');
    if (shadow) { shadow.setAttribute('rx', (def.w * s) / 2.4); shadow.setAttribute('ry', 10 * s); }
    const art = node.querySelector('.art');
    if (art) art.innerHTML = itemArt(def, placed.tint, placed.on);
  }

  /* ------------------------------------------------------------- handles */

  function withSelected(fn, { history = true } = {}) {
    const placed = selected && findPlaced(selected);
    if (!placed) return;
    if (history) pushUndo();
    fn(placed, getItem(placed.def));
    commit();
    drawScene();
  }

  function buildHandles() {
    handles.replaceChildren(
      button('➖', { round: true, title: 'Smaller', sound: 'pop', onTap: () => withSelected((p, d) => { p.scale = clamp((p.scale || 1) - .12, .35, 2.4); }) }),
      button('➕', { round: true, title: 'Bigger', sound: 'pop', onTap: () => withSelected((p) => { p.scale = clamp((p.scale || 1) + .12, .35, 2.4); }) }),
      button('🔁', { round: true, title: 'Flip', sound: 'pop', onTap: () => withSelected((p) => { p.flip = !p.flip; }) }),
      button('⬆️', { round: true, title: 'Bring forward', sound: 'pop', onTap: () => withSelected((p) => { p.z = (p.z || 0) + 1; }) }),
      button('⬇️', { round: true, title: 'Send back', sound: 'pop', onTap: () => withSelected((p) => { p.z = (p.z || 0) - 1; }) }),
      button('❐', { round: true, title: 'Duplicate', sound: 'sparkle', onTap: duplicate }),
      button('🗑️', { round: true, title: 'Remove', sound: 'woosh', onTap: removeSelected }),
    );
  }

  function duplicate() {
    const placed = selected && findPlaced(selected);
    if (!placed) return;
    pushUndo();
    const copy = { ...clone(placed), uid: uid('it'), x: clamp(placed.x + 60, 40, ROOM.w - 40) };
    activeRoom().items.push(copy);
    selected = copy.uid;
    commit();
    drawScene();
  }

  function removeSelected() {
    const placed = selected && findPlaced(selected);
    if (!placed) return;
    pushUndo();
    const room = activeRoom();
    room.items = room.items.filter((it) => it.uid !== placed.uid);
    selected = null;
    commit();
    drawScene();
    drawPaintRow();
    toast(stage, 'Taken away');
  }

  /* ----------------------------------------------------------------- add */

  function addItem(def) {
    pushUndo();
    const room = activeRoom();
    const placed = {
      uid: uid('it'),
      def: def.id,
      x: ROOM.w / 2 + (Math.random() * 120 - 60),
      y: def.anchor === 'wall' ? 240 : ROOM.h - 60,
      scale: 1,
      z: 0,
      flip: false,
      tint: def.tint,
      on: false,
    };
    room.items.push(placed);
    selected = placed.uid;
    commit();
    drawScene();
    drawPaintRow();
    toast(stage, `${def.name} — drag it where you like`);
  }

  /* ---------------------------------------------------------------- tray */

  function drawRoomTabs() {
    const house = activeHouse();
    roomTabs.replaceChildren(
      ...house.rooms.map((room) => tabButton(room.name, '', room.id === state.activeRoomId, () => {
        state.activeRoomId = room.id;
        selected = null;
        undoStack = [];
        commit();
        drawTitle();
        drawScene();
        drawTray();
      })),
      tabButton('＋ Room', '', false, async () => {
        const name = await askSheet(app.root, { title: 'New room', value: '', placeholder: 'Room name', confirm: 'Build it' });
        if (name === null) return;
        addRoom(name || 'New room');
        selected = null;
        undoStack = [];
        drawTitle();
        drawScene();
        drawTray();
      }),
    );
  }

  function drawPaintRow() {
    const placed = selected && findPlaced(selected);
    if (!placed) { paintRow.hidden = true; paintRow.replaceChildren(); return; }
    const def = getItem(placed.def);
    paintRow.hidden = false;
    paintRow.replaceChildren(
      el('span', { style: 'font-size:13px;color:var(--ink-soft);padding:0 4px', text: `${def.name}:` }),
      ...def.palette.map((color) => swatch(color, (placed.tint || def.tint) === color, () => {
        pushUndo();
        placed.tint = color;
        commit();
        refreshNode(placed, def);
      })),
    );
  }

  function strip(label, nodes) {
    return el('div', { style: 'padding:2px 0' }, [
      el('div', { style: 'font-size:12px;color:var(--ink-soft);padding:0 14px 2px', text: label }),
      el('div', { class: 'options' }, nodes),
    ]);
  }

  function drawRoomStyle() {
    const room = activeRoom();
    const setStyle = (patch) => {
      pushUndo();
      Object.assign(room.style, patch);
      commit();
      drawScene();
      drawRoomStyle();
    };

    styleBox.hidden = false;
    styleBox.replaceChildren(
      strip('Wallpaper', Object.entries(WALL_PATTERNS).map(([id, p]) =>
        optionTile(styleThumb('wall', id, room.style.wall), {
          label: p.label, on: room.style.wallPattern === id, onTap: () => setStyle({ wallPattern: id }),
        }))),
      strip('Wall colour', WALLS.map((color) =>
        swatch(color, room.style.wall === color, () => setStyle({ wall: color })))),
      strip('Floor', Object.entries(FLOOR_PATTERNS).map(([id, p]) =>
        optionTile(styleThumb('floor', id, room.style.floor), {
          label: p.label, on: room.style.floorPattern === id, onTap: () => setStyle({ floorPattern: id }),
        }))),
      strip('Floor colour', FLOORS.map((color) =>
        swatch(color, room.style.floor === color, () => setStyle({ floor: color })))),
      el('div', { class: 'options' }, [
        button('✏️ Rename room', { onTap: renameRoom }),
        button('🧹 Empty room', { onTap: emptyRoom }),
        button('🗑️ Delete room', { variant: 'berry', onTap: removeRoom }),
      ]),
    );
  }

  async function renameRoom() {
    const room = activeRoom();
    const name = await askSheet(app.root, { title: 'Room name', value: room.name, confirm: 'Save' });
    if (name) { room.name = name; commit(); drawTitle(); drawRoomTabs(); }
  }

  async function emptyRoom() {
    const sure = await askSheet(app.root, { title: 'Empty this room?', prompt: 'Every piece goes away.', confirm: 'Empty it', cancel: 'Keep', danger: true });
    if (!sure) return;
    pushUndo();
    activeRoom().items = [];
    selected = null;
    commit();
    drawScene();
    drawPaintRow();
  }

  async function removeRoom() {
    const room = activeRoom();
    const sure = await askSheet(app.root, { title: `Knock down ${room.name}?`, confirm: 'Delete', cancel: 'Keep', danger: true });
    if (!sure) return;
    if (!deleteRoom(room.id)) { toast(stage, 'A house needs one room'); return; }
    selected = null;
    undoStack = [];
    drawTitle();
    drawScene();
    drawTray();
  }

  function drawTray() {
    drawRoomTabs();
    tabs.replaceChildren(
      ...CATS.map((cat) => tabButton(cat.label, cat.emoji, cat.id === catId, () => { catId = cat.id; drawTray(); })),
      tabButton('Room', '🎨', catId === 'style', () => { catId = 'style'; drawTray(); }),
    );

    if (catId === 'style') {
      optionsRow.hidden = true;
      optionsRow.replaceChildren();
      drawRoomStyle();
    } else {
      styleBox.hidden = true;
      styleBox.replaceChildren();
      optionsRow.hidden = false;
      optionsRow.replaceChildren(...FURNITURE.filter((def) => def.cat === catId).map((def) =>
        optionTile(itemThumb(def, def.tint), { label: def.name, on: false, onTap: () => addItem(def) })));
    }
    drawPaintRow();
  }

  function drawTitle() {
    titleNode.textContent = `${activeHouse().name} · ${activeRoom().name}`;
  }

  function enter() {
    selected = null;
    undoStack = [];
    lastShellKey = '';
    buildHandles();
    drawTitle();
    drawScene();
    drawTray();
    play('woosh');
    setTimeout(() => toast(stage, 'Tap a thing to pick it up · pinch to resize'), 400);
  }

  return { el: root, enter, leave() { selected = null; } };
}
