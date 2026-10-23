// Preview controls: design name, previous/next design and "Preview as". Stands in for SharePoint's own bar.
(function () {
  'use strict';
  var D = window.DESIGN;
  var ROLES = [['tech', 'Technician'], ['eng', 'Engineer'], ['mgmt', 'Team Leader']];
  var params = new URLSearchParams(location.search);
  var role = params.get('role') || 'tech';
  if (!ROLES.some(function (r) { return r[0] === role; })) role = 'tech';

  function bar() {
    var b = h('div', { class: 'pv-switch', role: 'navigation', 'aria-label': 'Preview controls' },
      h('span', { class: 'pv-name' }, h('b', { text: 'Design ' + D.n + ' of 5' }), ' · ' + D.name),
      D.n > 1 ? h('a', { href: D.files[D.n - 2] + '?role=' + role, text: '‹ Previous' }) : null,
      D.n < 5 ? h('a', { href: D.files[D.n] + '?role=' + role, text: 'Next ›' }) : null,
      h('span', { class: 'pv-sep', text: 'Preview as' }),
      ROLES.map(function (r) {
        return h('button', { type: 'button', 'aria-pressed': String(r[0] === role), text: r[1], onclick: function () { role = r[0]; history.replaceState(null, '', '?role=' + role); draw(); } });
      }));
    return b;
  }
  function draw() {
    var root = document.getElementById('pv');
    root.textContent = '';
    root.appendChild(bar());
    var app = h('div', { class: 'pv-app' });
    root.appendChild(app);
    window.renderDesign(app, window.CHDATA(role));
  }
  document.addEventListener('DOMContentLoaded', draw);
})();
