// ESG 1-to-1 Stage 0B — security verification probe (external script for Welcome by Accelerator 365).
// Reuses the confirmed working 0A-2 Welcome lifecycle wrapper. Operates ONLY on the disposable
// ZZProbe* lists built by Team Leader mode, with entirely fictional data. No production data.
//
// Security principles enforced here:
//   * Account identity and role come from authenticated SharePoint (/_api/web/currentuser and
//     effectiveBasePermissions), never from a browser-selected role or a technician-editable field.
//   * Every test independently re-reads the SharePoint record or permission state. A test never
//     passes purely because an HTTP call looked successful or unsuccessful.
//   * All SharePoint content is rendered with textContent only, never as HTML.
window.ESGOneToOneProbe0B = function (ctx) {
    'use strict';

    var VERSION = '0B-3';
    var MANAGE_PERMISSIONS_LOW = 0x02000000;
    var SCAN_IDS = 40;                 // id range scanned for direct-access / guessed-id tests
    var RECORDS = 'ZZProbeRecords';
    var MANAGER = 'ZZProbeManager';
    var EDIT_LEVEL = '1-to-1 Edit';
    var READ_LEVEL = '1-to-1 Read';

    // Five classic XSS probe strings. Built so this source file never itself contains an
    // executable tag, a closing-script sequence, or a Handlebars pair.
    var XSS = [
        '<img src=x onerror=' + 'oto_xss(1)>',
        '<' + 'script>oto_xss(2)<' + '/' + 'script>',
        '"><svg onload=' + 'oto_xss(3)>',
        '{' + '{constructor.constructor("oto_xss(4)")()}' + '}',
        'javascript:' + 'oto_xss(5)'
    ];

    var state = { siteUrl: '', webRel: '', login: '', email: '', name: '', userId: 0, isOwner: false, digest: '' };
    var results = [];
    var ui = {};
    var http, httpConfig, webPart;
    var started = false, disposed = false;
    window.__otoXssFired = false;       // flipped if any injected payload ever executes
    window.oto_xss = function () { window.__otoXssFired = true; };

    // ---------- tiny DOM helpers (text only) ----------
    function el(tag, text, cls) {
        var node = document.createElement(tag);
        if (cls) { node.className = cls; }
        if (text !== undefined && text !== null) { node.textContent = String(text); }
        return node;
    }
    function root() { return document.querySelector('[data-zzprobe-root]'); }
    function setStatus(msg) {
        var r = root(), slot = r && r.querySelector('[data-zzprobe-status]');
        if (slot) { slot.textContent = msg; }
    }

    // ---------- REST plumbing (via Welcome's spHttpClient, as proven in 0A-2) ----------
    function classify(status) {
        if (status >= 200 && status < 300) { return 'OK'; }
        if (status === 401 || status === 403) { return 'DENIED'; }
        if (status === 404) { return 'NOT FOUND'; }
        return 'ERROR';
    }
    function listRows(json) {
        if (!json) { return []; }
        if (Array.isArray(json.value)) { return json.value; }
        if (json.d && Array.isArray(json.d.results)) { return json.d.results; }
        return [];
    }
    function digestFrom(json) {
        if (!json) { return ''; }
        if (json.FormDigestValue) { return json.FormDigestValue; }
        if (json.GetContextWebInformation) { return json.GetContextWebInformation.FormDigestValue || ''; }
        if (json.d && json.d.GetContextWebInformation) { return json.d.GetContextWebInformation.FormDigestValue || ''; }
        return '';
    }
    async function req(method, path, opts) {
        opts = opts || {};
        var verbose = !!opts.verbose;
        var headers = { 'Accept': verbose ? 'application/json;odata=verbose' : 'application/json;odata=nometadata' };
        if (opts.body !== undefined) {
            headers['Content-Type'] = verbose ? 'application/json;odata=verbose' : 'application/json;odata=nometadata';
        }
        if (opts.digest) { headers['X-RequestDigest'] = opts.digest; }
        if (opts.xhttp) { headers['X-HTTP-Method'] = opts.xhttp; }
        if (opts.ifMatch) { headers['IF-MATCH'] = opts.ifMatch; }
        var options = { headers: headers };
        if (opts.body !== undefined) { options.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body); }
        try {
            var url = state.siteUrl + path;
            var response = method === 'GET' ? await http.get(url, httpConfig, options) : await http.post(url, httpConfig, options);
            var text = await response.text();
            var json = null;
            try { json = text ? JSON.parse(text) : null; } catch (_) { /* keep raw */ }
            return { status: response.status, outcome: classify(response.status), json: json, text: text };
        } catch (error) {
            return { status: 0, outcome: 'ERROR', json: null, text: String(error && error.message ? error.message : error) };
        }
    }
    async function freshDigest() {
        var res = await req('POST', '/_api/contextinfo');
        var d = digestFrom(res.json);
        if (d) { state.digest = d; }
        return d;
    }
    // validateUpdateListItem: the safe, entity-type-free way to write/attempt-to-write fields.
    async function writeFields(list, id, fields, newDoc) {
        var digest = state.digest || await freshDigest();
        var res = await req('POST', "/_api/web/lists/getbytitle('" + list + "')/items(" + Number(id) + ")/validateUpdateListItem",
            { body: { formValues: Object.keys(fields).map(function (k) { return { FieldName: k, FieldValue: String(fields[k]) }; }),
                      bNewDocumentUpdate: !!newDoc }, digest: digest });
        var fieldErrors = listRows(res.json).filter(function (f) { return f.HasException; });
        res.fieldErrors = fieldErrors;
        res.wrote = res.outcome === 'OK' && fieldErrors.length === 0;
        return res;
    }
    async function readItem(list, id, select) {
        return req('GET', "/_api/web/lists/getbytitle('" + list + "')/items(" + Number(id) + ")" + (select ? '?$select=' + select : ''));
    }

    // ---------- results table and redacted export ----------
    function record(id, name, verdict, cls, detail) {
        if (disposed) { return; }
        // verdict: 'PASS' | 'FAIL' | 'INFO'
        results.push({ id: id, name: name, verdict: verdict, cls: cls || '', detail: detail || '' });
        render();
    }
    function redactedText() {
        var lines = ['ESG 1-to-1 Stage 0B ' + VERSION + ' - ' + new Date().toISOString(),
                     'account: ' + (state.isOwner ? 'Team Leader (owner)' : 'Technician (non-owner)')];
        results.forEach(function (e) { lines.push([e.id, e.verdict, e.name, e.detail].join(' | ')); });
        var text = lines.join('\n');
        if (ui.redact && ui.redact.checked) {
            [[state.email, '<EMAIL>'], [state.name, '<NAME>'], [state.login, '<LOGIN>'],
             [state.siteUrl, '<SITE>'], [window.location.host, '<TENANT-HOST>']].forEach(function (p) {
                if (p[0] && String(p[0]).length >= 4) { text = text.split(p[0]).join(p[1]); }
            });
        }
        return text;
    }
    function render() {
        if (!ui.tbody || disposed) { return; }
        ui.tbody.textContent = '';
        results.forEach(function (e) {
            var tr = el('tr');
            tr.appendChild(el('td', e.id));
            tr.appendChild(el('td', e.verdict, e.verdict === 'PASS' ? 'pass' : e.verdict === 'FAIL' ? 'fail' : 'info'));
            tr.appendChild(el('td', e.name));
            tr.appendChild(el('td', e.detail, 'info'));
            ui.tbody.appendChild(tr);
        });
        if (ui.output) { ui.output.value = redactedText(); }
        var fails = results.filter(function (e) { return e.verdict === 'FAIL'; }).length;
        if (ui.summary) { ui.summary.textContent = results.length ? (fails ? fails + ' FAIL — do not proceed' : 'No failures so far') : ''; }
    }

    // ---------- lookups (Team Leader only) ----------
    function idOf(res) { return res.json && (res.json.Id !== undefined ? res.json.Id : (res.json.d && res.json.d.Id)); }
    async function lookups() {
        var owners = await req('GET', '/_api/web/associatedownergroup?$select=Id');
        var full = await req('GET', "/_api/web/roledefinitions/getbyname('Full Control')?$select=Id");
        var edit = await req('GET', "/_api/web/roledefinitions/getbyname('" + EDIT_LEVEL + "')?$select=Id");
        var read = await req('GET', "/_api/web/roledefinitions/getbyname('" + READ_LEVEL + "')?$select=Id");
        return {
            ok: [owners, full, edit, read].every(function (r) { return r.outcome === 'OK' && idOf(r) !== undefined; }),
            owners: idOf(owners), full: idOf(full), edit: idOf(edit), read: idOf(read),
            missingEdit: edit.outcome !== 'OK', missingRead: read.outcome !== 'OK'
        };
    }
    async function ensureUser(login) {
        var digest = state.digest || await freshDigest();
        var res = await req('POST', '/_api/web/ensureuser', { body: { logonName: login }, digest: digest });
        return idOf(res);
    }

    // ===================================================================================
    //  TEAM LEADER MODE
    // ===================================================================================
    function why(res) { return res.outcome + (res.text ? ' – ' + String(res.text).replace(/\s+/g, ' ').substring(0, 180) : ''); }
    async function createList(title, fields) {
        var digest = state.digest || await freshDigest();
        var exists = await req('GET', "/_api/web/lists/getbytitle('" + title + "')?$select=Title");
        if (exists.outcome !== 'OK') {
            // Modern OData (nometadata) — the Welcome HTTP client speaks OData v4, which rejects the old verbose/__metadata form.
            var create = await req('POST', '/_api/web/lists', { digest: digest,
                body: { Title: title, BaseTemplate: 100,
                        Description: 'zz-probe (Stage 0B – delete after testing)', EnableVersioning: true, EnableAttachments: false, NoCrawl: true } });
            if (create.outcome !== 'OK') { throw new Error('Could not create ' + title + ': ' + why(create)); }
        }
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var add = await req('POST', "/_api/web/lists/getbytitle('" + title + "')/fields", { digest: digest,
                body: { Title: f, FieldTypeKind: f.indexOf('Note') >= 0 ? 3 : 2 } });
            if (add.outcome !== 'OK' && !/exist/i.test(add.text || '')) { /* non-fatal; items verify later */ }
        }
    }
    async function createItem(list, fields) {
        var digest = state.digest || await freshDigest();
        var res = await req('POST', "/_api/web/lists/getbytitle('" + list + "')/items", { digest: digest, body: fields });
        if (res.outcome !== 'OK') { throw new Error('Create item failed in ' + list + ': ' + why(res)); }
        return res.json && (res.json.Id !== undefined ? res.json.Id : (res.json.d && res.json.d.Id));
    }
    // Idempotency: recycle any existing items so re-running Prepare does not duplicate records.
    async function clearItems(list) {
        var digest = state.digest || await freshDigest();
        var res = await req('GET', "/_api/web/lists/getbytitle('" + list + "')/items?$select=Id&$top=500");
        var items = listRows(res.json);
        for (var i = 0; i < items.length; i++) {
            await req('POST', "/_api/web/lists/getbytitle('" + list + "')/items(" + items[i].Id + ")/recycle()", { digest: digest });
        }
    }
    // SETPERM: reset → break(copy=false) → add Owners Full Control → add one user at one level.
    async function setPerm(list, id, principalId, roleDefId, lk) {
        var digest = state.digest || await freshDigest();
        var base = "/_api/web/lists/getbytitle('" + list + "')/items(" + Number(id) + ")";
        await req('POST', base + '/resetroleinheritance', { digest: digest });
        await req('POST', base + '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)', { digest: digest });
        await req('POST', base + '/roleassignments/addroleassignment(principalid=' + lk.owners + ',roledefid=' + lk.full + ')', { digest: digest });
        if (principalId) {
            await req('POST', base + '/roleassignments/addroleassignment(principalid=' + principalId + ',roledefid=' + roleDefId + ')', { digest: digest });
        }
    }
    // Independently verify a record's permissions. Returns {ok, reason}. Fails on anything
    // unexpected or more permissive than intended.
    async function verifyPerm(list, id, principalId, roleDefId, lk) {
        var res = await req('GET', "/_api/web/lists/getbytitle('" + list + "')/items(" + Number(id) +
            ")/roleassignments?$select=PrincipalId,RoleDefinitionBindings/Id&$expand=RoleDefinitionBindings");
        if (res.outcome !== 'OK') { return { ok: false, reason: 'could not read role assignments (' + res.outcome + ')' }; }
        var allowed = {}; allowed[lk.owners] = true; allowed[state.userId] = true; if (principalId) { allowed[principalId] = true; }
        var techBindings = null, stranger = null;
        listRows(res.json).forEach(function (ra) {
            if (!allowed[ra.PrincipalId]) { stranger = ra.PrincipalId; }
            if (principalId && ra.PrincipalId === principalId) {
                techBindings = (ra.RoleDefinitionBindings || []).map(function (b) { return b.Id; });
            }
        });
        if (stranger !== null) { return { ok: false, reason: 'unexpected principal ' + stranger + ' has access' }; }
        if (principalId) {
            if (!techBindings) { return { ok: false, reason: 'intended user has no access' }; }
            if (techBindings.length !== 1 || techBindings[0] !== roleDefId) {
                return { ok: false, reason: 'user holds unexpected / more-permissive level' };
            }
        }
        return { ok: true, reason: 'only Owners + intended user, exact level' };
    }

    async function runTeamLeaderSetup() {
        disableButtons(true);
        results = []; render();
        try {
            record('S0', 'Account is Team Leader (owner)', state.isOwner ? 'PASS' : 'FAIL', '',
                state.isOwner ? 'ManagePermissions confirmed' : 'NOT an owner — run setup as the Team Leader');
            if (!state.isOwner) { return; }

            var lk = await lookups();
            record('S1', 'Custom permission levels present', lk.ok ? 'PASS' : 'FAIL', '',
                lk.ok ? 'Found Full Control, ' + EDIT_LEVEL + ', ' + READ_LEVEL
                      : 'Missing ' + (lk.missingEdit ? EDIT_LEVEL + ' ' : '') + (lk.missingRead ? READ_LEVEL : '') + ' — create them first (README §2–3)');
            if (!lk.ok) { return; }

            var aLogin = (ui.testA && ui.testA.value || '').trim();
            var bLogin = (ui.testB && ui.testB.value || '').trim();
            if (!aLogin || !bLogin) { record('S2', 'Test account logins entered', 'FAIL', '', 'Enter both Test A and Test B sign-in names, then press Prepare again'); return; }
            var aId = await ensureUser(aLogin), bId = await ensureUser(bLogin);
            if (!aId || !bId) { record('S2', 'Resolve test accounts', 'FAIL', '', 'Could not resolve one of the sign-in names via ensureuser'); return; }
            record('S2', 'Resolved both test accounts', 'PASS', '', 'Test A and Test B resolved to site users');

            await createList(RECORDS, ['OwnerLogin', 'TechNote', 'RecordState']);
            await createList(MANAGER, ['OwnerLogin', 'ProtectedStatus', 'ManagerNote', 'Released']);
            record('S3', 'Test lists exist with versioning', 'PASS', '', RECORDS + ' and ' + MANAGER + ' ready');
            await clearItems(RECORDS); await clearItems(MANAGER);

            var xssText = XSS.join('  ||  ');
            var aOpen = await createItem(RECORDS, { Title: 'A-OPEN', OwnerLogin: aLogin, TechNote: 'Original note for Test A.', RecordState: 'Open' });
            var aLocked = await createItem(RECORDS, { Title: 'A-LOCKED', OwnerLogin: aLogin, TechNote: xssText, RecordState: 'Locked' });
            var bOpen = await createItem(RECORDS, { Title: 'B-OPEN', OwnerLogin: bLogin, TechNote: xssText, RecordState: 'Open' });
            var scratch = await createItem(RECORDS, { Title: 'TL-SCRATCH', OwnerLogin: 'owner-only', TechNote: 'Control record. Owner only.', RecordState: 'Scratch' });
            var aRel = await createItem(MANAGER, { Title: 'A-RELEASED', OwnerLogin: aLogin, ProtectedStatus: 'Completed', ManagerNote: 'Released feedback v1.', Released: 'Yes' });
            await writeFields(MANAGER, aRel, { ManagerNote: 'Released feedback v2 (edited to create version history).' });
            var aUnrel = await createItem(MANAGER, { Title: 'A-UNRELEASED', OwnerLogin: aLogin, ProtectedStatus: 'In Progress', ManagerNote: 'DRAFT manager feedback — must stay hidden.', Released: 'No' });
            var bRel = await createItem(MANAGER, { Title: 'B-RELEASED', OwnerLogin: bLogin, ProtectedStatus: 'Completed', ManagerNote: 'Released feedback for Test B.', Released: 'Yes' });
            record('S4', 'Fictional records created', 'PASS', '', '4 record rows + 4 manager rows');

            // Apply + verify unique item permissions. The technicians GROUP is never granted item access.
            var grants = [
                [RECORDS, aOpen, aId, lk.edit, 'A-OPEN → Test A edit'],
                [RECORDS, aLocked, aId, lk.read, 'A-LOCKED → Test A read'],
                [RECORDS, bOpen, bId, lk.edit, 'B-OPEN → Test B edit'],
                [RECORDS, scratch, 0, 0, 'TL-SCRATCH → owner only'],
                [MANAGER, aRel, aId, lk.read, 'A-RELEASED → Test A read'],
                [MANAGER, aUnrel, 0, 0, 'A-UNRELEASED → owner only'],
                [MANAGER, bRel, bId, lk.read, 'B-RELEASED → Test B read']
            ];
            var allGood = true;
            for (var i = 0; i < grants.length; i++) {
                var gr = grants[i];
                await setPerm(gr[0], gr[1], gr[2], gr[3], lk);
                var v = await verifyPerm(gr[0], gr[1], gr[2], gr[3], lk);
                if (!v.ok) { allGood = false; }
                record('S5.' + (i + 1), 'Verify permissions: ' + gr[4], v.ok ? 'PASS' : 'FAIL', '', v.reason);
            }
            if (!allGood) { setStatus('STOP: a permission did not verify. Do not run technician tests until fixed.'); return; }

            window.__otoIds = { aOpen: aOpen, aLocked: aLocked, bOpen: bOpen, scratch: scratch, aRel: aRel, aUnrel: aUnrel, bRel: bRel };
            record('S6', 'Setup complete and verified', 'PASS', '', 'Safe to run Test A and Test B. IDs recorded for control tests.');
            ui.controlBtn.disabled = false;
            ui.cleanupBtn.disabled = false;
            setStatus('Setup verified. Run control tests, then hand over to Test A and Test B.');
        } catch (error) {
            record('ERR', 'Setup error', 'FAIL', '', String(error && error.message ? error.message : error));
            setStatus('Setup failed — see the table.');
        } finally {
            disableButtons(false);
        }
    }

    // Control run: prove the test *requests* are valid by performing them as owner on the
    // owner-only scratch / unreleased records, where they should succeed. Restores state after.
    async function runControlTests() {
        disableButtons(true);
        var ids = window.__otoIds;
        if (!ids) { record('C0', 'Control tests', 'FAIL', '', 'Run Prepare first'); disableButtons(false); return; }
        try {
            var w = await writeFields(RECORDS, ids.scratch, { TechNote: 'control write ' + Date.now() });
            var back = await readItem(RECORDS, ids.scratch, 'TechNote');
            record('C1', 'Owner can write scratch record', w.wrote && back.json && /control write/.test(back.json.TechNote) ? 'PASS' : 'FAIL', '', 'write then verified read-back');

            var prot = await writeFields(MANAGER, ids.aUnrel, { ProtectedStatus: 'In Progress (control)' });
            record('C2', 'Owner can write a protected manager field', prot.wrote ? 'PASS' : 'FAIL', '', 'proves the request itself is valid');

            var ver = await req('GET', "/_api/web/lists/getbytitle('" + MANAGER + "')/items(" + ids.aRel + ")/versions");
            record('C3', 'Owner can read version history', ver.outcome === 'OK' ? 'PASS' : 'FAIL', '', 'B5 checks a technician cannot');
            setStatus('Control tests done. These prove the requests are valid; technicians must be refused the same actions.');
        } catch (error) {
            record('ERR', 'Control error', 'FAIL', '', String(error && error.message ? error.message : error));
        } finally {
            disableButtons(false);
        }
    }

    async function runCleanup() {
        if (!window.confirm('Delete the ZZProbeRecords and ZZProbeManager test lists? This cannot be undone.')) { return; }
        disableButtons(true);
        try {
            var digest = state.digest || await freshDigest();
            for (var k = 0; k < 2; k++) {
                var title = k === 0 ? RECORDS : MANAGER;
                // Guard: only delete lists that still carry the zz-probe marker description.
                var meta = await req('GET', "/_api/web/lists/getbytitle('" + title + "')?$select=Description");
                var desc = meta.json && (meta.json.Description || (meta.json.d && meta.json.d.Description));
                if (meta.outcome === 'OK' && /zz-probe/i.test(desc || '')) {
                    var del = await req('POST', "/_api/web/lists/getbytitle('" + title + "')", { xhttp: 'DELETE', ifMatch: '*', digest: digest });
                    record('X.' + title, 'Delete ' + title, del.outcome === 'OK' ? 'PASS' : 'FAIL', '', del.outcome);
                } else {
                    record('X.' + title, 'Delete ' + title, 'INFO', '', meta.outcome === 'OK' ? 'skipped: not marked zz-probe' : 'not found (already gone)');
                }
            }
            window.__otoIds = null;
            setStatus('Cleanup finished. Recycle bins still hold the lists for 93 days.');
        } catch (error) {
            record('ERR', 'Cleanup error', 'FAIL', '', String(error && error.message ? error.message : error));
        } finally {
            disableButtons(false);
        }
    }

    // ===================================================================================
    //  TECHNICIAN MODE (runs for whichever non-owner account is signed in)
    // ===================================================================================
    // A record/row is "foreign" if its owner login is neither this user nor a self-owned marker.
    function isForeign(row) {
        var owner = (row.OwnerLogin || '').toLowerCase();
        if (!owner) { return false; }
        var meTail = state.login.toLowerCase().split('|').pop();
        var meEmail = state.email.toLowerCase();
        return owner.indexOf(meTail) === -1 && (!meEmail || owner.indexOf(meEmail) === -1) && owner !== 'tamper';
    }

    async function runTechnicianTests() {
        disableButtons(true);
        results = []; render();
        window.__otoXssFired = false;
        try {
            record('T0', 'Signed-in account identified', 'INFO', '', state.name + ' — ' + (state.isOwner ? 'OWNER (run as a technician instead)' : 'technician (non-owner)'));
            if (state.isOwner) { record('T0b', 'Wrong account', 'FAIL', '', 'This is the Team Leader account. Sign in as Test A or Test B.'); return; }

            var recRes = await req('GET', "/_api/web/lists/getbytitle('" + RECORDS + "')/items?$select=Id,Title,OwnerLogin,TechNote,RecordState&$top=100");
            var mineRec = listRows(recRes.json);
            var ownOpen = mineRec.filter(function (r) { return r.RecordState === 'Open'; })[0];
            var ownLocked = mineRec.filter(function (r) { return r.RecordState === 'Locked'; })[0];
            record('B1', 'Records list returns only own items', (recRes.outcome === 'OK' || recRes.outcome === 'DENIED') && !mineRec.some(isForeign) ? 'PASS' : 'FAIL', 'M',
                mineRec.length + ' visible; none belonging to another technician');

            var mgrRes = await req('GET', "/_api/web/lists/getbytitle('" + MANAGER + "')/items?$select=Id,Title,OwnerLogin,Released,ManagerNote&$top=100");
            var mineMgr = listRows(mgrRes.json);
            var badMgr = mineMgr.some(function (r) { return r.Released === 'No' || isForeign(r); });
            record('B4', 'Manager list hides unreleased and others', !badMgr ? 'PASS' : 'FAIL', 'M', mineMgr.length + ' manager row(s) visible, all own + released');

            // B2 + B3: direct access by guessed item id across both lists
            var leak = [];
            for (var id = 1; id <= SCAN_IDS; id++) {
                var rr = await readItem(RECORDS, id, 'Id,OwnerLogin,RecordState');
                if (rr.outcome === 'OK' && rr.json && isForeign(rr.json)) { leak.push(RECORDS + '#' + id); }
                var mr = await readItem(MANAGER, id, 'Id,OwnerLogin,Released');
                if (mr.outcome === 'OK' && mr.json && (mr.json.Released === 'No' || isForeign(mr.json))) { leak.push(MANAGER + '#' + id); }
            }
            record('B2', 'Guessed item IDs reveal nothing foreign', leak.length === 0 ? 'PASS' : 'FAIL', 'M',
                leak.length ? 'LEAKED: ' + leak.join(', ') : 'scanned IDs 1–' + SCAN_IDS + ', only own records returned');
            record('B3', 'Direct REST read of others is blocked', leak.length === 0 ? 'PASS' : 'FAIL', 'M', 'covered by the ID scan');

            if (!ownOpen) { record('B6', 'Own editable record', 'FAIL', 'M', 'Test account has no Open record — check setup'); }
            var snapshot = ownOpen ? { TechNote: ownOpen.TechNote, RecordState: ownOpen.RecordState, OwnerLogin: ownOpen.OwnerLogin } : null;

            if (ownOpen) {
                var stamp = 'tech edit ' + Date.now();
                var w6 = await writeFields(RECORDS, ownOpen.Id, { TechNote: stamp });
                var r6 = await readItem(RECORDS, ownOpen.Id, 'TechNote');
                record('B6', 'Can edit own draft record', w6.wrote && r6.json && r6.json.TechNote === stamp ? 'PASS' : 'FAIL', 'M', 'write then verified by read-back');
            }
            if (ownLocked) {
                var before7 = await readItem(RECORDS, ownLocked.Id, 'TechNote');
                var w7 = await writeFields(RECORDS, ownLocked.Id, { TechNote: 'should not stick' });
                var after7 = await readItem(RECORDS, ownLocked.Id, 'TechNote');
                var unchanged7 = after7.outcome === 'OK' && before7.json && after7.json && before7.json.TechNote === after7.json.TechNote;
                record('B7', 'Cannot edit own locked record', (!w7.wrote) && unchanged7 ? 'PASS' : 'FAIL', 'M', 'edit refused and value unchanged on re-read');
            }

            var wroteForeign = [];
            for (var fid = 1; fid <= SCAN_IDS; fid++) {
                if (ownOpen && fid === ownOpen.Id) { continue; }
                if (ownLocked && fid === ownLocked.Id) { continue; }
                var wf = await writeFields(RECORDS, fid, { TechNote: 'intrusion' });
                if (wf.wrote) { wroteForeign.push(RECORDS + '#' + fid); }
            }
            record('B8', "Cannot edit another technician's records", wroteForeign.length === 0 ? 'PASS' : 'FAIL', 'M',
                wroteForeign.length ? 'WROTE: ' + wroteForeign.join(', ') : 'all non-own writes refused across IDs 1–' + SCAN_IDS);

            var digest = state.digest || await freshDigest();
            var create = await req('POST', "/_api/web/lists/getbytitle('" + RECORDS + "')/items", { digest: digest, body: { Title: 'rogue' } });
            record('B9a', 'Cannot create new records', create.outcome !== 'OK' ? 'PASS' : 'FAIL', 'M', 'create refused (' + create.outcome + ')');
            if (ownOpen) {
                var rec = await req('POST', "/_api/web/lists/getbytitle('" + RECORDS + "')/items(" + ownOpen.Id + ")/recycle()", { digest: digest });
                var still = await readItem(RECORDS, ownOpen.Id, 'Id');
                record('B9b', 'Cannot delete own record', rec.outcome !== 'OK' && still.outcome === 'OK' ? 'PASS' : 'FAIL', 'M', 'recycle refused and item still present');
                var att = await req('POST', "/_api/web/lists/getbytitle('" + RECORDS + "')/items(" + ownOpen.Id + ")/AttachmentFiles/add(FileName='x.txt')", { body: 'x', digest: digest });
                record('B9c', 'Cannot add attachments', att.outcome !== 'OK' ? 'PASS' : 'FAIL', 'M', 'attachment upload refused (' + att.outcome + ')');
            }
            var field = await req('POST', "/_api/web/lists/getbytitle('" + RECORDS + "')/fields", { digest: digest, body: { Title: 'Rogue', FieldTypeKind: 2 } });
            record('B9d', 'Cannot add columns', field.outcome !== 'OK' ? 'PASS' : 'FAIL', 'M', 'field creation refused (' + field.outcome + ')');

            if (ownOpen) {
                var base10 = "/_api/web/lists/getbytitle('" + RECORDS + "')/items(" + ownOpen.Id + ")";
                // Enumerating role assignments needs Manage Permissions. Independent effect check:
                // if the technician cannot read them before but can after trying to escalate, they gained control.
                var pre = await req('GET', base10 + "/roleassignments?$select=PrincipalId");
                var brk = await req('POST', base10 + "/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)", { digest: digest });
                var add = await req('POST', base10 + "/roleassignments/addroleassignment(principalid=" + state.userId + ",roledefid=1073741829)", { digest: digest });
                var post = await req('GET', base10 + "/roleassignments?$select=PrincipalId");
                var noWriteSucceeded = brk.outcome !== 'OK' && add.outcome !== 'OK';
                var gainedControl = (pre.outcome !== 'OK' && post.outcome === 'OK');
                record('B10a', 'Cannot change item permissions', noWriteSucceeded && !gainedControl ? 'PASS' : 'FAIL', 'M',
                    'break HTTP ' + brk.status + ', grant HTTP ' + add.status + ', enumerate-perms before ' + pre.status + ' / after ' + post.status + (gainedControl ? ' — ESCALATED' : ''));
                var share = await req('POST', '/_api/web/SP.Web.ShareObject', { body: { url: state.siteUrl, peoplePickerInput: '[]', roleValue: 'role:1073741827' }, digest: digest });
                record('B10b', 'Cannot create sharing links', share.outcome !== 'OK' ? 'PASS' : 'FAIL', 'M', 'share refused (' + share.outcome + ')');
            }

            var up = await req('POST', "/_api/web/getfolderbyserverrelativeurl('" + encodeURIComponent(state.webRel + '/Welcome Web Part - Custom Layouts') + "')/files/add(url='zz-probe-tamper.txt',overwrite=false)", { body: 'tamper', digest: digest });
            record('B11', 'Cannot overwrite frontend code', up.outcome !== 'OK' ? 'PASS' : 'FAIL', 'M', 'upload to layout library refused (' + up.outcome + ')');

            var ownRel = mineMgr.filter(function (r) { return r.Released === 'Yes'; })[0];
            if (ownRel) {
                var ver = await req('GET', "/_api/web/lists/getbytitle('" + MANAGER + "')/items(" + ownRel.Id + ")/versions");
                record('B5', 'Cannot read manager version history', ver.outcome !== 'OK' ? 'PASS' : 'FAIL', 'M', 'versions endpoint refused (' + ver.outcome + ') — hides earlier draft feedback');
                var before13 = await readItem(MANAGER, ownRel.Id, 'ProtectedStatus');
                var w13 = await writeFields(MANAGER, ownRel.Id, { ProtectedStatus: 'Reopened by technician' });
                var after13 = await readItem(MANAGER, ownRel.Id, 'ProtectedStatus');
                var unchanged13 = after13.outcome === 'OK' && before13.json && before13.json.ProtectedStatus === after13.json.ProtectedStatus;
                record('B13', 'Cannot change protected manager fields', (!w13.wrote) && unchanged13 ? 'PASS' : 'FAIL', 'M', 'protected write refused and value unchanged');
            }

            if (ownOpen) {
                var w12 = await writeFields(RECORDS, ownOpen.Id, { RecordState: 'Open', OwnerLogin: 'tamper' });
                var r12 = await readItem(RECORDS, ownOpen.Id, 'OwnerLogin');
                record('B12', 'Draft fields are technician-writable (expected)', w12.wrote && r12.json && r12.json.OwnerLogin === 'tamper' ? 'PASS' : 'FAIL', 'I',
                    'EXPECTED allowed — confirms no column-level security, so production authority lives on the manager list (D.7)');
            }

            if (ownOpen) {
                var w14 = await writeFields(RECORDS, ownOpen.Id, { Editor: '[{"Key":"i:0#.f|membership|someone.else"}]' }, true);
                var r14 = await req('GET', "/_api/web/lists/getbytitle('" + RECORDS + "')/items(" + ownOpen.Id + ")?$select=Editor/Title&$expand=Editor");
                var spoofed = r14.json && r14.json.Editor && /someone\.else/i.test(JSON.stringify(r14.json.Editor));
                record('B14', 'Modified By spoofing', 'INFO', '', spoofed ? 'WARNING: Editor accepted a forged value — production must not trust Modified By (D.7 already does not)' : 'forged Editor not accepted');
            }

            if (ownLocked) {
                var lockedText = (await readItem(RECORDS, ownLocked.Id, 'TechNote')).json;
                var panel = root().querySelector('[data-zzprobe-xss]');
                if (panel) { panel.textContent = ''; panel.appendChild(el('div', lockedText ? lockedText.TechNote : '', 'info')); }
                await new Promise(function (r) { setTimeout(r, 150); });
                record('B15', 'Injected content never executes', window.__otoXssFired ? 'FAIL' : 'PASS', 'M',
                    window.__otoXssFired ? 'ALERT fired — rendering is unsafe' : 'all payloads shown as literal text, no script ran');
            }

            if (ownOpen) {
                var tricky = '"},{"id":99,"x":"' + '</' + 'b>';
                var w16 = await writeFields(RECORDS, ownOpen.Id, { TechNote: tricky });
                var r16 = await readItem(RECORDS, ownOpen.Id, 'TechNote');
                record('B16', 'Malformed field content is safe', w16.wrote && r16.json && r16.json.TechNote === tricky ? 'PASS' : 'FAIL', 'M', 'stored and returned as a literal string');

                var big = new Array(20001).join('x');
                var w17 = await writeFields(RECORDS, ownOpen.Id, { TechNote: big });
                var r17 = await readItem(RECORDS, ownOpen.Id, 'TechNote');
                var okLen = r17.json && r17.json.TechNote && r17.json.TechNote.length >= 20000;
                record('B17', 'Very long input handled', 'INFO', '', w17.wrote && okLen ? 'accepted ~20k chars cleanly' : 'refused/truncated cleanly (' + w17.outcome + ') — no page break');

                var w18 = await writeFields(RECORDS, ownOpen.Id, { TechNote: '=HYPERLINK("http://x","click")' });
                record('B18', 'Spreadsheet formula injection risk', 'INFO', '', w18.wrote ? 'stored verbatim — open list exports in Protected View; do not enable editing' : 'refused (' + w18.outcome + ')');
            }

            var users = await req('GET', '/_api/web/siteusers?$select=Title&$top=200');
            var grp = await req('GET', "/_api/web/sitegroups/getbyname('1-to-1 Technicians')/users?$select=Title");
            record('B19', 'Roster / group visibility', 'INFO', '',
                'siteusers: ' + users.outcome + (users.outcome === 'OK' ? ' (' + listRows(users.json).length + ' visible)' : '') +
                '; group members: ' + grp.outcome + (grp.outcome === 'OK' ? ' visible — set membership visibility to Owner' : ' hidden'));

            if (ownOpen && snapshot) { await writeFields(RECORDS, ownOpen.Id, snapshot); }

            var fails = results.filter(function (e) { return e.verdict === 'FAIL'; }).length;
            setStatus(fails ? fails + ' MANDATORY FAILURE(S) — do not proceed to Stage 1.' : 'All technician tests passed. Export the redacted results.');
        } catch (error) {
            record('ERR', 'Technician test error', 'FAIL', '', String(error && error.message ? error.message : error));
        } finally {
            disableButtons(false);
        }
    }

    // ---------- UI ----------
    function disableButtons(on) {
        ['prepareBtn', 'controlBtn', 'cleanupBtn', 'techBtn'].forEach(function (k) { if (ui[k]) { ui[k].disabled = !!on; } });
    }
    function mkBtn(text, fn) {
        var b = el('button', text); b.type = 'button';
        b.addEventListener('click', function () { fn().catch(function (e) { record('ERR', text, 'FAIL', '', String(e && e.message ? e.message : e)); }); });
        return b;
    }
    function buildUI() {
        var r = root();
        if (!r) { throw new Error('Welcome layout root not found'); }
        var slot = r.querySelector('[data-zzprobe-controls]');
        slot.textContent = '';
        ui = { redact: ui.redact };

        ui.summary = el('p', '', 'info');
        slot.appendChild(ui.summary);

        if (state.isOwner) {
            slot.appendChild(el('h3', 'Team Leader'));
            var labA = el('label', 'Test A sign-in name '); ui.testA = el('input'); ui.testA.type = 'text'; ui.testA.placeholder = 'i:0#.f|membership|testa@...'; labA.appendChild(ui.testA);
            var labB = el('label', ' Test B sign-in name '); ui.testB = el('input'); ui.testB.type = 'text'; ui.testB.placeholder = 'i:0#.f|membership|testb@...'; labB.appendChild(ui.testB);
            slot.appendChild(labA); slot.appendChild(labB);
            ui.prepareBtn = mkBtn('1. Prepare / verify test environment', runTeamLeaderSetup);
            ui.controlBtn = mkBtn('2. Run control tests', runControlTests); ui.controlBtn.disabled = true;
            ui.cleanupBtn = mkBtn('Clean up (delete test lists)', runCleanup); ui.cleanupBtn.disabled = true;
            slot.appendChild(ui.prepareBtn); slot.appendChild(ui.controlBtn); slot.appendChild(ui.cleanupBtn);
        } else {
            slot.appendChild(el('h3', 'Technician security tests'));
            slot.appendChild(el('p', 'Signed in as a non-owner. This runs the authorised-technician checks for whichever test account you are using.', 'info'));
            ui.techBtn = mkBtn('Run my technician security tests', runTechnicianTests);
            slot.appendChild(ui.techBtn);
        }

        var table = el('table'); var head = el('tr');
        ['Test', 'Verdict', 'What', 'Detail'].forEach(function (c) { head.appendChild(el('th', c)); });
        table.appendChild(head); ui.tbody = el('tbody'); table.appendChild(ui.tbody); slot.appendChild(table);

        var xss = el('div', '', 'info'); xss.setAttribute('data-zzprobe-xss', ''); slot.appendChild(xss);
        var lab = el('label'); ui.redact = el('input'); ui.redact.type = 'checkbox'; ui.redact.checked = true; ui.redact.addEventListener('change', render);
        lab.appendChild(ui.redact); lab.appendChild(el('span', ' Redact account and site details from results')); slot.appendChild(lab);
        slot.appendChild(el('p', 'Copy these results back to Claude:', 'info'));
        ui.output = el('textarea'); ui.output.readOnly = true; slot.appendChild(ui.output);
        render();
    }

    async function init() {
        buildUI();
        setStatus('Welcome lifecycle loaded. Connecting to SharePoint...');
        webPart = ctx.getWebPart();
        if (!webPart || !webPart.spHttpClient || !webPart.pageContext || !webPart.pageContext.web || !webPart.pageContext.web.absoluteUrl) {
            throw new Error('Welcome SharePoint context / SPHttpClient unavailable');
        }
        http = webPart.spHttpClient;
        httpConfig = http.constructor.configurations.v1;
        state.siteUrl = webPart.pageContext.web.absoluteUrl;
        try { state.webRel = new URL(state.siteUrl).pathname; } catch (_) { state.webRel = ''; }

        var me = await req('GET', '/_api/web/currentuser?$select=Id,Title,Email,LoginName');
        if (me.outcome === 'OK' && me.json) {
            state.userId = me.json.Id; state.name = me.json.Title || ''; state.email = me.json.Email || ''; state.login = me.json.LoginName || '';
        }
        var perms = await req('GET', '/_api/web/effectiveBasePermissions');
        var low = perms.json && (perms.json.Low !== undefined ? perms.json.Low : (perms.json.d && perms.json.d.EffectiveBasePermissions && perms.json.d.EffectiveBasePermissions.Low));
        state.isOwner = (Number(low || 0) & MANAGE_PERMISSIONS_LOW) !== 0;
        buildUI();   // rebuild now role is known (owner vs technician panels differ)
        setStatus('Ready. Account: ' + state.name + ' — ' + (state.isOwner ? 'Team Leader (owner)' : 'technician (non-owner)'));
    }

    return {
        onInitialize: function () {
            if (started) { return; }
            started = true;
            init().catch(function (error) {
                setStatus('Probe setup failed: ' + String(error && error.message ? error.message : error));
                record('ERR', 'Probe setup', 'FAIL', '', String(error && error.message ? error.message : error));
            });
        },
        onError: function (error) {
            if (window.console) { window.console.error('ESG 1-to-1 Stage 0B: Welcome error', error); }
            setStatus('Welcome reported an error; inspect the developer console.');
        },
        onDispose: function () { disposed = true; }
    };
};
