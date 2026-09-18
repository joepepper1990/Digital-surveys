// Tiny WebAudio blips. No files to download, and nothing starts until the
// player's first tap, which is what iOS requires.

import { state } from '../store.js';

let ctx = null;

function audio() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

const NOTES = {
  tap: [{ f: 660, d: .07, type: 'triangle' }],
  pop: [{ f: 320, d: .06, type: 'sine' }, { f: 520, d: .08, type: 'sine', at: .04 }],
  place: [{ f: 220, d: .09, type: 'square' }],
  sparkle: [{ f: 880, d: .07 }, { f: 1180, d: .07, at: .06 }, { f: 1480, d: .1, at: .12 }],
  woosh: [{ f: 180, d: .16, type: 'sawtooth' }],
  happy: [{ f: 523, d: .1 }, { f: 659, d: .1, at: .09 }, { f: 784, d: .16, at: .18 }],
};

export function play(name) {
  if (!state.sound) return;
  const parts = NOTES[name];
  if (!parts) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') ac.resume();

  for (const part of parts) {
    const t0 = ac.currentTime + (part.at || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = part.type || 'triangle';
    osc.frequency.setValueAtTime(part.f, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + part.d);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + part.d + 0.02);
  }
}

/** Unlock audio on the first user gesture (iOS). */
export function primeAudio() {
  const unlock = () => {
    const ac = audio();
    if (ac && ac.state === 'suspended') ac.resume();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
}
