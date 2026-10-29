// Administration → Settings (spec ADM-4): the five safe values, each checked here and again by the
// Administration flow, which records the previous and the new value. One change is sent at a time.
CH.views = CH.views || {};
CH.views.settings = (function () {
  var h = CH.dom.h;
  var ui = CH.ui;
  var D = CH.dates;
  var ITEMS = [
    { name: 'ReminderDaysBefore', label: 'First reminder', unit: 'days before an action\'s deadline', min: 1, max: 30, fallback: '7',
      hint: 'When the owner gets the first reminder email.' },
    { name: 'DueSoonDays', label: 'Due soon', unit: 'days', min: 1, max: 30, fallback: '7',
      hint: 'How far ahead an action counts as due soon on the screens.' },
    { name: 'OverdueReminderIntervalDays', label: 'Late reminders', unit: 'days between them', min: 1, max: 30, fallback: '7',
      hint: 'How often the owner of a late action is reminded.' },
    { name: 'MaxDeadlineYears', label: 'Furthest deadline', unit: 'years ahead', min: 1, max: 5, fallback: '2',
      hint: 'The latest target date anyone can choose.' },
    { name: 'MonitorHours', label: 'Queue monitor hours', hours: true, fallback: '07:00|19:45|60',
      hint: 'Every 10 minutes in working hours on weekdays; outside them, every so many minutes (20 to 90, in tens).' },
    { name: 'InvitesEnabled', label: 'Outlook invitations', yesNo: true, fallback: 'Yes',
      hint: 'Yes: meetings send Outlook invitations, updates and cancellations. No: people add meetings to their calendar from the Hub.' },
    { name: 'PdfEnabled', label: 'PDF minutes', yesNo: true, fallback: 'Yes',
      hint: 'Yes: finalised minutes are saved as a PDF. No: the Hub offers a print-ready page instead.' }
  ];

  function current(app, name) {
    var row = (app.settings || []).filter(function (r) { return r.Title === name; })[0];
    return row && row.Value !== undefined && row.Value !== null ? String(row.Value) : '';
  }

  // Returns an error message, or '' when the value is acceptable (the same checks as the flow).
  function check(item, value) {
    if (item.yesNo) return value === 'Yes' || value === 'No' ? '' : 'Choose Yes or No.';
    if (item.hours) {
      var p = String(value).split('|');
      var t = function (x) { var m = /^(\d{2}):(\d{2})$/.exec(x || ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1; };
      if (p.length !== 3 || t(p[0]) < 0 || t(p[1]) < 0 || t(p[0]) >= t(p[1]) || !/^\d{1,2}$/.test(p[2]) || Number(p[2]) < 20 || Number(p[2]) > 90 || Number(p[2]) % 10) {
        return 'Give the start and end of working hours (start before end), and the minutes between checks outside them: 20 to 90, in tens (the monitor runs every 10 minutes).';
      }
      return '';
    }
    if (!/^\d{1,2}$/.test(String(value)) || Number(value) < item.min || Number(value) > item.max) {
      return 'Enter a whole number from ' + item.min + ' to ' + item.max + '.';
    }
    return '';
  }

  function words(item, value) {
    if (item.yesNo) return (value || item.fallback) === 'No' ? 'Off' : 'On';
    if (!value) return 'Not set (' + (item.hours ? item.fallback.replace(/\|/g, ' – ').replace(/ – (\d+)$/, ', then every $1 minutes') : item.fallback + ' ' + item.unit) + ' is used)';
    if (item.hours) {
      var p = value.split('|');
      return p[0] + ' to ' + p[1] + ' on weekdays; every ' + p[2] + ' minutes outside those hours';
    }
    return value + ' ' + item.unit;
  }

  function editor(app, item, onDone) {
    var err = h('span', { class: 'field-error', id: 'ch-set-' + item.name + '-err' });
    var value = current(app, item.name) || item.fallback;
    var inputs;
    if (item.yesNo) {
      inputs = [h('select', { id: 'ch-set-' + item.name, 'aria-label': item.label }, [['Yes', 'On'], ['No', 'Off']].map(function (o) {
        return h('option', { value: o[0], selected: o[0] === value ? true : null, text: o[1] });
      }))];
    } else if (item.hours) {
      var p = value.split('|');
      inputs = [h('input', { type: 'time', id: 'ch-set-' + item.name, 'aria-label': 'Start', value: p[0] }), ' to ',
        h('input', { type: 'time', 'aria-label': 'End', value: p[1] }), ', then every ',
        h('input', { type: 'number', min: '20', max: '90', step: '10', 'aria-label': 'Minutes between checks outside working hours', value: p[2], class: 'num' }), ' minutes'];
    } else {
      inputs = [h('input', { type: 'number', id: 'ch-set-' + item.name, min: String(item.min), max: String(item.max), value: value, class: 'num' }), ' ' + item.unit];
    }
    var save = h('button', { type: 'submit', class: 'btn btn-main', text: 'Save' });
    var form = h('form', { class: 'setting-edit', novalidate: true }, h('span', { class: 'inline-fields' }, inputs), save,
      h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: function () { onDone(); } }), err);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var fields = form.querySelectorAll('input, select');
      var v = item.hours ? [fields[0].value, fields[1].value, fields[2].value].join('|') : String(fields[0].value).trim();
      var problem = check(item, v);
      err.textContent = problem;
      if (problem) { fields[0].focus(); return; }
      if (v === current(app, item.name)) { onDone(); return; }
      save.disabled = true;
      save.textContent = 'Sending…';
      try {
        await app.tracker.submit({ type: 'UpdateSetting', payload: { name: item.name, value: v }, label: item.yesNo ? 'Turn ' + item.label + ' ' + words(item, v).toLowerCase() : 'Change ' + item.label.toLowerCase() + ' to ' + words(item, v) });
        onDone();
      } catch (error) {
        save.disabled = false;
        save.textContent = 'Try again';
        err.textContent = error.friendly || 'This could not be sent just now. Try again in a moment.';
      }
    });
    setTimeout(function () { var first = form.querySelector('input, select'); if (first) first.focus(); }, 0);
    return form;
  }

  function render(app) {
    var editing = app.settingEdit || '';
    var sent = (app.tracker ? app.tracker.entries() : []).filter(function (e) { return e.type === 'UpdateSetting' && !e.dismissed; });
    return [
      h('p', { class: 'muted small', text: 'Each change is checked, recorded with its previous value, and takes effect in about a minute.' }),
      h('ul', { class: 'plain settings' }, ITEMS.map(function (item) {
        var waiting = sent.filter(function (e) { return (e.label.indexOf(item.label.toLowerCase()) >= 0 || e.label.indexOf(item.label) >= 0) && (e.state === 'submitted' || e.state === 'slow'); })[0];
        return h('li', null, h('div', { class: 'setting' },
          h('b', { text: item.label }), h('br'),
          h('span', { text: words(item, current(app, item.name)) }), h('br'),
          h('span', { class: 'muted small', text: item.hint }),
          waiting ? h('p', { class: 'pending', role: 'status', text: waiting.label + ' – sent at ' + D.ukTime(waiting.submittedAt) + ', waiting to be recorded.' }) : null,
          editing === item.name ? editor(app, item, function () { app.settingEdit = ''; app.refreshView(); }) : null),
          editing || waiting ? null : ui.button('Change', function () { app.settingEdit = item.name; app.refreshView(); }));
      })),
      sent.filter(function (e) { return e.state !== 'submitted' && e.state !== 'slow'; }).map(function (e) {
        return h('p', { class: e.state === 'done' ? 'ok-note' : 'section-note', role: 'status' },
          (e.state === 'done' ? 'Done: ' : 'Not done: ') + e.label + '. ' + (e.state === 'done' ? '' : e.message + ' '), ui.linkButton('Dismiss', function () { app.tracker.dismiss(e); }));
      })
    ];
  }

  return { render: render, check: check, ITEMS: ITEMS };
})();
