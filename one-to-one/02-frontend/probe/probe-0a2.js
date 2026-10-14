// ESG 1-to-1 Stage 0A — external script for Welcome by Accelerator 365.
// Adapted from the confirmed working DSL lifecycle *wrapper*, not DSL data or logic.
// Only the disposable ZZProbe0A list is read/written.
window.ESGOneToOneProbe0A = function (ctx) {
    'use strict';

    var VERSION = '0A-2';
    var LIST_TITLE = 'ZZProbe0A';
    var MANAGE_PERMISSIONS_LOW = 0x02000000;
    var state = { siteUrl: '', email: '', name: '', isOwner: false, items: [], digest: '' };
    var results = [];
    var ui = {};
    var webPart;
    var http;
    var httpConfig;
    var started = false;
    var disposed = false;

    function el(tag, text, cls) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function getRoot() {
        return document.querySelector('[data-zzprobe-root]');
    }

    function setStatus(message) {
        var root = getRoot();
        var slot = root && root.querySelector('[data-zzprobe-status]');
        if (slot) slot.textContent = message;
    }

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

    async function call(method, path, data, digest) {
        var headers = { 'Accept': 'application/json;odata=nometadata' };
        if (data !== undefined) headers['Content-Type'] = 'application/json;odata=nometadata';
        if (digest) headers['X-RequestDigest'] = digest;
        try {
            var url = state.siteUrl + path;
            var options = { headers: headers };
            var response;
            if (method === 'GET') {
                response = await http.get(url, httpConfig, options);
            } else if (method === 'POST') {
                options.body = data === undefined ? '' : JSON.stringify(data);
                response = await http.post(url, httpConfig, options);
            } else {
                throw new Error('Unsupported probe method');
            }
            var bodyText = await response.text();
            var json = null;
            try { json = bodyText ? JSON.parse(bodyText) : null; } catch (_) { /* keep raw */ }
            return {
                status: response.status, outcome: classify(response.status),
                json: json, text: bodyText
            };
        } catch (error) {
            return {
                status: 0, outcome: 'ERROR', json: null,
                text: String(error && error.message ? error.message : error)
            };
        }
    }

    function digestFrom(json) {
        if (!json) return '';
        if (json.FormDigestValue) return json.FormDigestValue;
        if (json.GetContextWebInformation && json.GetContextWebInformation.FormDigestValue)
            return json.GetContextWebInformation.FormDigestValue;
        if (json.d && json.d.GetContextWebInformation)
            return json.d.GetContextWebInformation.FormDigestValue || '';
        return '';
    }

    function short(response) {
        // Deliberately exclude response bodies from copyable results. Contextinfo
        // and error responses can contain tenant-specific or security data.
        return 'HTTP ' + response.status + ' (' + response.outcome + ')';
    }

    function record(id, name, pass, outcome, detail) {
        if (disposed) return;
        results.push({ id: id, name: name, pass: !!pass, outcome: outcome, detail: detail || '' });
        render();
    }

    function redactedText() {
        var lines = ['ESG 1-to-1 Stage 0A ' + VERSION + ' - ' + new Date().toISOString()];
        results.forEach(function (entry) {
            lines.push([entry.id, entry.pass ? 'PASS' : 'FAIL', entry.outcome,
                        entry.name, entry.detail].join(' | '));
        });
        var text = lines.join('\n');
        if (ui.redact && ui.redact.checked) {
            [ [state.email, '<EMAIL>'],
              [state.name, '<NAME>'],
              [state.siteUrl, '<SITE>'],
              [window.location.host, '<TENANT-HOST>'] ].forEach(function (pair) {
                if (pair[0]) text = text.split(pair[0]).join(pair[1]);
            });
        }
        return text;
    }

    function render() {
        if (!ui.tbody || disposed) return;
        ui.tbody.textContent = '';
        results.forEach(function (entry) {
            var tr = el('tr');
            tr.appendChild(el('td', entry.id));
            tr.appendChild(el('td', entry.pass ? 'PASS' : 'FAIL', entry.pass ? 'pass' : 'fail'));
            tr.appendChild(el('td', entry.outcome));
            tr.appendChild(el('td', entry.name));
            tr.appendChild(el('td', entry.detail, 'info'));
            ui.tbody.appendChild(tr);
        });
        ui.output.value = redactedText();
    }

    function build() {
        var root = getRoot();
        if (!root) throw new Error('Welcome layout root not found');
        var slot = root.querySelector('[data-zzprobe-controls]');
        if (!slot) throw new Error('Welcome controls element not found');
        slot.textContent = '';

        var table = el('table');
        var header = el('tr');
        ['Check', 'Result', 'Outcome', 'What', 'Detail'].forEach(function (caption) {
            header.appendChild(el('th', caption));
        });
        table.appendChild(header);
        ui.tbody = el('tbody');
        table.appendChild(ui.tbody);
        slot.appendChild(table);

        ui.button = el('button', 'Run write test (Team Leader only)');
        ui.button.type = 'button';
        ui.button.disabled = true;
        ui.button.addEventListener('click', function () {
            runWrite().catch(function (error) {
                record('ERR', 'Write-test error', false, 'ERROR', String(error.message || error));
            });
        });
        slot.appendChild(ui.button);

        var label = el('label');
        ui.redact = el('input');
        ui.redact.type = 'checkbox';
        ui.redact.checked = true;
        ui.redact.addEventListener('change', render);
        label.appendChild(ui.redact);
        label.appendChild(el('span', ' Redact account and site details from results'));
        slot.appendChild(label);
        slot.appendChild(el('p', 'Copy these results back to Claude:', 'info'));

        ui.output = el('textarea');
        ui.output.readOnly = true;
        slot.appendChild(ui.output);
        render();
    }

    async function runReads() {
        record('A1', 'Welcome external JavaScript executed', true, 'OK', 'Version ' + VERSION);
        var me = await call('GET', '/_api/web/currentuser?$select=Id,Title,Email');
        if (me.outcome !== 'OK' || !me.json) {
            record('A2', 'Authenticated current user', false, me.outcome, short(me));
            return;
        }
        state.name = me.json.Title || '';
        state.email = me.json.Email || '';
        record('A2', 'Authenticated current user', true, 'OK',
               state.name + ' <' + state.email + '>');

        var perms = await call('GET', '/_api/web/effectiveBasePermissions');
        if (perms.outcome !== 'OK' || !perms.json ||
            (perms.json.Low === undefined && !(perms.json.d && perms.json.d.EffectiveBasePermissions))) {
            record('A2b', 'Site permission mode', false, perms.outcome, short(perms));
            return;
        }
        var value = perms.json.Low !== undefined
            ? perms.json.Low : perms.json.d.EffectiveBasePermissions.Low;
        state.isOwner = (Number(value) & MANAGE_PERMISSIONS_LOW) !== 0;
        record('A2b', 'Site permission mode (informational)', true, 'OK',
               state.isOwner ? 'Owner (Team Leader mode)' : 'Not an owner (technician mode)');

        var itemsRes = await call('GET',
            "/_api/web/lists/getbytitle('" + LIST_TITLE + "')/items?$select=Id,Title&$orderby=Id&$top=5");
        var found = rows(itemsRes.json);
        if (state.isOwner) {
            state.items = found;
            var ownerOK = itemsRes.outcome === 'OK' && found.length > 0;
            record('A3', 'Read test list ' + LIST_TITLE, ownerOK, itemsRes.outcome,
                   ownerOK ? found.length + ' test item(s)' : short(itemsRes));
        } else {
            // A zero-item 200 is NOT proof that list permissions deny reads.
            var denied = itemsRes.outcome === 'DENIED' || itemsRes.outcome === 'NOT FOUND';
            record('A3', 'Technician blocked from test list', denied, itemsRes.outcome,
                   denied ? 'List data access blocked' :
                   itemsRes.outcome === 'OK' ? 'Unexpected list read access; ' + found.length + ' items returned' : short(itemsRes));
        }

        // SPHttpClient ordinarily manages request digests; this also verifies contextinfo.
        var ctxRes = await call('POST', '/_api/contextinfo');
        state.digest = digestFrom(ctxRes.json);
        record('A4', 'Authenticated contextinfo POST', ctxRes.outcome === 'OK' && !!state.digest,
               ctxRes.outcome, state.digest ? 'Digest obtained' : short(ctxRes));

        ui.button.disabled = !(state.isOwner && state.items.length && state.digest);
        ui.button.title = state.isOwner ? '' : 'Only Team Leader may run the write test';
        setStatus('Checks finished. Review the table below.');
    }

    async function runWrite() {
        if (!state.isOwner || !state.items.length || disposed) return;
        ui.button.disabled = true;
        var item = state.items[0];
        var stamp = 'probe write ' + new Date().toISOString().substring(0, 19).replace('T', ' ');
        var ctxRes = await call('POST', '/_api/contextinfo');
        var digest = digestFrom(ctxRes.json);
        if (!digest) {
            record('A5', 'Update test record', false, ctxRes.outcome, 'No digest: ' + short(ctxRes));
            return;
        }
        var update = await call(
            'POST',
            "/_api/web/lists/getbytitle('" + LIST_TITLE + "')/items(" + Number(item.Id || item.ID) +
                ')/validateUpdateListItem',
            { formValues: [ { FieldName: 'Title', FieldValue: stamp } ], bNewDocumentUpdate: false },
            digest
        );
        var errors = rows(update.json).filter(function (field) { return field.HasException; });
        var writeOK = update.outcome === 'OK' && errors.length === 0;
        record('A5', 'Update test record', writeOK, update.outcome,
               writeOK ? 'Item Title set to "' + stamp + '"' :
               (errors.length ? errors.map(function (f) { return f.ErrorMessage; }).join('; ') : short(update)));
        if (!writeOK) return;

        var checked = await call('GET',
            "/_api/web/lists/getbytitle('" + LIST_TITLE + "')/items(" + Number(item.Id || item.ID) +
            ')?$select=Title');
        var persisted = checked.outcome === 'OK' && checked.json && checked.json.Title === stamp;
        record('A6', 'Read back confirms write', persisted, checked.outcome,
               persisted ? 'Saved Title confirmed' : short(checked));
        setStatus(persisted ? 'Read and write test completed.' : 'Write verification failed.');
    }

    return {
        onInitialize: function () {
            if (started) return;
            started = true;
            try {
                build();
                setStatus('Welcome lifecycle loaded. Connecting to SharePoint...');
                webPart = ctx.getWebPart();
                if (!webPart || !webPart.spHttpClient || !webPart.pageContext ||
                    !webPart.pageContext.web || !webPart.pageContext.web.absoluteUrl) {
                    throw new Error('Welcome SharePoint context / SPHttpClient unavailable');
                }
                http = webPart.spHttpClient;
                httpConfig = http.constructor.configurations.v1;
                state.siteUrl = webPart.pageContext.web.absoluteUrl;
                runReads().catch(function (error) {
                    record('ERR', 'Unexpected read error', false, 'ERROR',
                           String(error && error.message ? error.message : error));
                    setStatus('Read tests failed; see details.');
                });
            } catch (error) {
                setStatus('Probe setup failed: ' + String(error && error.message ? error.message : error));
                record('ERR', 'Probe setup', false, 'ERROR', String(error && error.message ? error.message : error));
            }
        },
        onError: function (error) {
            console.error('ESG 1-to-1 probe: Welcome error', error);
            setStatus('Welcome reported an error; inspect developer console.');
        },
        onDispose: function () {
            disposed = true;
        }
    };
};
