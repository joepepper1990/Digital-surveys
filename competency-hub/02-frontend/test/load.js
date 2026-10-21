// Loads the app modules into an isolated context for unit tests, in build order.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { MODULES } = require('../tools/build.js');

const ROOT = path.join(__dirname, '..');

function loadApp(extra) {
  const context = vm.createContext(Object.assign({ CH: {}, Intl, Date, Math, JSON, Promise, URLSearchParams, console, setTimeout, clearTimeout, window: {} }, extra || {}));
  MODULES.forEach((m) => vm.runInContext(fs.readFileSync(path.join(ROOT, m), 'utf8'), context, { filename: m }));
  return context.CH;
}

// The synthetic seed, evaluated for a given "today".
function loadSeed(todayIso) {
  const context = vm.createContext({ window: {}, Date, Number, String });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'mock/seed.js'), 'utf8'), context);
  return context.window.MockSeed(todayIso);
}

// Objects from the isolated context have their own prototypes; compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

module.exports = { loadApp, loadSeed, plain, ROOT };
