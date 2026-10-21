// SharePoint REST for the Setup page, as the signed-in site owner.
// Every write goes through write(), which the engine refuses to call in Check mode.
CHS.rest = (function () {
  function RestError(status, message) {
    this.name = 'RestError';
    this.status = status;
    this.message = message;
  }
  RestError.prototype = Object.create(Error.prototype);

  function create(webPart) {
    var http = webPart.spHttpClient;
    var config = http.constructor.configurations.v1;
    var siteUrl = webPart.pageContext.web.absoluteUrl.replace(/\/$/, '');
    var siteRelative = (webPart.pageContext.web.serverRelativeUrl || '').replace(/\/$/, '');
    var digest = '';
    var writes = 0;

    async function send(method, path, body, opts) {
      opts = opts || {};
      var verbose = !!opts.verbose;
      var type = verbose ? 'application/json;odata=verbose' : 'application/json;odata=nometadata';
      var headers = { 'Accept': type };
      var options = { headers: headers };
      if (method !== 'GET') {
        headers['Content-Type'] = type;
        if (path !== '/_api/contextinfo') headers['X-RequestDigest'] = await getDigest();
        if (opts.merge) { headers['X-HTTP-Method'] = 'MERGE'; headers['IF-MATCH'] = '*'; }
        options.body = body === undefined ? '' : JSON.stringify(body);
      }
      var response;
      try {
        response = method === 'GET' ? await http.get(siteUrl + path, config, options) : await http.post(siteUrl + path, config, options);
      } catch (e) {
        throw new RestError(0, 'Could not reach SharePoint.');
      }
      var text = await response.text();
      var json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
      if (response.status < 200 || response.status >= 300) {
        var msg = json && ((json['odata.error'] && json['odata.error'].message && json['odata.error'].message.value) ||
          (json.error && json.error.message && (json.error.message.value || json.error.message)));
        throw new RestError(response.status, 'HTTP ' + response.status + (msg ? ': ' + msg : ''));
      }
      if (json && json.d) return json.d.results !== undefined && Object.keys(json.d).length === 1 ? json.d.results : json.d;
      return json;
    }

    async function getDigest() {
      if (digest) return digest;
      var json = await send('POST', '/_api/contextinfo');
      digest = json && (json.FormDigestValue || (json.GetContextWebInformation && json.GetContextWebInformation.FormDigestValue));
      if (!digest) throw new RestError(0, 'SharePoint did not provide a request digest.');
      return digest;
    }

    function rows(json) {
      if (!json) return [];
      if (Array.isArray(json)) return json;
      if (Array.isArray(json.value)) return json.value;
      if (json.results) return json.results;
      return [];
    }

    return {
      siteUrl: siteUrl,
      siteRelative: siteRelative,
      get: function (path) { return send('GET', path); },
      getRows: async function (path) { return rows(await send('GET', path)); },
      write: async function (path, body, opts) { writes++; return send('POST', path, body, opts); },
      writeCount: function () { return writes; }
    };
  }

  function q(text) { return String(text).replace(/'/g, "''"); }

  return { create: create, RestError: RestError, q: q };
})();
