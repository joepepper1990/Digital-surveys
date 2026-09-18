// Character creator: pick a part, pick a colour, watch it change instantly.

import { el } from '../util.js';
import { state, commit, activeCharacter, deleteCharacter } from '../store.js';
import { CATEGORIES, avatarInner, optionThumb, randomCharacter, STYLE_SETS } from '../art/avatar.js';
import { button, topBar, tabButton, swatch, optionTile, askSheet, toast } from '../ui/components.js';
import { play } from '../ui/sound.js';

export function createAvatarScreen(app) {
  let catId = 'hair';

  const stage = el('div', { class: 'stage stage--avatar' });
  const tabs = el('div', { class: 'tabs' });
  const styleRow = el('div', { class: 'options' });
  const colorRow = el('div', { class: 'options swatch-row' });
  const tray = el('div', { class: 'tray' }, [tabs, styleRow, colorRow]);
  const bodyWrap = el('div', { class: 'screen__body' }, [stage, tray]);

  const titleBar = topBar({
    title: 'Character',
    onBack: () => app.go('home'),
    right: [
      button('🎲', { round: true, title: 'Surprise me', sound: 'sparkle', onTap: surprise }),
      button('🗑️', { round: true, title: 'Delete character', onTap: remove }),
      button('✓', { round: true, variant: 'mint', title: 'Done', sound: 'happy', onTap: () => app.go('home') }),
    ],
  });
  const root = el('section', { class: 'screen screen--editor' }, [titleBar, bodyWrap]);
  const titleNode = titleBar.querySelector('.topbar__title');
  titleNode.style.cursor = 'pointer';
  titleNode.addEventListener('click', rename);

  function me() { return activeCharacter(); }

  function set(key, value) {
    me()[key] = value;
    commit();
    drawStage();
    drawTray();
  }

  async function rename() {
    const name = await askSheet(app.root, {
      title: 'Name', value: me().name, placeholder: 'Name', confirm: 'Save',
    });
    if (name) { me().name = name; commit(); drawStage(); drawTitle(); }
  }

  function surprise() {
    const fresh = randomCharacter(me().name);
    Object.assign(me(), fresh, { id: me().id, name: me().name });
    commit();
    drawStage();
    drawTray();
    toast(stage, 'Ta-da!');
  }

  async function remove() {
    if (state.characters.length <= 1) {
      toast(stage, 'You need at least one character');
      return;
    }
    const sure = await askSheet(app.root, {
      title: `Say bye to ${me().name}?`, confirm: 'Delete', cancel: 'Keep', danger: true,
    });
    if (sure) { deleteCharacter(me().id); app.go('home'); }
  }

  function drawTitle() {
    titleNode.textContent = `${me().name} ✎`;
  }

  function drawStage() {
    stage.replaceChildren(el('div', {
      style: 'display:grid;place-items:center;width:100%;height:100%',
      html: `<svg viewBox="0 0 320 400" class="stage__svg" xmlns="http://www.w3.org/2000/svg">
        <circle cx="160" cy="196" r="152" fill="#ffe9c9"/>
        <circle cx="160" cy="196" r="120" fill="#fff6e8"/>
        <ellipse cx="160" cy="356" rx="86" ry="16" fill="#40302b" opacity=".12"/>
        <g class="pw-avatar idle" transform="translate(60 22)">${avatarInner(me())}</g>
      </svg>`,
    }));
  }

  function drawTabs() {
    tabs.replaceChildren(...CATEGORIES.map((cat) =>
      tabButton(cat.label, cat.emoji, cat.id === catId, () => { catId = cat.id; drawTray(); })));
  }

  function drawTray() {
    drawTabs();
    const cat = CATEGORIES.find((c) => c.id === catId) || CATEGORIES[0];
    const character = me();

    // Styles for this part.
    styleRow.replaceChildren();
    if (cat.styles) {
      const set_ = STYLE_SETS[cat.id] || cat.styles;
      for (const [id, def] of Object.entries(set_)) {
        styleRow.append(optionTile(optionThumb(character, cat, id), {
          label: def.label,
          on: character[cat.styleKey] === id,
          onTap: () => set(cat.styleKey, id),
        }));
      }
    }
    if (cat.toggles) {
      for (const key of cat.toggles) {
        styleRow.append(optionTile(
          `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
             <circle cx="50" cy="50" r="34" fill="${character[key] ? '#ff8fab' : '#e8ddcf'}"/>
             <text x="50" y="62" font-size="34" text-anchor="middle">${key === 'blush' ? '😊' : '✨'}</text></svg>`,
          { label: key === 'blush' ? 'Blush' : 'Freckles', on: !!character[key], onTap: () => set(key, !character[key]) },
        ));
      }
    }
    styleRow.hidden = styleRow.childElementCount === 0;

    // Colours for this part.
    colorRow.replaceChildren();
    if (cat.colorKey) {
      for (const color of cat.colors) {
        colorRow.append(swatch(color, character[cat.colorKey] === color, () => set(cat.colorKey, color)));
      }
    }
    colorRow.hidden = colorRow.childElementCount === 0;
  }

  function enter() {
    drawTitle();
    drawStage();
    drawTray();
    play('woosh');
  }

  return { el: root, enter, leave() {} };
}
