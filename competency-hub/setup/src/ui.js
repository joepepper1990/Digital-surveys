// The Setup page: explanation, confirmations, Check (dry run) and Apply, and a log that can be saved.
CHS.ui = (function () {
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    if (text !== undefined) n.textContent = text;
    return n;
  }

  var LABELS = { ok: 'OK', create: 'Change', warn: 'Check', stop: 'Stopped', info: 'Note' };

  function start(ctx, schema) {
    var root = document.querySelector('[data-chs-root]');
    var webPart = ctx.getWebPart();
    var rest = CHS.rest.create(webPart);
    var entries = [];
    var busy = false;
    root.textContent = '';

    root.appendChild(el('h1', {}, 'Competency Hub Setup'));
    root.appendChild(el('p', {}, 'This page creates the Competency Hub lists, groups, folders and permissions on this site, and makes you the first administrator. ' +
      'Run Check first: it changes nothing and lists what Apply would do. Apply only adds what is missing, never deletes anything, and can be run again safely.'));
    root.appendChild(el('p', { class: 'warn' }, 'Only site owners can use this page. Delete its two files from the Welcome layouts library when Setup is finished.'));

    var confirmBox = el('input', { type: 'checkbox', id: 'chs-confirm' });
    var confirmLabel = el('label', { for: 'chs-confirm' }, ' I have checked that the Microsoft 365 group for this site has no members other than its owners.');
    root.appendChild(el('p', { class: 'field' })).append(confirmBox, confirmLabel);

    var roleSelect = el('select', { id: 'chs-role' });
    ['Team Leader', 'Group Head', 'Engineer', 'Technician'].forEach(function (r) { roleSelect.appendChild(el('option', { value: r }, r)); });
    var roleRow = el('p', { class: 'field' });
    roleRow.append(el('label', { for: 'chs-role' }, 'Your role in the Competency Hub: '), roleSelect);
    root.appendChild(roleRow);

    var details = el('details');
    details.appendChild(el('summary', {}, 'Optional: add other people now'));
    details.appendChild(el('p', {}, 'One person per line: email, role, area keys separated by spaces. For example: ' +
      'firstname.lastname@edf-energy.com, Technician, FLK GRS RP. Area keys: ' + schema.areas.map(function (a) { return a.key + ' (' + a.title + ')'; }).join(', ') + '.'));
    var people = el('textarea', { id: 'chs-people', rows: '8', 'aria-label': 'People to add' });
    details.appendChild(people);
    root.appendChild(details);

    var named = el('details');
    named.appendChild(el('summary', {}, 'Optional: the name each person is shown by (Known as)'));
    named.appendChild(el('p', {}, 'One person per line: full name, a dash, then the name the Hub should use. For example: Joseph Pepper – Joe. ' +
      'People who are not in the Hub yet are listed and skipped.'));
    var knownBox = el('textarea', { id: 'chs-known', rows: '8', 'aria-label': 'Known as names' });
    named.appendChild(knownBox);
    root.appendChild(named);

    var checkBtn = el('button', { type: 'button', class: 'btn' }, 'Check (changes nothing)');
    var applyBtn = el('button', { type: 'button', class: 'btn primary' }, 'Apply');
    var typed = el('input', { type: 'text', id: 'chs-typed', placeholder: 'Type SETUP to enable Apply', 'aria-label': 'Type SETUP to enable Apply' });
    var saveBtn = el('button', { type: 'button', class: 'btn' }, 'Save the log');
    applyBtn.disabled = true;
    typed.addEventListener('input', function () { applyBtn.disabled = busy || typed.value.trim() !== 'SETUP'; });
    var controls = el('p', { class: 'controls' });
    controls.append(checkBtn, typed, applyBtn, saveBtn);
    root.appendChild(controls);

    var status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, 'Ready. Start with Check.');
    root.appendChild(status);
    var table = el('table');
    var head = el('tr');
    ['Step', 'Result', 'Detail'].forEach(function (h) { head.appendChild(el('th', {}, h)); });
    table.appendChild(head);
    var body = el('tbody');
    table.appendChild(body);
    root.appendChild(table);

    function log(entry) {
      entries.push(entry);
      var tr = el('tr', { class: 'lvl-' + entry.level });
      tr.appendChild(el('td', {}, entry.step));
      tr.appendChild(el('td', {}, LABELS[entry.level]));
      tr.appendChild(el('td', {}, entry.text));
      body.appendChild(tr);
    }

    async function go(mode) {
      if (busy) return;
      busy = true;
      checkBtn.disabled = true; applyBtn.disabled = true;
      body.textContent = '';
      entries = [];
      status.textContent = mode === 'apply' ? 'Applying… keep this page open.' : 'Checking… nothing will be changed.';
      var engine = CHS.engine.create(rest, schema, {
        log: log, confirmGroupOwnersOnly: confirmBox.checked, bootstrapRole: roleSelect.value, peopleText: people.value, knownAsText: knownBox.value
      });
      var result = await engine.run(mode);
      busy = false;
      checkBtn.disabled = false;
      applyBtn.disabled = typed.value.trim() !== 'SETUP';
      var verb = mode === 'apply' ? 'Apply' : 'Check';
      status.textContent = result.ok
        ? verb + ' finished: ' + result.created + (mode === 'apply' ? ' changes made, ' : ' changes needed, ') + result.unchanged + ' already in place.' + (mode === 'apply' ? ' SharePoint writes: ' + result.writes + '.' : '')
        : verb + ' stopped with ' + result.stops + ' problem' + (result.stops === 1 ? '' : 's') + '. See the rows marked Stopped.';
      status.className = 'status ' + (result.ok ? 'good' : 'bad');
      root.setAttribute('data-chs-result', JSON.stringify(result));
    }

    checkBtn.addEventListener('click', function () { go('check'); });
    applyBtn.addEventListener('click', function () { go('apply'); });
    saveBtn.addEventListener('click', function () {
      var text = ['Competency Hub Setup log – ' + new Date().toISOString()].concat(entries.map(function (e) {
        return [e.mode, e.step, LABELS[e.level], e.text].join(' | ');
      })).join('\r\n');
      var a = el('a', { href: 'data:text/plain;charset=utf-8,' + encodeURIComponent(text), download: 'competency-hub-setup-log.txt' });
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  return { start: start };
})();
