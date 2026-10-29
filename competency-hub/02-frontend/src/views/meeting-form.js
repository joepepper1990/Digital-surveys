// "Book a meeting" and "Change the meeting" (spec MTG-1): one form, sent as a queued request to the Meetings flow,
// which sends the Outlook invitation (or its update) once the meeting is recorded. Booking can also make the same
// meeting in each of the next few months, as separate meetings.
CH.views = CH.views || {};
CH.views.meetingForm = (function () {
  var h = CH.dom.h;
  var D = CH.dates;
  var R = CH.rules;

  // Who may chair: management, or a member of the area who runs its meetings. Who may attend: members and management.
  function people(app, key) {
    var m = app.model;
    var chairs = m.chairsByArea[key] || {};
    var all = m.ownersFor(key);
    return {
      all: all,
      chairs: all.filter(function (p) { return CH.config.managementRoles.indexOf(p.role) >= 0 || chairs[p.id]; }),
      members: all.filter(function (p) { return (m.membersByArea[key] || {})[p.id]; })
    };
  }

  function ctxFor(app) {
    return {
      today: app.model.today,
      runsMeetings: app.access.runsMeetings,
      chairAllowed: function (k, id) { return people(app, k).chairs.some(function (p) { return Number(p.id) === id; }); },
      attendeeAllowed: function (k, id) { return people(app, k).all.some(function (p) { return Number(p.id) === id; }); }
    };
  }

  // meeting: the meeting being changed, or none to book a new one in areaKey.
  function open(app, areaKey, meeting) {
    if (app.meetingsBlocked()) { CH.ui.toast(app.root, 'Booking and changing meetings is paused for the moment. Please try again later.', 'info'); return; }
    var m = app.model;
    var key = meeting ? meeting.areaKey : areaKey;
    var mine = m.areas.filter(function (a) { return app.access.runsMeetings(a.key); });
    if (!meeting && !mine.length) { CH.ui.toast(app.root, 'Only the people who run meetings in an area, and the Team Leaders and Group Head, can book meetings.', 'info'); return; }
    if (!meeting && !app.access.runsMeetings(key)) key = mine[0].key;
    var field = CH.ui.dialog.field;
    var area = h('select', { id: 'ch-m-areaKey', disabled: meeting ? true : null }, (meeting ? [m.areaByKey[key]] : mine).map(function (a) {
      return h('option', { value: a.key, selected: a.key === key ? true : null, text: a.name });
    }));
    var stats = m.stats[key] || {};
    var date = h('input', { id: 'ch-m-dateIso', type: 'date', min: m.today, max: D.addDays(m.today, 730), value: meeting ? meeting.dateIso : '' });
    var start = h('input', { id: 'ch-m-start', type: 'time', value: meeting ? meeting.start : '10:00' });
    var end = h('input', { id: 'ch-m-end', type: 'time', value: meeting ? meeting.end : '11:00' });
    var place = h('input', { id: 'ch-m-location', type: 'text', maxlength: '255', value: meeting ? meeting.location : '' });
    var link = h('input', { id: 'ch-m-onlineLink', type: 'url', maxlength: '1000', value: meeting ? meeting.onlineLink : ''});
    var chair = h('select', { id: 'ch-m-chairId' });
    var attendees = h('div', { class: 'checks', id: 'ch-m-attendeeIds', role: 'group', 'aria-label': 'Attendees' });
    var repeat = h('select', { id: 'ch-m-repeat' }, [['0', 'Just this meeting'], ['2', 'This and the next 2 months'], ['5', 'This and the next 5 months']].map(function (o) {
      return h('option', { value: o[0], text: o[1] });
    }));

    function fillPeople() {
      var p = people(app, area.value);
      var chosenChair = chair.value || String(meeting ? meeting.chairId : app.person.SiteUserId);
      CH.dom.clear(chair);
      p.chairs.forEach(function (x) { chair.appendChild(h('option', { value: String(x.id), selected: String(x.id) === chosenChair ? true : null, text: x.name })); });
      var ticked = meeting ? meeting.attendeeIds.map(String) : p.members.map(function (x) { return String(x.id); }).concat(String(app.person.SiteUserId));
      CH.dom.clear(attendees);
      p.all.forEach(function (x) {
        attendees.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(x.id), checked: ticked.indexOf(String(x.id)) >= 0 ? true : null }),
          ' ' + x.name + ((m.membersByArea[area.value] || {})[x.id] ? '' : ' – ' + x.role)));
      });
    }
    area.addEventListener('change', fillPeople);
    fillPeople();

    var errorBox = h('p', { class: 'form-error', role: 'alert' });
    var submit = h('button', { type: 'submit', class: 'btn btn-main', text: meeting ? 'Save changes' : 'Book meeting' });
    var dlg = CH.ui.dialog.open({ root: app.layer, id: 'ch-m', title: meeting ? 'Change the meeting' : 'Book a meeting', wide: true });
    var invites = app.health ? app.health.invitesEnabled !== false : true;
    var form = h('form', { class: 'dialog-body', novalidate: true },
      field('Area', area),
      !meeting && stats.lastMeeting ? h('p', { class: 'muted small', text: 'The last ' + m.areaByKey[key].name + ' meeting was on ' + D.long(stats.lastMeeting) + '.' }) : null,
      h('div', { class: 'row three' }, field('Date', date), field('Starts', start), field('Ends', end)),
      h('div', { class: 'row two' }, field('Place', place, 'A room, or empty if online.'), field('Online link', link, 'Optional, e.g. a Teams link.')),
      meeting ? field('Chair', chair) : h('div', { class: 'row two' }, field('Chair', chair), field('Repeat', repeat)),
      h('div', { class: 'field' }, h('span', { class: 'label', text: 'Attendees' }),
        attendees, h('span', { class: 'field-error', id: 'ch-m-attendeeIds-err' })),

      h('p', { class: 'explain', text: invites
        ? (meeting ? 'An Outlook update goes to the attendees once the change is recorded.' : 'An Outlook invitation goes to the attendees from your calendar once the meeting is recorded.')
        : 'Outlook invitations are switched off: attendees can add the meeting to their calendar from the Hub.' }),
      errorBox,
      h('div', { class: 'row' }, submit, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: dlg.close })));
    dlg.body.appendChild(form);

    function values() {
      return { areaKey: area.value, dateIso: date.value, start: start.value, end: end.value, location: place.value.trim(), onlineLink: link.value.trim(),
        chairId: Number(chair.value), attendeeIds: Array.prototype.filter.call(attendees.querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return Number(i.value); }) };
    }

    var keys = [];   // one request key per booking (or the change), kept across Try again
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorBox.textContent = '';
      var v = values();
      var errors = R.validateMeeting(v, ctxFor(app));
      if (CH.ui.dialog.showErrors(form, 'ch-m-', errors, ['areaKey', 'dateIso', 'start', 'end', 'location', 'onlineLink', 'chairId', 'attendeeIds'])) return;
      if (errors.areaKey) { errorBox.textContent = errors.areaKey; return; }
      submit.disabled = true;
      submit.textContent = 'Sending…';
      var when = function (iso) { return D.weekday(iso) + ' ' + D.long(iso) + ' at ' + v.start; };
      try {
        if (meeting) {
          var changed = {};
          ['dateIso', 'start', 'end', 'location', 'onlineLink', 'chairId'].forEach(function (k) {
            var before = { dateIso: meeting.dateIso, start: meeting.start, end: meeting.end, location: meeting.location, onlineLink: meeting.onlineLink, chairId: Number(meeting.chairId) }[k];
            if (v[k] !== before) changed[k] = v[k];
          });
          if (v.attendeeIds.slice().sort().join() !== meeting.attendeeIds.slice().sort().join()) changed.attendeeIds = v.attendeeIds;
          if (!Object.keys(changed).length) { errorBox.textContent = 'Nothing has changed.'; submit.disabled = false; submit.textContent = 'Save changes'; return; }
          keys[0] = keys[0] || CH.requests.newKey();
          var now = app.model.meetingById[meeting.id] || meeting;
          await app.tracker.submit({ key: keys[0], type: 'UpdateMeeting', targetId: meeting.id, targetType: 'Meeting', expectedRevision: now.revision, payload: changed,
            label: 'Change the ' + meeting.areaName + ' meeting to ' + when(v.dateIso) });
        } else {
          var dates = [v.dateIso].concat(R.nextMonths(v.dateIso, Number(repeat.value)));
          for (var i = 0; i < dates.length; i++) {
            keys[i] = keys[i] || CH.requests.newKey();
            await app.tracker.submit({ key: keys[i], type: 'ScheduleMeeting', payload: Object.assign({}, v, { dateIso: dates[i] }),
              label: 'Book the ' + m.areaByKey[v.areaKey].name + ' meeting on ' + when(dates[i]) });
          }
        }
        dlg.close();
        CH.ui.toast(app.root, meeting ? 'Your change has been sent.' : 'Sent. The meeting shows straight away; the invitation goes out once it is saved, in about a minute.', 'ok');
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Try again';
        errorBox.textContent = error.friendly || 'This could not be sent just now. Nothing has been lost – try again in a moment.';
      }
    });
    date.focus();
  }

  return { open: open, people: people };
})();
