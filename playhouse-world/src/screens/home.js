// Home: pick who you are, pick where you are, then create or play.

import { el } from '../util.js';
import { state, commit, activeCharacter, activeHouse, activeRoom, addCharacter, deleteCharacter, addRoom, deleteRoom, resetEverything } from '../store.js';
import { avatarSVG, randomCharacter } from '../art/avatar.js';
import { roomThumb } from '../art/scene.js';
import { button, topBar, askSheet } from '../ui/components.js';
import { play } from '../ui/sound.js';

export function createHomeScreen(app) {
  const body = el('div', { class: 'home' });
  const root = el('section', { class: 'screen screen--home' }, [
    topBar({
      title: '',
      right: [button('⚙️', { round: true, title: 'Settings', onTap: openSettings })],
    }),
    body,
  ]);

  async function openSettings() {
    const wantsReset = await askSheet(app.root, {
      title: 'Settings',
      prompt: `Sound is ${state.sound ? 'on' : 'off'}. Reset wipes every character and room and starts again.`,
      confirm: 'Start over',
      cancel: state.sound ? 'Turn sound off' : 'Turn sound on',
      danger: true,
    });
    if (wantsReset === true) {
      const sure = await askSheet(app.root, {
        title: 'Start over?',
        prompt: 'Everything you made will be gone.',
        confirm: 'Yes, start over', cancel: 'Keep my stuff', danger: true,
      });
      if (sure) { resetEverything(); render(); }
    } else if (wantsReset === null) {
      state.sound = !state.sound;
      commit();
    }
  }

  async function newCharacter() {
    const name = await askSheet(app.root, {
      title: 'New character', prompt: 'What are they called?', value: '', placeholder: 'Name', confirm: 'Create',
    });
    if (name === null) return;
    const character = randomCharacter(name || undefined);
    addCharacter(character);
    play('sparkle');
    app.go('avatar');
  }

  async function removeCharacter(character) {
    const sure = await askSheet(app.root, {
      title: `Say bye to ${character.name}?`, confirm: 'Delete', cancel: 'Keep', danger: true,
    });
    if (sure && !deleteCharacter(character.id)) {
      await askSheet(app.root, { title: 'You need at least one character.', confirm: 'OK', cancel: '' });
    }
    render();
  }

  async function newRoom() {
    const name = await askSheet(app.root, {
      title: 'New room', prompt: 'What kind of room?', value: '', placeholder: 'Room name', confirm: 'Build it',
    });
    if (name === null) return;
    addRoom(name || 'New room');
    play('sparkle');
    app.go('house');
  }

  async function removeRoom(room) {
    const sure = await askSheet(app.root, { title: `Knock down ${room.name}?`, confirm: 'Delete', cancel: 'Keep', danger: true });
    if (sure && !deleteRoom(room.id)) {
      await askSheet(app.root, { title: 'A house needs at least one room.', confirm: 'OK', cancel: '' });
    }
    render();
  }

  function characterCard() {
    const me = activeCharacter();
    const picker = el('div', { class: 'picker' });

    for (const character of state.characters) {
      const on = character.id === me.id;
      const tile = el('button', {
        class: `pick ${on ? 'pick--on' : ''}`, type: 'button',
        onclick: () => {
          play('pop');
          if (on) { app.go('avatar'); return; }
          state.activeCharacterId = character.id;
          commit();
          render();
        },
        oncontextmenu: (e) => { e.preventDefault(); removeCharacter(character); },
      }, [
        el('div', { html: avatarSVG(character, { view: '10 10 180 320' }), style: 'width:100%' }),
        el('span', { class: 'pick__name', text: character.name }),
      ]);
      picker.append(tile);
    }

    picker.append(el('button', {
      class: 'pick pick--new', type: 'button', onclick: newCharacter,
    }, [el('span', { style: 'font-size:40px', text: '＋' }), el('span', { class: 'pick__name', text: 'New friend' })]));

    return el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title', text: `Characters · ${me.name}` }),
        button('✏️ Dress up', { variant: 'berry', onTap: () => app.go('avatar') }),
      ]),
      picker,
      state.characters.length > 1
        ? el('p', { style: 'margin:10px 2px 0;font-size:12px;font-weight:600;color:var(--ink-soft)', text: 'Tap to choose · tap again to dress up' })
        : null,
    ].filter(Boolean));
  }

  function houseCard() {
    const house = activeHouse();
    const room = activeRoom();
    const picker = el('div', { class: 'picker' });

    for (const candidate of house.rooms) {
      const on = candidate.id === room.id;
      const tile = el('button', {
        class: `pick pick--wide ${on ? 'pick--on' : ''}`, type: 'button',
        onclick: () => {
          play('pop');
          if (on) { app.go('house'); return; }
          state.activeRoomId = candidate.id;
          commit();
          render();
        },
        oncontextmenu: (e) => { e.preventDefault(); removeRoom(candidate); },
      }, [
        el('div', { html: roomThumb(candidate), style: 'width:100%;aspect-ratio:1000/640;overflow:hidden;border-radius:14px' }),
        el('span', { class: 'pick__name', text: candidate.name }),
      ]);
      picker.append(tile);
    }

    picker.append(el('button', {
      class: 'pick pick--new pick--wide', type: 'button', onclick: newRoom,
    }, [el('span', { style: 'font-size:40px', text: '＋' }), el('span', { class: 'pick__name', text: 'New room' })]));

    return el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title', text: `${house.name} · ${room.name}` }),
        button('🛠️ Decorate', { variant: 'sky', onTap: () => app.go('house') }),
      ]),
      picker,
    ]);
  }

  function render() {
    const me = activeCharacter();
    body.replaceChildren(
      el('div', { class: 'home__hero' }, [
        el('div', { html: avatarSVG(me, { view: '20 0 160 180' }), style: 'width:86px;flex:0 0 auto' }),
        el('div', {}, [
          el('h1', { class: 'home__logo', text: 'Playhouse World' }),
          el('p', { class: 'home__tag', text: `Hi ${me.name}! Make a look, build a room, then play.` }),
        ]),
      ]),
      characterCard(),
      houseCard(),
      el('div', { class: 'home__actions' }, [
        button('<span class="btn__emoji">🧑‍🎨</span> Character', { variant: 'berry', big: true, onTap: () => app.go('avatar') }),
        button('<span class="btn__emoji">🏠</span> House', { variant: 'sky', big: true, onTap: () => app.go('house') }),
        button('<span class="btn__emoji">▶️</span> Play', { variant: 'mint', big: true, class: 'btn--play', sound: 'happy', onTap: () => app.go('play') }),
      ]),
      el('p', {
        style: 'text-align:center;font-size:12px;font-weight:600;color:var(--ink-soft);margin:4px 0 0',
        text: 'Everything saves on this device. Add to Home Screen for full screen play.',
      }),
    );
  }

  return { el: root, enter: render, leave() {} };
}
