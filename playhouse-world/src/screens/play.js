// Play mode: your character walks around the room you built, sits on things
// and switches things on.

import { el, clamp, toSvgPoint, onDrag } from '../util.js';
import { state, commit, activeCharacter, activeHouse, activeRoom } from '../store.js';
import { ROOM, CHAR_SCALE, roomShell } from '../art/rooms.js';
import { getItem, itemArt, placeTransform, localToRoom } from '../art/furniture.js';
import { sortedItems, hitTest } from '../art/scene.js';
import { avatarInner } from '../art/avatar.js';
import { button, topBar, toast } from '../ui/components.js';
import { play } from '../ui/sound.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPEED = 420;            // room units per second
const HIP_DROP = 112 * CHAR_SCALE;

export function createPlayScreen(app) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ROOM.w} ${ROOM.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'stage__svg');

  const bubble = el('div', { class: 'bubble' });
  const stage = el('div', { class: 'stage stage--room' }, [svg, bubble]);

  const bar = topBar({
    title: 'Play',
    onBack: () => app.go('home'),
    right: [
      button('🚪', { round: true, title: 'Next room', sound: 'woosh', onTap: nextRoom }),
      button('🙂', { round: true, title: 'Next character', sound: 'pop', onTap: nextCharacter }),
      button('🛠️', { round: true, variant: 'sky', title: 'Decorate', onTap: () => app.go('house') }),
    ],
  });
  const root = el('section', { class: 'screen screen--play' }, [bar, stage]);
  const titleNode = bar.querySelector('.topbar__title');

  let charNode = null;
  let depths = [];              // furniture in draw order, for depth sorting
  let hero = { x: 500, y: 600, facing: 1, pose: 'idle' };
  let target = null;           // { x, y, then }
  let raf = 0;
  let bubbleTimer = 0;

  /* --------------------------------------------------------------- scene */

  function drawScene() {
    const room = activeRoom();
    svg.innerHTML = '';

    const shell = document.createElementNS(SVG_NS, 'g');
    shell.setAttribute('pointer-events', 'none');
    shell.innerHTML = roomShell(room.style);
    svg.append(shell);

    for (const { placed, def } of sortedItems(room)) {
      const shadow = def.anchor === 'wall' ? '' :
        `<ellipse cx="${placed.x}" cy="${placed.y}" rx="${(def.w * (placed.scale || 1)) / 2.4}" ry="${10 * (placed.scale || 1)}" fill="#40302b" opacity=".13"/>`;
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('data-uid', placed.uid);
      group.setAttribute('data-def', placed.def);
      group.innerHTML = `${shadow}<g transform="${placeTransform(def, placed)}">${itemArt(def, placed.tint, placed.on)}</g>`;
      svg.append(group);
    }

    depths = [...svg.querySelectorAll('g[data-uid]')].map((node) => {
      const placed = room.items.find((it) => it.uid === node.dataset.uid);
      const def = placed && getItem(placed.def);
      return { node, y: def?.anchor === 'wall' ? -1 : (placed?.y ?? 0) };
    });

    charNode = document.createElementNS(SVG_NS, 'g');
    charNode.setAttribute('class', 'pw-avatar idle');
    charNode.setAttribute('pointer-events', 'none');
    charNode.innerHTML = `<ellipse cx="100" cy="332" rx="52" ry="11" fill="#40302b" opacity=".16"/>${avatarInner(activeCharacter(), hero.pose)}`;
    svg.append(charNode);
    placeHero();
  }

  /** Stand in front of what is nearer the front of the room, behind the rest. */
  function resortHero() {
    const ahead = depths.find((entry) => entry.y > hero.y);
    if (ahead) {
      if (charNode.nextSibling !== ahead.node) svg.insertBefore(charNode, ahead.node);
    } else if (svg.lastChild !== charNode) {
      svg.append(charNode);
    }
  }

  function redrawItem(placed) {
    const def = getItem(placed.def);
    const node = svg.querySelector(`g[data-uid="${placed.uid}"]`);
    if (!node || !def) return;
    const shadow = def.anchor === 'wall' ? '' :
      `<ellipse cx="${placed.x}" cy="${placed.y}" rx="${(def.w * (placed.scale || 1)) / 2.4}" ry="${10 * (placed.scale || 1)}" fill="#40302b" opacity=".13"/>`;
    node.innerHTML = `${shadow}<g transform="${placeTransform(def, placed)}">${itemArt(def, placed.tint, placed.on)}</g>`;
  }

  function placeHero() {
    if (!charNode) return;
    const s = CHAR_SCALE;
    charNode.setAttribute('transform',
      `translate(${hero.x} ${hero.y}) scale(${hero.facing < 0 ? -s : s} ${s}) translate(-100 -340)`);
    resortHero();
  }

  function setPose(pose) {
    if (hero.pose === pose) return;
    hero.pose = pose;
    charNode.innerHTML = `<ellipse cx="100" cy="332" rx="52" ry="11" fill="#40302b" opacity=".16"/>${avatarInner(activeCharacter(), pose)}`;
  }

  /* -------------------------------------------------------------- moving */

  function walkTo(x, y, then = null) {
    target = { x: clamp(x, 60, ROOM.w - 60), y: clamp(y, ROOM.floorY + 20, ROOM.h - 10), then };
    setPose('idle');
    charNode.classList.add('walking');
    charNode.classList.remove('idle');
  }

  function stopWalking() {
    charNode.classList.remove('walking');
    charNode.classList.add('idle');
  }

  let lastFrame = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    if (!target) return;

    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      hero.x = target.x;
      hero.y = target.y;
      const then = target.then;
      target = null;
      stopWalking();
      placeHero();
      then?.();
      return;
    }
    if (Math.abs(dx) > 4) hero.facing = dx > 0 ? 1 : -1;
    const step = Math.min(dist, SPEED * dt);
    hero.x += (dx / dist) * step;
    hero.y += (dy / dist) * step;
    placeHero();
    updateBubblePosition();
  }

  /* --------------------------------------------------------- interaction */

  function say(text) {
    bubble.textContent = text;
    bubble.classList.add('bubble--show');
    updateBubblePosition();
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('bubble--show'), 1800);
  }

  function updateBubblePosition() {
    if (!bubble.classList.contains('bubble--show')) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const headY = hero.y - 330 * CHAR_SCALE;
    const cx = hero.x * ctm.a + headY * ctm.c + ctm.e;
    const cy = hero.x * ctm.b + headY * ctm.d + ctm.f;
    const box = stage.getBoundingClientRect();
    bubble.style.left = `${cx - box.left}px`;
    bubble.style.top = `${cy - box.top}px`;
  }

  function interact(placed) {
    const def = getItem(placed.def);
    if (!def) return;

    if (def.sit) {
      const seat = localToRoom(def, placed, def.sit.x, def.sit.y);
      const approachFrom = hero.x < seat.x ? -1 : 1;
      walkTo(seat.x + approachFrom * 90, Math.max(seat.y + 40, ROOM.floorY + 20), () => {
        hero.x = seat.x;
        hero.y = clamp(seat.y + HIP_DROP, ROOM.floorY + 20, ROOM.h + 20);
        hero.facing = approachFrom < 0 ? 1 : -1;
        setPose('sit');
        placeHero();
        play('pop');
        say('Comfy!');
      });
      return;
    }

    if (def.toggle) {
      const front = localToRoom(def, placed, def.w / 2, def.h);
      walkTo(front.x + (hero.x < front.x ? -110 : 110), Math.max(front.y + 20, ROOM.floorY + 20), () => {
        placed.on = !placed.on;
        commit();
        redrawItem(placed);
        play(placed.on ? 'sparkle' : 'pop');
        say(placed.on ? def.toggle : 'All off');
      });
      return;
    }

    if (def.say) {
      const front = localToRoom(def, placed, def.w / 2, def.h);
      walkTo(front.x + (hero.x < front.x ? -100 : 100), Math.max(front.y + 10, ROOM.floorY + 20), () => {
        play('happy');
        say(def.say);
      });
      return;
    }

    // Anything else: just wander over to it.
    walkTo(placed.x, Math.max(placed.y, ROOM.floorY + 20));
  }

  /** True when a room point lands on the character themself. */
  function overHero(x, y) {
    const halfWidth = 100 * CHAR_SCALE;
    return Math.abs(x - hero.x) < halfWidth && y < hero.y + 10 && y > hero.y - 330 * CHAR_SCALE;
  }

  let carry = null;   // dragging the character around with a finger

  onDrag(svg, {
    onStart(event) {
      const point = toSvgPoint(svg, event.clientX, event.clientY);

      if (overHero(point.x, point.y)) {
        carry = { dx: hero.x - point.x, dy: hero.y - point.y, moved: 0 };
        target = null;
        setPose('idle');
        stopWalking();
        play('pop');
        return;
      }

      const hit = hitTest(activeRoom(), point.x, point.y);
      if (hit) { interact(hit); return; }
      setPose('idle');
      walkTo(point.x, point.y < ROOM.floorY ? ROOM.floorY + 60 : point.y);
    },

    onMove(event) {
      if (!carry) return;
      const point = toSvgPoint(svg, event.clientX, event.clientY);
      const nx = clamp(point.x + carry.dx, 60, ROOM.w - 60);
      const ny = clamp(point.y + carry.dy, ROOM.floorY + 20, ROOM.h - 10);
      carry.moved += Math.abs(nx - hero.x) + Math.abs(ny - hero.y);
      if (Math.abs(nx - hero.x) > 3) hero.facing = nx > hero.x ? 1 : -1;
      hero.x = nx;
      hero.y = ny;
      placeHero();
      updateBubblePosition();
    },

    onEnd() {
      if (!carry) return;
      const wasTap = carry.moved < 8;
      carry = null;
      if (wasTap) { play('happy'); say(`Hello! I'm ${activeCharacter().name}.`); }
      else play('place');
    },
  });

  /* ------------------------------------------------------------ chrome */

  function nextRoom() {
    const house = activeHouse();
    const index = house.rooms.findIndex((r) => r.id === state.activeRoomId);
    const room = house.rooms[(index + 1) % house.rooms.length];
    state.activeRoomId = room.id;
    commit();
    hero = { x: ROOM.w * 0.35, y: ROOM.h - 24, facing: 1, pose: 'idle' };
    target = null;
    drawScene();
    drawTitle();
    toast(stage, room.name);
  }

  function nextCharacter() {
    const index = state.characters.findIndex((c) => c.id === state.activeCharacterId);
    const next = state.characters[(index + 1) % state.characters.length];
    state.activeCharacterId = next.id;
    commit();
    hero.pose = 'idle';
    drawScene();
    drawTitle();
    say(`Hi, I'm ${next.name}!`);
  }

  function drawTitle() {
    titleNode.textContent = `${activeRoom().name} · ${activeCharacter().name}`;
  }

  function enter() {
    hero = { x: ROOM.w * 0.35, y: ROOM.h - 24, facing: 1, pose: 'idle' };
    target = null;
    drawTitle();
    drawScene();
    stopWalking();
    cancelAnimationFrame(raf);
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
    play('happy');
    setTimeout(() => toast(stage, 'Tap the floor to walk · tap things to use them'), 400);
  }

  function leave() {
    cancelAnimationFrame(raf);
    raf = 0;
    bubble.classList.remove('bubble--show');
  }

  window.addEventListener('resize', updateBubblePosition);

  return { el: root, enter, leave };
}
