// Synthetic seed data for local testing only. Names and memberships follow plan E.1; every email
// address is a made-up example.test address, and every action, notice and meeting is invented.
window.MockSeed = function (todayIso) {
  'use strict';
  function add(iso, n) {
    var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function dueDay(offset) { return Number(add(todayIso, offset).replace(/-/g, '')); }
  function at(offset, time) { return add(todayIso, offset) + 'T' + (time || '09:00:00') + 'Z'; }

  var AREAS = [['FLK', 'Flask'], ['INS', 'Instruments'], ['GRS', 'Green Stream'], ['RPE', 'RPE'], ['BA', 'BA'],
    ['DOS', 'Dosimetry'], ['RP', 'Radiological Protection'], ['DSL', 'DSL'], ['ALS', 'Active Lab & Sampling'], ['RW', 'Radwaste']];
  var competencies = AREAS.map(function (a, i) {
    return { Id: i + 1, Title: a[1], CompetencyKey: a[0], SortOrder: (i + 1) * 10, Status: 'Active' };
  });
  var ALL = AREAS.map(function (a) { return a[0]; });

  // [name, role, areas]
  var PEOPLE = [
    ['Andrea Medlicott', 'Engineer', ALL], ['Kelly Bates', 'Engineer', ALL], ['Ben Beak', 'Engineer', ALL],
    ['Dave Beeching', 'Engineer', ALL], ['Craig Bunney', 'Engineer', ['RP', 'ALS']], ['Aiden Gorham', 'Engineer', ALL],
    ['Richard Harrisson', 'Engineer', ['GRS', 'RP', 'DSL', 'RW']], ['Jake Stafford', 'Engineer', ALL], ['Chloe Tilly', 'Engineer', ALL],
    ['Kai Todd', 'Engineer', ['GRS', 'RP', 'RW']],
    ['Trevor Baldwin', 'Technician', ['GRS', 'RPE', 'RP', 'ALS', 'RW']], ['Rachel Boulden', 'Technician', ['FLK', 'INS', 'GRS', 'DOS', 'RP', 'ALS']],
    ['Mark Buckley', 'Technician', ['GRS', 'RPE', 'RP']], ['Luke Cain', 'Technician', ['INS', 'GRS', 'RP', 'RW']],
    ['Doti Cange-Ainsworth', 'Technician', ['FLK', 'GRS', 'DOS', 'RP', 'ALS']], ['Adrian Cooke', 'Technician', ['GRS', 'RPE', 'BA', 'RP', 'DSL', 'RW']],
    ['Charlie Everitt', 'Technician', ['GRS', 'RPE', 'BA', 'RP', 'ALS']], ['Matt Henley', 'Technician', ['FLK', 'GRS', 'RPE', 'BA', 'RP', 'RW']],
    ['Kevin Hewitt', 'Technician', ['INS', 'GRS', 'DOS', 'RP', 'ALS']], ['Richard Howe', 'Technician', ['GRS', 'RPE', 'BA', 'DOS', 'RP', 'DSL']],
    ['Nick Pearce', 'Technician', ['FLK', 'GRS', 'RPE', 'BA', 'RP', 'DSL']], ['Steve Punnett', 'Technician', ['FLK', 'GRS', 'RP', 'DSL', 'ALS']],
    ['Jenn Tibbenham', 'Technician', ['GRS', 'RP']], ['Adam Washford', 'Technician', ['FLK', 'INS', 'GRS', 'RP', 'RW']],
    ['Sadie Young', 'Technician', ['GRS', 'DOS', 'RP', 'ALS']],
    ['Joe Pepper', 'Team Leader', []], ['Mark Wellstead', 'Team Leader', []], ['Nathan Tilly', 'Team Leader', []],
    ['Robert Starbuck', 'Group Head', []]
  ];
  var people = [];
  var members = [];
  var idOf = {};
  PEOPLE.forEach(function (p, i) {
    var siteId = 101 + i;
    idOf[p[0]] = siteId;
    people.push({
      Id: i + 1, Title: p[0], SiteUserId: siteId, Role: p[1], Status: 'Active', IsAdministrator: p[0] === 'Joe Pepper',
      Email: p[0].toLowerCase().replace(/[^a-z ]/g, '').replace(/ /g, '.') + '@example.test'
    });
    p[2].forEach(function (key) {
      members.push({ Id: members.length + 1, CompetencyId: ALL.indexOf(key) + 1, PersonId: siteId, CanManageMeetings: p[1] === 'Engineer', Status: 'Active' });
    });
  });
  function area(key) { return ALL.indexOf(key) + 1; }

  // [title, area, owner, raisedBy, dueOffset, status, extensions, linked]
  var ACTIONS = [
    ['Replace FH40 probe', 'FLK', 'Rachel Boulden', 'Kelly Bates', -2, 'In Progress', 1],
    ['Update Flask procedure FLK-03', 'FLK', 'Nick Pearce', 'Kelly Bates', 4, 'Open', 0],
    ['Leak-test kit replacement quote', 'FLK', 'Matt Henley', 'Ben Beak', 12, 'Awaiting Input', 2],
    ['Contamination monitor checks', 'FLK', 'Steve Punnett', 'Aiden Gorham', 21, 'Open', 0, ['RP']],
    ['Instrument shelf re-labelling', 'INS', 'Adam Washford', 'Jake Stafford', 9, 'Open', 0],
    ['Calibration certificate filing', 'INS', 'Kevin Hewitt', 'Chloe Tilly', 30, 'Open', 0],
    ['Green Stream sampling backlog', 'GRS', 'Luke Cain', 'Richard Harrisson', -9, 'In Progress', 3],
    ['Pump seal inspection', 'GRS', 'Kevin Hewitt', 'Kai Todd', -3, 'Open', 0],
    ['Review Green Stream sample results', 'GRS', 'Richard Harrisson', 'Andrea Medlicott', 3, 'Open', 0],
    ['Green Stream handover notes', 'GRS', 'Rachel Boulden', 'Kai Todd', 26, 'In Progress', 0],
    ['Monthly RPE equipment checks', 'RPE', 'Mark Buckley', 'Dave Beeching', 2, 'Open', 0],
    ['Fit-test record review', 'RPE', 'Charlie Everitt', 'Dave Beeching', 18, 'Open', 0],
    ['BA set servicing schedule', 'BA', 'Richard Howe', 'Ben Beak', 14, 'Open', 1],
    ['Update dosimetry issue log', 'DOS', 'Rachel Boulden', 'Ben Beak', 3, 'Open', 0],
    ['Dosimeter reader software update', 'DOS', 'Sadie Young', 'Chloe Tilly', 0, 'Completed', 0],
    ['Review RP survey frequencies', 'RP', 'Rachel Boulden', 'Andrea Medlicott', 6, 'Awaiting Input', 0],
    ['RP survey route map refresh', 'RP', 'Jenn Tibbenham', 'Craig Bunney', -1, 'Open', 0],
    ['Agree Q4 training priorities', 'RP', 'Joe Pepper', 'Robert Starbuck', 5, 'Open', 0],
    ['Hand monitor replacement plan', 'RP', 'Doti Cange-Ainsworth', 'Kai Todd', -6, 'In Progress', 2],
    ['Update DSL operating instruction', 'DSL', 'Richard Harrisson', 'Jake Stafford', 25, 'Open', 0],
    ['Check sampling line flow rates', 'ALS', 'Rachel Boulden', 'Craig Bunney', 19, 'Open', 0],
    ['Sampling pump wear assessment', 'ALS', 'Trevor Baldwin', 'Craig Bunney', -4, 'Completed', 1],
    ['Approve revised drum store labels', 'RW', 'Richard Harrisson', 'Kai Todd', -4, 'Open', 1],
    ['Drum inventory reconciliation', 'RW', 'Adam Washford', 'Richard Harrisson', -2, 'In Progress', 0],
    ['Waste route survey', 'RW', 'Trevor Baldwin', 'Kai Todd', -1, 'Open', 0],
    ['Sign off Radwaste audit response', 'RW', 'Joe Pepper', 'Robert Starbuck', 37, 'Open', 0]
  ];
  var actions = ACTIONS.map(function (a, i) {
    return {
      Id: 40 + i, Title: a[0], CompetencyId: area(a[1]), LinkedCompetenciesId: (a[7] || []).map(area),
      AssignedToId: idOf[a[2]], RaisedById: idOf[a[3]], DueDay: dueDay(a[4]), Status: a[5], IsOpen: true,
      ExtensionCount: a[6], RequiresCloseOut: a[5] === 'Completed', PendingRequestKey: '', CreatedRequestKey: 'IMPORT-' + (40 + i),
      FileDirRef: '/sites/ESGCompetencyHub/Lists/Actions/' + a[1],
      Description: 'Synthetic test action: ' + a[0].toLowerCase() + '.', Priority: 'Normal', Revision: 1 + a[6], LastRequestKey: '',
      DateRaised: at(Math.min(a[4], 0) - 20, '09:30:00'), OriginalDueDate: at(a[4] - 7 * a[6], '12:00:00'),
      Blocker: a[5] === 'Awaiting Input' ? 'Waiting for a quote from the supplier.' : ''
    };
  });
  // One History row per earlier extension, as the request flow writes them.
  var history = [];
  actions.forEach(function (a, i) {
    var due = ACTIONS[i][4];
    for (var n = 1; n <= a.ExtensionCount; n++) {
      history.push({ Id: history.length + 1, RowKind: 'Event', RequestKey: 'IMPORT-EXT-' + a.Id + '|' + n, RecordType: 'Action', RecordId: a.Id,
        EventType: 'Deadline Extended', ActorId: a.AssignedToId, EventTime: at(due - 7 * (a.ExtensionCount - n) - 10, '14:00:00'),
        ExtensionNumber: n, PreviousDueDate: at(due - 7 * (a.ExtensionCount - n + 1), '12:00:00'), NewDueDate: at(due - 7 * (a.ExtensionCount - n), '12:00:00'),
        Note: 'Waiting for parts from the supplier.', IsOnBehalf: false,
        FileDirRef: '/sites/ESGCompetencyHub/Lists/History/' + ACTIONS[i][1] + '/A' + a.Id });
    }
  });
  // Finished actions, read only when someone asks for them ("Show finished items").
  [[90, 'Replace FH30 probe', 'FLK', 'Rachel Boulden', 'Kelly Bates', -30, 'Completed', ''],
   [91, 'Old survey sheets archived', 'RP', 'Rachel Boulden', 'Andrea Medlicott', -12, 'No longer required', 'Sheets were scanned instead.']]
    .forEach(function (c) {
      actions.push({ Id: c[0], Title: c[1], CompetencyId: area(c[2]), LinkedCompetenciesId: [], AssignedToId: idOf[c[3]], RaisedById: idOf[c[4]],
        DueDay: dueDay(c[5]), Status: 'Closed', IsOpen: false, ExtensionCount: 0, RequiresCloseOut: false, PendingRequestKey: '',
        CreatedRequestKey: 'IMPORT-' + c[0], FileDirRef: '/sites/ESGCompetencyHub/Lists/Actions/' + c[2], Description: 'Synthetic finished action.',
        Priority: 'Normal', Revision: 2, LastRequestKey: '', DateRaised: at(c[5] - 20, '09:30:00'), OriginalDueDate: at(c[5], '12:00:00'),
        DateClosed: at(c[5] + 2, '16:00:00'), CloseOutcome: c[6], ClosureNote: c[7], ClosedById: idOf[c[4]] });
    });
  // An uncommitted create that must never appear on screen.
  actions.push({ Id: 99, Title: 'Half-created action (must stay hidden)', CompetencyId: 1, LinkedCompetenciesId: [], AssignedToId: idOf['Rachel Boulden'],
    RaisedById: idOf['Kelly Bates'], DueDay: dueDay(1), Status: 'Open', IsOpen: true, ExtensionCount: 0, RequiresCloseOut: false,
    PendingRequestKey: 'req-uncommitted', CreatedRequestKey: 'F|req-uncommitted', FileDirRef: '/sites/ESGCompetencyHub/Lists/Actions/FLK' });

  function notice(id, key, title, body, category, author, dayOffset, important) {
    return { Id: id, Title: title, Body: body, Category: category, IsImportant: !!important, ImportantUntil: important ? at(dayOffset + 30) : null,
      Status: 'Active', AuthorId: idOf[author], Created: at(dayOffset, '10:15:00'), FileDirRef: '/sites/ESGCompetencyHub/Lists/Noticeboard/' + key,
      ClientKey: 'seed-' + id };
  }
  var notices = [
    notice(1, 'FLK', 'Calibration rig out of service', 'The Flask calibration rig is out of service until the replacement part arrives.', 'Equipment', 'Nick Pearce', -1, true),
    notice(2, 'FLK', 'Spare probe stock levels', 'Only two spare probes remain in stores.', 'Equipment', 'Kelly Bates', -6),
    notice(3, 'RP', 'Revised survey route map', 'The revised RP survey route map is in the shared folder.', 'General', 'Andrea Medlicott', -2),
    notice(4, 'ALS', 'Sampling pump wear', 'Pump 2 is showing wear; an assessment action has been raised.', 'Equipment', 'Trevor Baldwin', -3),
    notice(5, 'RW', 'Could Radwaste spare two empty drums?', 'Green Stream needs two empty drums for next week. Could someone let me know if any are spare?', 'Request', 'Luke Cain', -1),
    notice(6, 'GRS', 'Green Stream pump seal leak', 'Small weep from the pump seal, being monitored.', 'Safety', 'Kevin Hewitt', -4),
    notice(7, 'DSL', 'Improvement idea: shared checklist', 'A shared pre-job checklist would save time for everyone working in DSL.', 'Improvement idea', 'Rachel Boulden', -2)
  ];

  function flag(id, key, parentId, entry, author, dayOffset) {
    return { Id: id, EntryType: entry, ParentType: 'Notice', ParentId: parentId, AuthorId: idOf[author], Created: at(dayOffset, '11:00:00'),
      FileDirRef: '/sites/ESGCompetencyHub/Lists/Updates/' + key, IsHidden: false, IsFlagEvent: true };
  }
  var progress = { Id: 100, EntryType: 'Progress', ParentType: 'Action', ParentId: 40, AuthorId: idOf['Rachel Boulden'], Created: at(-1, '15:20:00'),
    FileDirRef: '/sites/ESGCompetencyHub/Lists/Updates/FLK/A40', IsHidden: false, IsFlagEvent: false, ClientKey: 'seed-100',
    Body: 'Replacement probe ordered; delivery expected next week.' };
  var updates = [progress,
    flag(1, 'FLK', 1, 'Flagged', 'Nick Pearce', -1),
    flag(2, 'FLK', 2, 'Flagged', 'Matt Henley', -5),
    flag(3, 'RP', 3, 'Flagged', 'Jenn Tibbenham', -2),
    flag(4, 'RW', 5, 'Flagged', 'Adam Washford', -1),
    flag(5, 'FLK', 2, 'Flag Withdrawn', 'Rachel Boulden', -4),   // not entitled to withdraw: ignored
    flag(6, 'FLK', 3, 'Flagged', 'Rachel Boulden', -1),          // notice 3 belongs to RP: ignored
    flag(7, 'RW', 5, 'Flagged', 'Rachel Boulden', -1)            // not a Radwaste member: ignored
  ];

  // [area, nextOffset or null, lastOffset]
  var MEETINGS = [['FLK', 21, -7], ['INS', 22, -6], ['GRS', null, -49], ['RPE', 28, -1], ['BA', 23, -12], ['DOS', 29, 0],
    ['RP', 27, -8], ['DSL', 30, -5], ['ALS', 34, 1], ['RW', 22, -13]];
  var meetings = [];
  MEETINGS.forEach(function (m) {
    meetings.push({ Id: meetings.length + 1, CompetencyId: area(m[0]), MeetingDate: at(Math.min(m[2], 0) - 1, '10:00:00'), Status: 'Finalised', ChairId: idOf['Kelly Bates'] });
    if (m[1] !== null) meetings.push({ Id: meetings.length + 1, CompetencyId: area(m[0]), MeetingDate: at(m[1], '10:00:00'), Status: 'Scheduled', ChairId: idOf['Kelly Bates'] });
  });

  var calendar = [
    { Id: 1, Title: 'Flask audit preparation', StartTime: at(9), AllDay: true, IsImportant: true, Status: 'Scheduled', FileDirRef: '/sites/ESGCompetencyHub/Lists/CalendarEvents/FLK' },
    { Id: 2, Title: 'Probe calibration window', StartTime: at(15), AllDay: false, IsImportant: false, Status: 'Scheduled', FileDirRef: '/sites/ESGCompetencyHub/Lists/CalendarEvents/FLK' },
    { Id: 3, Title: 'Station audit – RP records', StartTime: at(7), AllDay: true, IsImportant: true, Status: 'Scheduled', FileDirRef: '/sites/ESGCompetencyHub/Lists/CalendarEvents/RP' },
    { Id: 4, Title: 'Drum collection', StartTime: at(11), AllDay: true, IsImportant: false, Status: 'Scheduled', FileDirRef: '/sites/ESGCompetencyHub/Lists/CalendarEvents/RW' }
  ];

  return {
    'Competencies': competencies, 'People': people, 'Competency Members': members, 'Actions': actions,
    'Noticeboard': notices, 'Updates': updates, 'Meetings': meetings, 'Calendar Events': calendar,
    'Requests': [], 'History': history
  };
};
