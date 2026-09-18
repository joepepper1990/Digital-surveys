// Persistent game state: characters, houses and what is on screen right now.
// Everything lives in localStorage so the app works completely offline.

import { uid } from './util.js';
import { defaultCharacter, randomCharacter, normalizeCharacter } from './art/avatar.js';
import { ROOM_PRESETS } from './art/rooms.js';
import { getItem } from './art/furniture.js';

const KEY = 'playhouse.save.v1';
const VERSION = 1;

const place = (def, x, y, extra = {}) => ({ uid: uid('it'), def, x, y, scale: 1, z: 0, flip: false, on: false, ...extra });

function starterRooms() {
  const room = (preset, items) => ({
    id: uid('rm'),
    name: preset.name,
    style: { wall: preset.wall, wallPattern: preset.wallPattern, floor: preset.floor, floorPattern: preset.floorPattern },
    items,
  });

  return [
    room(ROOM_PRESETS[0], [
      place('window', 520, 250),
      place('rug', 340, 616),
      place('tv', 790, 520, { scale: .85 }),
      place('bookshelf', 900, 600, { scale: .8 }),
      place('sofa', 330, 604),
      place('coffeeTable', 590, 630, { scale: .8 }),
      place('plant', 120, 610, { scale: .9 }),
      place('cat', 660, 596, { scale: .8 }),
    ]),
    room(ROOM_PRESETS[1], [
      place('picture', 330, 220, { scale: .9 }),
      place('bed', 300, 610),
      place('nightstand', 560, 604),
      place('wardrobe', 820, 606, { scale: .9 }),
      place('teddy', 570, 462, { scale: .7 }),
      place('toybox', 640, 636, { scale: .8 }),
    ]),
    room(ROOM_PRESETS[2], [
      place('cupboard', 300, 230, { scale: .9 }),
      place('counter', 220, 606),
      place('stove', 450, 606),
      place('fridge', 660, 606, { scale: .95 }),
      place('kitchenTable', 860, 640, { scale: .85 }),
      place('chair', 700, 640, { scale: .8 }),
      place('cake', 860, 500, { scale: .6 }),
    ]),
    room(ROOM_PRESETS[3], [
      place('towels', 880, 250, { scale: .9 }),
      place('bath', 300, 616),
      place('toilet', 620, 606),
      place('basin', 830, 606, { scale: .9 }),
      place('duck', 430, 470, { scale: .55 }),
    ]),
    room(ROOM_PRESETS[4], [
      place('tree', 190, 600, { scale: .95 }),
      place('fence', 880, 560, { scale: .9 }),
      place('swing', 560, 600, { scale: .9 }),
      place('flowers', 830, 636, { scale: .9 }),
      place('bush', 420, 636, { scale: .8 }),
    ]),
    room(ROOM_PRESETS[5], [
      place('bunting', 500, 150, { scale: .9 }),
      place('easel', 220, 620, { scale: .9 }),
      place('drums', 470, 636, { scale: .9 }),
      place('beanbag', 700, 636, { scale: .9 }),
      place('balloons', 900, 600, { scale: .8 }),
      place('dog', 560, 640, { scale: .8 }),
    ]),
  ];
}

function starterState() {
  const hero = defaultCharacter('Pip');
  const friend = randomCharacter('Juno');
  const house = { id: uid('hs'), name: 'My house', rooms: starterRooms() };
  return {
    version: VERSION,
    characters: [hero, friend],
    houses: [house],
    activeCharacterId: hero.id,
    activeHouseId: house.id,
    activeRoomId: house.rooms[0].id,
    sound: true,
  };
}

/** Repair anything missing or unknown so an old save never breaks the app. */
function normalize(raw) {
  const fresh = starterState();
  if (!raw || typeof raw !== 'object') return fresh;

  const state = { ...fresh, ...raw, version: VERSION };
  state.characters = Array.isArray(raw.characters) && raw.characters.length
    ? raw.characters.map(normalizeCharacter)
    : fresh.characters;

  state.houses = Array.isArray(raw.houses) && raw.houses.length ? raw.houses : fresh.houses;
  state.houses = state.houses.map((house) => ({
    id: house.id || uid('hs'),
    name: house.name || 'My house',
    rooms: (Array.isArray(house.rooms) && house.rooms.length ? house.rooms : starterRooms()).map((room) => ({
      id: room.id || uid('rm'),
      name: room.name || 'Room',
      style: {
        wall: room.style?.wall || '#ffe9c9',
        wallPattern: room.style?.wallPattern || 'plain',
        floor: room.style?.floor || '#c98f5e',
        floorPattern: room.style?.floorPattern || 'plain',
      },
      items: (room.items || [])
        .filter((it) => it && getItem(it.def))
        .map((it) => ({
          uid: it.uid || uid('it'),
          def: it.def,
          x: Number(it.x) || 500,
          y: Number(it.y) || 600,
          scale: Number(it.scale) || 1,
          z: Number(it.z) || 0,
          flip: !!it.flip,
          tint: it.tint || undefined,
          on: !!it.on,
        })),
    })),
  }));

  const chars = new Set(state.characters.map((c) => c.id));
  if (!chars.has(state.activeCharacterId)) state.activeCharacterId = state.characters[0].id;
  const house = state.houses.find((h) => h.id === state.activeHouseId) || state.houses[0];
  state.activeHouseId = house.id;
  if (!house.rooms.some((r) => r.id === state.activeRoomId)) state.activeRoomId = house.rooms[0].id;
  state.sound = raw.sound !== false;
  return state;
}

export const state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('Could not read the save file, starting fresh.', err);
    return starterState();
  }
}

let saveTimer = 0;

/** Persist the world, debounced so a drag does not hammer localStorage. */
export function commit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save.', err);
    }
  }, 150);
}

export const activeCharacter = () =>
  state.characters.find((c) => c.id === state.activeCharacterId) || state.characters[0];

export const activeHouse = () =>
  state.houses.find((h) => h.id === state.activeHouseId) || state.houses[0];

export const activeRoom = () => {
  const house = activeHouse();
  return house.rooms.find((r) => r.id === state.activeRoomId) || house.rooms[0];
};

export function addCharacter(character) {
  state.characters.push(character);
  state.activeCharacterId = character.id;
  commit();
  return character;
}

export function deleteCharacter(id) {
  if (state.characters.length <= 1) return false;
  state.characters = state.characters.filter((c) => c.id !== id);
  if (state.activeCharacterId === id) state.activeCharacterId = state.characters[0].id;
  commit();
  return true;
}

export function addRoom(name = 'New room') {
  const house = activeHouse();
  const preset = ROOM_PRESETS[house.rooms.length % ROOM_PRESETS.length];
  const room = {
    id: uid('rm'),
    name,
    style: { wall: preset.wall, wallPattern: preset.wallPattern, floor: preset.floor, floorPattern: preset.floorPattern },
    items: [],
  };
  house.rooms.push(room);
  state.activeRoomId = room.id;
  commit();
  return room;
}

export function deleteRoom(id) {
  const house = activeHouse();
  if (house.rooms.length <= 1) return false;
  house.rooms = house.rooms.filter((r) => r.id !== id);
  if (state.activeRoomId === id) state.activeRoomId = house.rooms[0].id;
  commit();
  return true;
}

export function resetEverything() {
  const fresh = starterState();
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);
  commit();
}
