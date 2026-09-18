/*
 * Eddie Drop - 네트워크 유틸 (Eddie.net)
 * CEP에서 Node.js(https)를 써서 요청한다. (CORS 영향을 받지 않음)
 */
(function (global) {
  'use strict';

  var https = (typeof require === 'function') ? require('https') : null;
  var http  = (typeof require === 'function') ? require('http')  : null;
  var urlmod = (typeof require === 'function') ? require('url')  : null;

  function nodeReady() { return !!(https && urlmod); }

  /**
   * GET 요청 → { status, headers, text }
   * opts: { headers, timeout }
   */
  function get(rawUrl, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      if (!nodeReady()) { reject(new Error('Node.js를 쓸 수 없습니다. manifest의 --enable-nodejs 설정을 확인하세요.')); return; }

      var u;
      try { u = new urlmod.URL(rawUrl); }
      catch (e) { reject(new Error('주소가 올바르지 않습니다: ' + rawUrl)); return; }

      var lib = (u.protocol === 'http:') ? http : https;
      var req = lib.request({
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method: 'GET',
        headers: Object.assign({
          'User-Agent': 'EddieSource/0.1 (Premiere Pro CEP)',
          'Accept': 'application/json'
        }, opts.headers || {})
      }, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8')
          });
        });
      });

      req.setTimeout(opts.timeout || 15000, function () {
        req.destroy(new Error('요청 시간이 초과됐습니다. 인터넷 연결을 확인해 주세요.'));
      });
      req.on('error', function (err) { reject(err); });
      req.end();
    });
  }

  /** GET → JSON 파싱까지 */
  function getJson(rawUrl, opts) {
    return get(rawUrl, opts).then(function (res) {
      var json = null;
      try { json = JSON.parse(res.text); } catch (e) { /* 그대로 둔다 */ }
      return { status: res.status, headers: res.headers, json: json, text: res.text };
    });
  }

  /** 객체 → 쿼리스트링 (값이 비어있으면 제외) */
  function qs(params) {
    var out = [];
    for (var k in params) {
      if (!params.hasOwnProperty(k)) continue;
      var v = params[k];
      if (v === undefined || v === null || v === '') continue;
      out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    return out.join('&');
  }

  global.Eddie.net = { get: get, getJson: getJson, qs: qs, nodeReady: nodeReady };
  global.Net = global.Eddie.net;   // 짧은 별칭

})(window);
