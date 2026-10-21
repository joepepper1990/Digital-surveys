// Same-origin SharePoint REST through Welcome's SPHttpClient, as the signed-in user.
// Reads are bounded and paged; a result that hit the limit is marked incomplete, never shown as complete.
CH.sp = (function () {
  function SpError(status, message) {
    this.name = 'SpError';
    this.status = status;
    this.message = message || ('SharePoint request failed (HTTP ' + status + ')');
  }
  SpError.prototype = Object.create(Error.prototype);

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function escapeOData(text) { return String(text).replace(/'/g, "''"); }

  function create(webPart) {
    var http = webPart.spHttpClient;
    var config = http.constructor.configurations.v1;
    var siteUrl = webPart.pageContext.web.absoluteUrl.replace(/\/$/, '');
    var siteRelative = (webPart.pageContext.web.serverRelativeUrl || '').replace(/\/$/, '');
    var origin = siteUrl.slice(0, siteUrl.length - siteRelative.length);
    var digest = { value: '', expires: 0 };

    async function req(method, url, body, attempt) {
      attempt = attempt || 0;
      var headers = { 'Accept': 'application/json;odata=nometadata' };
      var options = { headers: headers };
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json;odata=nometadata';
        if (url.indexOf('/_api/contextinfo') < 0) headers['X-RequestDigest'] = await getDigest();
        options.body = body === undefined ? '' : JSON.stringify(body);
      }
      var response;
      try {
        response = method === 'GET' ? await http.get(url, config, options) : await http.post(url, config, options);
      } catch (error) {
        throw new SpError(0, 'Could not reach SharePoint. Check your connection and try again.');
      }
      if ((response.status === 429 || response.status === 503) && attempt < 3) {
        await wait(1000 * Math.pow(2, attempt));
        return req(method, url, body, attempt + 1);
      }
      var text = await response.text();
      if (response.status < 200 || response.status >= 300) throw new SpError(response.status);
      if (!text) return null;
      try { return JSON.parse(text); } catch (_) { throw new SpError(response.status, 'SharePoint returned an unreadable response.'); }
    }

    async function getDigest() {
      if (digest.value && Date.now() < digest.expires) return digest.value;
      var json = await req('POST', siteUrl + '/_api/contextinfo');
      var value = json && (json.FormDigestValue ||
        (json.d && json.d.GetContextWebInformation && json.d.GetContextWebInformation.FormDigestValue));
      if (!value) throw new SpError(0, 'SharePoint did not provide a request digest.');
      digest = { value: value, expires: Date.now() + 20 * 60 * 1000 };
      return value;
    }

    function listPath(title) { return siteUrl + "/_api/web/lists/getbytitle('" + escapeOData(title) + "')"; }

    // Reads every page up to maxRows. Follows nextLink only when it stays on this site.
    async function items(title, query, maxRows) {
      var limit = maxRows || CH.config.maxRows;
      var url = listPath(title) + '/items?' + query + '&$top=' + CH.config.pageSize;
      var rows = [];
      var complete = true;
      while (url) {
        var json = await req('GET', url);
        var page = (json && (json.value || (json.d && json.d.results))) || [];
        rows = rows.concat(page);
        var next = json && (json['odata.nextLink'] || json['@odata.nextLink'] || (json.d && json.d.__next));
        if (rows.length >= limit && next) { complete = false; break; }
        if (next && next.indexOf(siteUrl + '/') !== 0) { complete = false; break; }
        url = next || null;
      }
      return { rows: rows.slice(0, limit), complete: complete };
    }

    function currentUser() { return req('GET', siteUrl + '/_api/web/currentuser?$select=Id,Title,Email'); }

    // Instant direct write into a folder (plan C.8). Every HasException is checked.
    async function addToFolder(listKey, folder, values) {
      var list = CH.config.lists[listKey];
      var body = {
        listItemCreateInfo: {
          FolderPath: { DecodedUrl: siteRelative + '/Lists/' + list.url + '/' + folder },
          UnderlyingObjectType: 0
        },
        formValues: Object.keys(values).map(function (k) { return { FieldName: k, FieldValue: String(values[k]) }; }),
        bNewDocumentUpdate: false
      };
      var json = await req('POST', listPath(list.title) + '/AddValidateUpdateItemUsingPath', body);
      var results = (json && (json.value || (json.d && json.d.AddValidateUpdateItemUsingPath && json.d.AddValidateUpdateItemUsingPath.results))) || [];
      var failed = results.filter(function (r) { return r.HasException; });
      if (failed.length) throw new SpError(400, failed.map(function (r) { return r.FieldName + ': ' + r.ErrorMessage; }).join('; '));
      var idField = results.filter(function (r) { return r.FieldName === 'Id'; })[0];
      return idField ? Number(idField.FieldValue) : null;
    }

    return { siteUrl: siteUrl, origin: origin, siteRelative: siteRelative, items: items, currentUser: currentUser, addToFolder: addToFolder };
  }

  // The last folder segment of an item's FileDirRef (e.g. '.../Lists/Noticeboard/FLK' -> 'FLK').
  function folderOf(fileDirRef) {
    var parts = String(fileDirRef || '').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  return { create: create, SpError: SpError, escapeOData: escapeOData, folderOf: folderOf };
})();
