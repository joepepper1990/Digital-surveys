// ESG Competency Hub — Release 2 permission probe (plan REV5 §7.1 PR, §8). Run it signed in as the ORDINARY
// test account (a technician added through the People page), never as a site owner: an owner passes every
// check by bypassing permissions, which proves nothing.
// "Run read checks" only reads. "Run write checks" tries writes that must be refused, and makes at most one
// TEST notice and two TEST requests, all marked as test records.
window.ESGCompetencyHubProbeP2 = function (ctx) {
    'use strict';

    var VERSION = 'P2-1';
    var MANAGE_PERMISSIONS_LOW = 0x02000000;
    var SELF_ONLY = 'As a technician you can raise actions for yourself in this area.';
    var POLL_MS = 20000, POLL_LIMIT = 24;   // up to 8 minutes for the flow
    var LISTS = {
        people: 'People', members: 'Competency Members', competencies: 'Competencies', actions: 'Actions',
        history: 'History', notices: 'Noticeboard', updates: 'Updates', requests: 'Requests',
        feedback: 'Feedback', notifications: 'Notification Log'
    };
    var URLS = { actions: 'Actions', history: 'History', notices: 'Noticeboard', updates: 'Updates', requests: 'Requests' };

    var state = { siteUrl: '', siteRelative: '', me: null, person: null, areas: [], mine: [], admins: [], isOwner: false };
    var results = [];
    var ui = {};
    var http, httpConfig, digest = '';
    var disposed = false, busy = false;

    function el(tag, text, cls) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }
    function getRoot() { return document.querySelector('[data-chprobe2-root]'); }
    function setStatus(message) {
        var slot = getRoot() && getRoot().querySelector('[data-chprobe2-status]');
        if (slot) slot.textContent = message;
    }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function classify(status) {
        if (status >= 200 && status < 300) return 'OK';
        if (status === 401 || status === 403) return 'DENIED';
        if (status === 404) return 'NOT FOUND';
        return 'ERROR';
    }
    function rows(json) {
        if (!json) return [];
        if (Array.isArray(json.value)) return json.value;
        if (json.d && Array.isArray(json.d.results)) return json.d.results;
        return [];
    }
    function listPath(title) { return "/_api/web/lists/getbytitle('" + title.replace(/'/g, "''") + "')"; }
    function q(text) { return String(text).replace(/'/g, "''"); }
    function newKey() {
        var b = new Uint8Array(16);
        (window.crypto || window.msCrypto).getRandomValues(b);
        b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
        var hex = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }

    async function call(method, path, body, extraHeaders) {
        var headers = { 'Accept': 'application/json;odata=nometadata' };
        var options = { headers: headers };
        try {
            if (method !== 'GET') {
                headers['Content-Type'] = 'application/json;odata=nometadata';
                if (path !== '/_api/contextinfo') {
                    if (!digest) {
                        var info = await call('POST', '/_api/contextinfo');
                        digest = info.json && (info.json.FormDigestValue || '');
                    }
                    headers['X-RequestDigest'] = digest;
                }
                Object.keys(extraHeaders || {}).forEach(function (k) { headers[k] = extraHeaders[k]; });
                options.body = body === undefined ? '' : JSON.stringify(body);
            }
            var response = method === 'GET' ? await http.get(state.siteUrl + path, httpConfig, options)
                                             : await http.post(state.siteUrl + path, httpConfig, options);
            var text = await response.text();
            var json = null;
            try { json = text ? JSON.parse(text) : null; } catch (_) { /* keep raw */ }
            return { status: response.status, outcome: classify(response.status), json: json };
        } catch (error) {
            return { status: 0, outcome: 'ERROR', json: null, error: String(error && error.message ? error.message : error) };
        }
    }
    function short(r) {
        // Response bodies are left out on purpose: they can contain tenant details.
        return r.status ? 'HTTP ' + r.status + ' (' + r.outcome + ')' : 'No response (' + (r.error || 'network error') + ')';
    }

    // Creates an item in a folder the way the app does. Refused means HTTP 401/403, or a field exception that
    // says access was denied; anything else that is not a success is reported as an error, never as a pass.
    async function addToFolder(key, folder, values) {
        var r = await call('POST', listPath(LISTS[key]) + '/AddValidateUpdateItemUsingPath', {
            listItemCreateInfo: { FolderPath: { DecodedUrl: state.siteRelative + '/Lists/' + URLS[key] + (folder ? '/' + folder : '') }, UnderlyingObjectType: 0 },
            formValues: Object.keys(values).map(function (k) { return { FieldName: k, FieldValue: String(values[k]) }; }),
            bNewDocumentUpdate: false
        });
        var fields = rows(r.json);
        var failed = fields.filter(function (f) { return f.HasException; });
        var id = fields.filter(function (f) { return f.FieldName === 'Id'; })[0];
        if (r.outcome === 'OK' && failed.length) {
            var denied = failed.some(function (f) { return /access denied|permission/i.test(f.ErrorMessage || ''); });
            return { outcome: denied ? 'DENIED' : 'ERROR', status: r.status, detail: failed.map(function (f) { return f.FieldName; }).join(', ') };
        }
        return { outcome: r.outcome, status: r.status, id: id ? Number(id.FieldValue) : null, detail: short(r) };
    }

    function record(id, name, result, outcome, detail) {
        if (disposed) return;
        results.push({ id: id, name: name, result: result, outcome: outcome, detail: detail || '' });
        render();
    }
    // A write that must be refused: refused is a pass, success is a fail, anything else needs a look.
    function expectRefused(id, name, r) {
        record(id, name, r.outcome === 'DENIED' ? 'PASS' : r.outcome === 'OK' ? 'FAIL' : 'NOTE', r.outcome, r.detail || short(r));
    }

    function redactedText() {
        var lines = ['ESG Competency Hub permission probe ' + VERSION + ' - ' + new Date().toISOString(), 'Browser: ' + navigator.userAgent];
        results.forEach(function (e) { lines.push([e.id, e.result, e.outcome, e.name, e.detail].join(' | ')); });
        var text = lines.join('\n');
        if (ui.redact && ui.redact.checked) {
            var me = state.me || {};
            [[me.Email, '<EMAIL>'], [me.Title, '<NAME>'], [state.siteUrl, '<SITE>'], [window.location.host, '<TENANT-HOST>']].forEach(function (pair) {
                if (pair[0]) text = text.split(pair[0]).join(pair[1]);
            });
            text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<EMAIL>');
        }
        return text;
    }
    function render() {
        if (!ui.tbody || disposed) return;
        ui.tbody.textContent = '';
        results.forEach(function (e) {
            var tr = el('tr');
            tr.appendChild(el('td', e.id));
            tr.appendChild(el('td', e.result, e.result.toLowerCase()));
            tr.appendChild(el('td', e.outcome));
            tr.appendChild(el('td', e.name));
            tr.appendChild(el('td', e.detail, 'info'));
            ui.tbody.appendChild(tr);
        });
        ui.output.value = redactedText();
    }

    function build() {
        var slot = getRoot() && getRoot().querySelector('[data-chprobe2-controls]');
        if (!slot) throw new Error('Welcome controls element not found');
        slot.textContent = '';
        ui.readButton = el('button', 'Run read checks');
        ui.readButton.type = 'button';
        ui.readButton.addEventListener('click', function () { run(false); });
        ui.writeButton = el('button', 'Run write checks (adds one TEST notice and up to two TEST requests)');
        ui.writeButton.type = 'button';
        ui.writeButton.addEventListener('click', function () { run(true); });
        slot.appendChild(ui.readButton);
        slot.appendChild(ui.writeButton);
        var table = el('table');
        var header = el('tr');
        ['Check', 'Result', 'Outcome', 'What', 'Detail'].forEach(function (c) { header.appendChild(el('th', c)); });
        table.appendChild(header);
        ui.tbody = el('tbody');
        table.appendChild(ui.tbody);
        slot.appendChild(table);
        var label = el('label');
        ui.redact = el('input');
        ui.redact.type = 'checkbox';
        ui.redact.checked = true;
        ui.redact.addEventListener('change', render);
        label.appendChild(ui.redact);
        label.appendChild(el('span', ' Hide names, email addresses and the site address in the results'));
        slot.appendChild(label);
        slot.appendChild(el('p', 'Copy everything in this box and send it back:', 'info'));
        ui.output = el('textarea');
        ui.output.readOnly = true;
        slot.appendChild(ui.output);
        render();
    }

    // Who is running the probe, from the Hub's own lists.
    async function identify() {
        var me = await call('GET', '/_api/web/currentuser?$select=Id,Title,Email');
        if (me.outcome !== 'OK' || !me.json) { record('P0', 'Signed-in user identified', 'FAIL', me.outcome, short(me)); return false; }
        state.me = me.json;
        var perms = await call('GET', '/_api/web/effectiveBasePermissions');
        var low = perms.json && (perms.json.Low !== undefined ? perms.json.Low : perms.json.d && perms.json.d.EffectiveBasePermissions && perms.json.d.EffectiveBasePermissions.Low);
        state.isOwner = low !== undefined && (Number(low) & MANAGE_PERMISSIONS_LOW) !== 0;
        if (state.isOwner) {
            record('P0', 'Run as an ordinary account, not a site owner', 'FAIL', 'OWNER', 'You can manage permissions here, so every check would pass by bypassing them. Sign in as the test account.');
            return false;
        }
        var person = await call('GET', listPath(LISTS.people) + '/items?$select=Id,Title,Role,Status,IsAdministrator,CanPostNotices,SiteUserId,Email&$filter=SiteUserId eq ' + Number(state.me.Id));
        state.person = rows(person.json)[0] || null;
        if (!state.person || state.person.Status !== 'Active') {
            record('P0', 'The test account is an active person in the Hub', 'FAIL', person.outcome, 'Add it through Administration → People first.');
            return false;
        }
        var areas = await call('GET', listPath(LISTS.competencies) + "/items?$select=Id,Title,CompetencyKey,Status&$filter=Status eq 'Active'");
        state.areas = rows(areas.json);
        var mine = await call('GET', listPath(LISTS.members) + "/items?$select=CompetencyId,CanManageMeetings,Status&$filter=PersonId eq " + Number(state.me.Id) + " and Status eq 'Active'");
        state.mine = rows(mine.json);
        var people = await call('GET', listPath(LISTS.people) + "/items?$select=SiteUserId,Title,Role,IsAdministrator,Status&$filter=Status eq 'Active'");
        state.others = rows(people.json).filter(function (p) { return Number(p.SiteUserId) !== Number(state.me.Id); });
        var keyOf = function (id) { return (state.areas.filter(function (a) { return a.Id === id; })[0] || {}).CompetencyKey; };
        record('P0', 'Who is running the probe', 'NOTE', 'OK', state.person.Role + ' · areas: ' +
            (state.mine.map(function (m) { return keyOf(m.CompetencyId) + (m.CanManageMeetings ? ' (runs meetings)' : ''); }).join(', ') || 'none') +
            ' · can post notices: ' + (state.person.CanPostNotices === false ? 'no' : 'yes'));
        return true;
    }

    function areaKey(id) { return (state.areas.filter(function (a) { return a.Id === id; })[0] || {}).CompetencyKey; }
    function memberKeys() { return state.mine.map(function (m) { return areaKey(m.CompetencyId); }).filter(Boolean); }
    function otherKey() {
        var mineKeys = memberKeys();
        return (state.areas.filter(function (a) { return mineKeys.indexOf(a.CompetencyKey) < 0; })[0] || {}).CompetencyKey;
    }

    async function readChecks() {
        var fb = await call('GET', listPath(LISTS.feedback) + '/items?$select=Id&$top=5');
        record('R1', 'Other people\'s feedback cannot be read', fb.outcome === 'DENIED' || (fb.outcome === 'OK' && rows(fb.json).length === 0) ? 'PASS' : 'FAIL',
            fb.outcome, fb.outcome === 'OK' ? rows(fb.json).length + ' item(s) visible' : short(fb));
        var nl = await call('GET', listPath(LISTS.notifications) + '/items?$select=Id&$top=5');
        record('R2', 'The email ledger cannot be read', nl.outcome === 'DENIED' || (nl.outcome === 'OK' && rows(nl.json).length === 0) ? 'PASS' : 'FAIL',
            nl.outcome, nl.outcome === 'OK' ? rows(nl.json).length + ' item(s) visible' : short(nl));
        var tx = await call('GET', listPath(LISTS.history) + "/items?$select=Id&$top=5&$filter=RowKind eq 'Transaction'");
        record('R3', 'Change transactions (administrators only) cannot be read', tx.outcome === 'DENIED' || (tx.outcome === 'OK' && rows(tx.json).length === 0) ? 'PASS' : 'FAIL',
            tx.outcome, tx.outcome === 'OK' ? rows(tx.json).length + ' row(s) visible' : short(tx));
        var rq = await call('GET', listPath(LISTS.requests) + '/items?$select=Id,AuthorId&$top=50');
        var foreign = rows(rq.json).filter(function (r) { return Number(r.AuthorId) !== Number(state.me.Id); });
        record('R4', 'Only your own requests can be read', rq.outcome === 'OK' && foreign.length === 0 ? 'PASS' : rq.outcome === 'DENIED' ? 'NOTE' : 'FAIL',
            rq.outcome, rq.outcome === 'OK' ? foreign.length + ' request(s) from other people visible' : short(rq));
        var acts = await call('GET', listPath(LISTS.actions) + '/items?$select=Id&$top=1');
        record('R5', 'Every area\'s actions can be read (everyone reads every area)', acts.outcome === 'OK' ? 'PASS' : 'FAIL', acts.outcome, short(acts));
    }

    async function writeChecks() {
        var mineKeys = memberKeys();
        var home = mineKeys[0], away = otherKey();
        var admin = state.others.filter(function (p) { return p.IsAdministrator; })[0];
        var tag = 'TEST probe ' + VERSION + ' – please ignore';

        expectRefused('W1', 'Adding an action directly (only the flows may)', await addToFolder('actions', home || away, { Title: tag }));
        expectRefused('W2', 'Writing History directly (only the flows may)', await addToFolder('history', 'Administration', { Title: tag, RowKind: 'Event', RequestKey: 'probe|' + newKey() }));
        expectRefused('W3', 'Sending a request from the top of the Requests list', await addToFolder('requests', '', { Title: tag, RequestKey: newKey(), RequestType: 'Probe', Payload: '{}', Status: 'Submitted' }));
        if (admin) expectRefused('W4', 'Sending a request from another person\'s folder', await addToFolder('requests', 'u' + admin.SiteUserId,
            { Title: tag, RequestKey: newKey(), RequestType: 'Probe', Payload: '{}', Status: 'Submitted' }));
        if (away) expectRefused('W5', 'Adding an update in an area you are not a member of (' + away + ')', await addToFolder('updates', away,
            { Title: tag, ClientKey: newKey(), ParentType: 'Notice', ParentId: '0', EntryType: 'Comment', IsFlagEvent: '0', Body: tag, IsHidden: '0' }));

        // Notices: posting follows the person's switch; once posted a notice cannot be edited or deleted by its author.
        var clientKey = newKey();
        var values = { Title: tag, Body: tag, Category: 'General', IsImportant: '0', ClientKey: clientKey, CreatedRequestKey: 'U|' + clientKey, Status: 'Active', IsTestRecord: '1' };
        if (admin && admin.Email) values.Author = JSON.stringify([{ Key: 'i:0#.f|membership|' + admin.Email }]);
        var posted = await addToFolder('notices', away || home, values);
        if (state.person.CanPostNotices === false) {
            expectRefused('N1', 'Posting a notice while your "Can post notices" switch is off', posted);
        } else if (posted.outcome !== 'OK' || !posted.id) {
            record('N1', 'Posting a notice in any area (switch on)', 'FAIL', posted.outcome, posted.detail);
        } else {
            record('N1', 'Posting a notice in any area (switch on)', 'PASS', 'OK', 'Notice ' + posted.id + ' in ' + (away || home));
            var back = await call('GET', listPath(LISTS.notices) + '/items(' + posted.id + ')?$select=AuthorId');
            var author = back.json && Number(back.json.AuthorId);
            record('N2', 'The notice is recorded as yours even when another author is typed in (P-05)', author === Number(state.me.Id) ? 'PASS' : 'FAIL', back.outcome,
                author ? (author === Number(state.me.Id) ? 'Author is you' : 'Author is someone else') : short(back));
            var edit = await call('POST', listPath(LISTS.notices) + '/items(' + posted.id + ')/ValidateUpdateListItem',
                { formValues: [{ FieldName: 'Title', FieldValue: tag + ' (edited)' }], bNewDocumentUpdate: false });
            var editFailed = rows(edit.json).some(function (f) { return f.HasException; });
            record('N3', 'Your own notice cannot be edited directly (add-only, P-13)', edit.outcome === 'DENIED' || editFailed ? 'PASS' : edit.outcome === 'OK' ? 'FAIL' : 'NOTE', edit.outcome, short(edit));
            var del = await call('POST', listPath(LISTS.notices) + '/items(' + posted.id + ')/recycle');
            record('N4', 'Your own notice cannot be deleted', del.outcome === 'DENIED' ? 'PASS' : del.outcome === 'OK' ? 'FAIL' : 'NOTE', del.outcome, short(del));
        }

        // The technician restriction, as the flow applies it to a request sent from the app's own path.
        var plain = state.mine.filter(function (m) { return !m.CanManageMeetings; })[0];
        var chair = state.mine.filter(function (m) { return m.CanManageMeetings; })[0];
        var due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        async function raiseFor(member, id, expectAccepted) {
            var key = areaKey(member.CompetencyId);
            // management can own an action in any area, so the owner is always eligible and only the restriction decides
            var other = state.others.filter(function (p) { return p.Role === 'Team Leader' || p.Role === 'Group Head'; })[0];
            if (!other) { record(id, 'Raising for someone else in ' + key, 'NOTE', 'SKIPPED', 'Nobody else is in the Hub yet.'); return; }
            var rk = newKey();
            var sent = await addToFolder('requests', 'u' + state.me.Id, { Title: tag, RequestKey: rk, RequestType: 'RaiseAction', TargetType: '', TargetId: '', ExpectedRevision: '',
                Payload: JSON.stringify({ areaKey: key, title: tag, description: tag, ownerId: Number(other.SiteUserId), dueIso: due, priority: 'Low', requiresCloseOut: false }), Status: 'Submitted' });
            var name = expectAccepted ? 'Raising for someone else where you run meetings (' + key + ') is accepted'
                                      : 'Raising for someone else where you do not run meetings (' + key + ') is refused';
            if (sent.outcome !== 'OK') { record(id, name, 'FAIL', sent.outcome, 'Your own request folder refused the request: ' + sent.detail); return; }
            setStatus('Waiting for the request queue flow (up to 8 minutes)…');
            for (var i = 0; i < POLL_LIMIT && !disposed; i++) {
                await wait(POLL_MS);
                var r = await call('GET', listPath(LISTS.requests) + "/items?$select=Status,ResultMessage&$filter=RequestKey eq '" + q(rk) + "'");
                var row = rows(r.json)[0];
                if (!row || ['Submitted', 'Processing', 'Failed'].indexOf(row.Status) >= 0) continue;
                var ok = expectAccepted ? row.Status === 'Completed' : row.Status === 'Rejected' && (row.ResultMessage || '').indexOf(SELF_ONLY) === 0;
                record(id, name, ok ? 'PASS' : 'FAIL', row.Status, row.ResultMessage || '');
                return;
            }
            record(id, name, 'NOTE', 'TIMED OUT', 'The flow did not answer within 8 minutes. Check that 2 Request queue is on, then run the write checks again.');
        }
        if (state.person.Role !== 'Technician') record('T1', 'Technician restriction', 'NOTE', 'SKIPPED', 'The test account must be a Technician for this check.');
        else if (plain) await raiseFor(plain, 'T1', false);
        else record('T1', 'Technician restriction', 'NOTE', 'SKIPPED', 'Give the test account one area without "Can run meetings".');
        if (chair) await raiseFor(chair, 'T2', true);
        else record('T2', 'Meeting rights allow raising for others', 'NOTE', 'SKIPPED', 'Turn on "Can run meetings" in one area to run this check.');
    }

    async function run(writes) {
        if (busy || disposed) return;
        busy = true;
        ui.readButton.disabled = ui.writeButton.disabled = true;
        results = [];
        render();
        try {
            setStatus('Running…');
            if (await identify()) {
                await readChecks();
                if (writes) await writeChecks();
            }
            setStatus('Finished. Copy the results box and send it back.');
        } catch (error) {
            record('X', 'Probe stopped unexpectedly', 'FAIL', 'ERROR', String(error && error.message ? error.message : error));
        } finally {
            busy = false;
            if (!disposed) ui.readButton.disabled = ui.writeButton.disabled = false;
        }
    }

    return {
        onInitialize: function () {
            try {
                var wp = ctx.getWebPart();
                http = wp.spHttpClient;
                httpConfig = http.constructor.configurations ? http.constructor.configurations.v1 : undefined;
                state.siteUrl = wp.pageContext.web.absoluteUrl.replace(/\/$/, '');
                state.siteRelative = state.siteUrl.replace(/^https?:\/\/[^/]+/, '');
                build();
                setStatus('Ready. Signed in as the test account? Run the read checks first.');
            } catch (error) {
                setStatus('The probe could not start: ' + (error && error.message ? error.message : error));
            }
        },
        onError: function (error) { setStatus('Welcome reported an error: ' + (error && error.message ? error.message : error)); },
        onDispose: function () { disposed = true; }
    };
};
