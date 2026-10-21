// ESG Competency Hub — Phase 0 probe (P-01, P-07, P-09) for Welcome by Accelerator 365.
// Uses the lifecycle wrapper proven by the ESG 1-to-1 Stage 0A probe.
// Read-only: the only POST is /_api/contextinfo, which changes nothing.
window.ESGCompetencyHubProbeP0 = function (ctx) {
    'use strict';

    var VERSION = 'P0-1';
    var MANAGE_PERMISSIONS_LOW = 0x02000000;
    var EXPECTED_LOCALE = 2057;          // English (United Kingdom)
    var EXPECTED_TIMEZONE_ID = 2;        // (UTC+00:00) Dublin, Edinburgh, Lisbon, London
    var WELCOME_LAYOUTS = 'Welcome Web Part - Custom Layouts';
    var WELCOME_ERRORS = 'Welcome Web Part - Errors';
    var HUB_LISTS = ['Competencies', 'People', 'Actions', 'History', 'Requests'];

    var state = { siteUrl: '', email: '', name: '', isOwner: false };
    var results = [];
    var ui = {};
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
        return document.querySelector('[data-chprobe-root]');
    }

    function setStatus(message) {
        var root = getRoot();
        var slot = root && root.querySelector('[data-chprobe-status]');
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

    function listPath(title) {
        return "/_api/web/lists/getbytitle('" + title.replace(/'/g, "''") + "')";
    }

    async function call(method, path) {
        var options = { headers: { 'Accept': 'application/json;odata=nometadata' } };
        try {
            var url = state.siteUrl + path;
            var response;
            if (method === 'GET') {
                response = await http.get(url, httpConfig, options);
            } else {
                options.body = '';
                response = await http.post(url, httpConfig, options);
            }
            var bodyText = await response.text();
            var json = null;
            try { json = bodyText ? JSON.parse(bodyText) : null; } catch (_) { /* keep raw */ }
            return { status: response.status, outcome: classify(response.status), json: json };
        } catch (error) {
            return { status: 0, outcome: 'ERROR', json: null,
                     error: String(error && error.message ? error.message : error) };
        }
    }

    function short(response) {
        // Response bodies are left out on purpose: they can contain tenant details.
        return response.status ? 'HTTP ' + response.status + ' (' + response.outcome + ')'
                               : 'No response (' + (response.error || 'network error') + ')';
    }

    // result: 'PASS', 'FAIL' or 'NOTE' (informational, needs your judgement)
    function record(id, name, result, outcome, detail) {
        if (disposed) return;
        results.push({ id: id, name: name, result: result, outcome: outcome, detail: detail || '' });
        render();
    }

    function redactedText() {
        var lines = ['ESG Competency Hub probe ' + VERSION + ' - ' + new Date().toISOString(),
                     'Browser: ' + navigator.userAgent];
        results.forEach(function (entry) {
            lines.push([entry.id, entry.result, entry.outcome, entry.name, entry.detail].join(' | '));
        });
        var text = lines.join('\n');
        if (ui.redact && ui.redact.checked) {
            [[state.email, '<EMAIL>'],
             [state.name, '<NAME>'],
             [state.siteUrl, '<SITE>'],
             [window.location.host, '<TENANT-HOST>']].forEach(function (pair) {
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
            tr.appendChild(el('td', entry.result, entry.result.toLowerCase()));
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
        var slot = root.querySelector('[data-chprobe-controls]');
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

        ui.backButton = el('button', 'Run back-button test (P-09)');
        ui.backButton.type = 'button';
        ui.backButton.addEventListener('click', runBackButtonTest);
        slot.appendChild(ui.backButton);

        var label = el('label');
        ui.redact = el('input');
        ui.redact.type = 'checkbox';
        ui.redact.checked = true;
        ui.redact.addEventListener('change', render);
        label.appendChild(ui.redact);
        label.appendChild(el('span', ' Hide my name, email and site address in the results'));
        slot.appendChild(label);
        slot.appendChild(el('p', 'Copy everything in this box and send it back:', 'info'));

        ui.output = el('textarea');
        ui.output.readOnly = true;
        slot.appendChild(ui.output);
        render();
    }

    function ukDateNow() {
        var parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        var pick = function (type) {
            return parts.filter(function (p) { return p.type === type; })[0].value;
        };
        return pick('year') + '-' + pick('month') + '-' + pick('day');
    }

    async function runReads() {
        record('C1', 'Welcome ran the external JavaScript (P-01)', 'PASS', 'OK', 'Probe version ' + VERSION);

        var me = await call('GET', '/_api/web/currentuser?$select=Id,Title,Email');
        if (me.outcome !== 'OK' || !me.json) {
            record('C2', 'Signed-in user identified (P-01)', 'FAIL', me.outcome, short(me));
            setStatus('Stopped: the signed-in user could not be read. Send the results back.');
            return;
        }
        state.name = me.json.Title || '';
        state.email = me.json.Email || '';
        record('C2', 'Signed-in user identified (P-01)', 'PASS', 'OK', state.name + ' <' + state.email + '>');

        var web = await call('GET', '/_api/web?$select=Title,ServerRelativeUrl,WebTemplate,Language');
        if (web.outcome === 'OK' && web.json) {
            record('C3', 'Site read with REST (P-01)', 'PASS', 'OK',
                   'Site "' + (web.json.Title || '') + '", template ' + web.json.WebTemplate +
                   ', language ' + web.json.Language);
        } else {
            record('C3', 'Site read with REST (P-01)', 'FAIL', web.outcome, short(web));
        }

        var perms = await call('GET', '/_api/web/effectiveBasePermissions');
        var low = perms.json && (perms.json.Low !== undefined ? perms.json.Low :
                  perms.json.d && perms.json.d.EffectiveBasePermissions && perms.json.d.EffectiveBasePermissions.Low);
        if (perms.outcome === 'OK' && low !== undefined) {
            state.isOwner = (Number(low) & MANAGE_PERMISSIONS_LOW) !== 0;
            record('C4', 'Your permission level on the site (information)', 'NOTE', 'OK',
                   state.isOwner ? 'Site owner' : 'Not a site owner');
        } else {
            record('C4', 'Your permission level on the site (information)', 'FAIL', perms.outcome, short(perms));
        }

        var regional = await call('GET', '/_api/web/regionalsettings?$select=LocaleId,Time24');
        var tz = await call('GET', '/_api/web/regionalsettings/timezone?$select=Id,Description');
        var locale = regional.json && regional.json.LocaleId;
        var tzId = tz.json && tz.json.Id;
        var regionalOk = regional.outcome === 'OK' && tz.outcome === 'OK' &&
                         Number(locale) === EXPECTED_LOCALE && Number(tzId) === EXPECTED_TIMEZONE_ID;
        record('C5', 'Site regional settings are UK and London time (P-07)', regionalOk ? 'PASS' : 'FAIL',
               regional.outcome === 'OK' && tz.outcome === 'OK' ? 'OK' : short(regional.outcome === 'OK' ? tz : regional),
               'Locale ' + locale + ' (expected 2057), time zone ' + tzId + ' "' +
               ((tz.json && tz.json.Description) || '') + '" (expected 2, London)');

        var browserZone = '';
        try { browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { /* old browser */ }
        var ukDate = '';
        try { ukDate = ukDateNow(); } catch (_) { /* no Europe/London support */ }
        record('C6', 'Browser can work out the UK date (P-07)', ukDate ? 'PASS' : 'FAIL', ukDate ? 'OK' : 'ERROR',
               'UK date ' + (ukDate || 'unavailable') + '; browser time zone ' + (browserZone || 'unknown'));

        var layouts = await call('GET', listPath(WELCOME_LAYOUTS) + '?$select=Title,ItemCount');
        record('C7', 'You can read the Welcome layouts library (P-01)', layouts.outcome === 'OK' ? 'PASS' : 'FAIL',
               layouts.outcome, layouts.outcome === 'OK' ? 'Found' : short(layouts));

        var errorsList = await call('GET', listPath(WELCOME_ERRORS) + '?$select=Title');
        record('C8', 'You can read the Welcome errors list (needed, or the page goes blank)',
               errorsList.outcome === 'OK' ? 'PASS' : 'FAIL', errorsList.outcome,
               errorsList.outcome === 'OK' ? 'Found' : short(errorsList) +
               (errorsList.outcome === 'NOT FOUND' ? ' - Welcome may not have created it yet' : ''));

        var existing = [];
        for (var i = 0; i < HUB_LISTS.length; i++) {
            var probe = await call('GET', listPath(HUB_LISTS[i]) + '?$select=Title');
            if (probe.outcome === 'OK') existing.push(HUB_LISTS[i]);
        }
        record('C9', 'Competency Hub lists already on this site (information)', 'NOTE', 'OK',
               existing.length ? 'Found: ' + existing.join(', ') + ' - tell me, as a new site should have none'
                               : 'None found, as expected for a new site');

        var ctxRes = await call('POST', '/_api/contextinfo');
        var digest = ctxRes.json && (ctxRes.json.FormDigestValue ||
                     (ctxRes.json.d && ctxRes.json.d.GetContextWebInformation &&
                      ctxRes.json.d.GetContextWebInformation.FormDigestValue));
        record('C10', 'Signed REST request accepted (changes nothing)', ctxRes.outcome === 'OK' && digest ? 'PASS' : 'FAIL',
               ctxRes.outcome, digest ? 'Request digest obtained' : short(ctxRes));

        setStatus('Checks finished. Now click "Run back-button test", then copy the results box.');
    }

    function runBackButtonTest() {
        if (disposed) return;
        ui.backButton.disabled = true;
        var before = window.location.href;
        var marker = 'chprobe=' + Date.now();
        var testUrl = before + (before.indexOf('?') >= 0 ? '&' : '?') + marker;
        var settled = false;

        function finish(result, detail) {
            if (settled) return;
            settled = true;
            window.removeEventListener('popstate', onPop);
            var alive = !!getRoot();
            record('C11', 'Browser Back works with the app\'s page links (P-09)',
                   result === 'PASS' && alive ? 'PASS' : 'FAIL', alive ? 'OK' : 'ERROR',
                   detail + (alive ? '' : '; the probe disappeared from the page'));
            ui.backButton.disabled = false;
        }

        function onPop() {
            setTimeout(function () {
                var restored = window.location.href === before;
                finish(restored ? 'PASS' : 'FAIL',
                       restored ? 'Address changed and was restored by Back; the page stayed loaded'
                                : 'Back did not restore the address');
            }, 300);
        }

        try {
            window.addEventListener('popstate', onPop);
            window.history.pushState({ chprobe: true }, '', testUrl);
            if (window.location.href.indexOf(marker) < 0) {
                finish('FAIL', 'The page address could not be changed');
                return;
            }
            setTimeout(function () { window.history.back(); }, 300);
            setTimeout(function () { finish('FAIL', 'No response to Back within 5 seconds'); }, 5000);
        } catch (error) {
            finish('FAIL', 'Error: ' + String(error && error.message ? error.message : error));
        }
    }

    return {
        onInitialize: function () {
            if (started) return;
            started = true;
            try {
                build();
                setStatus('Welcome loaded. Running checks...');
                var webPart = ctx.getWebPart();
                if (!webPart || !webPart.spHttpClient || !webPart.pageContext ||
                    !webPart.pageContext.web || !webPart.pageContext.web.absoluteUrl) {
                    throw new Error('Welcome SharePoint context or SPHttpClient is unavailable');
                }
                http = webPart.spHttpClient;
                httpConfig = http.constructor.configurations.v1;
                state.siteUrl = webPart.pageContext.web.absoluteUrl;
                runReads().catch(function (error) {
                    record('ERR', 'Unexpected error', 'FAIL', 'ERROR',
                           String(error && error.message ? error.message : error));
                    setStatus('Checks stopped with an error; send the results back.');
                });
            } catch (error) {
                setStatus('Probe could not start: ' + String(error && error.message ? error.message : error));
                record('ERR', 'Probe start-up', 'FAIL', 'ERROR', String(error && error.message ? error.message : error));
            }
        },
        onError: function (error) {
            console.error('Competency Hub probe: Welcome error', error);
            setStatus('Welcome reported an error. Press F12, open Console, and screenshot it.');
        },
        onDispose: function () {
            disposed = true;
        }
    };
};
