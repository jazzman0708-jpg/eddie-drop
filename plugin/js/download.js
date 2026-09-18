/*
 * Eddie Drop - 다운로드 / 파일 캐시 (Eddie.download)
 * Node의 https, fs 로 파일을 받아 소스별 하위 폴더에 저장한다.
 * 같은 파일이 이미 있으면 다시 받지 않는다.
 */
(function (global) {
  'use strict';

  var https  = (typeof require === 'function') ? require('https') : null;
  var http   = (typeof require === 'function') ? require('http')  : null;
  var fs     = (typeof require === 'function') ? require('fs')    : null;
  var path   = (typeof require === 'function') ? require('path')  : null;
  var urlmod = (typeof require === 'function') ? require('url')   : null;

  var SOURCE_DIR = { pexels: 'Pexels', pixabay: 'Pixabay', giphy: 'GIPHY', freesound: 'Freesound' };

  // 같은 파일을 동시에 두 번 받지 않도록 (경로 → 진행 중인 약속)
  var inflight = {};

  /** 파일명에 쓸 수 없는 글자 정리 (한글은 그대로 둔다) */
  function safeName(s) {
    return String(s || '')
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/[\x00-\x1f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[.\-]+/, '')
      .slice(0, 40);
  }

  function extFromUrl(u, fallback) {
    try {
      var p = new urlmod.URL(u).pathname;
      var m = p.match(/\.([a-z0-9]{2,4})$/i);
      if (m) return m[1].toLowerCase();
    } catch (e) {}
    return fallback || 'bin';
  }

  /** 소스 폴더 경로 (없으면 만든다) */
  function dirFor(source) {
    var base = Eddie.settings.get().downloadDir;
    var dir = path.join(base, SOURCE_DIR[source] || source);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** 소스_ID_검색어.확장자 */
  function buildPath(opts) {
    var ext = opts.ext || extFromUrl(opts.url);
    var parts = [opts.source, String(opts.id)];
    var q = safeName(opts.query);
    if (q) parts.push(q);
    if (opts.suffix) parts.push(safeName(opts.suffix));
    return path.join(dirFor(opts.source), parts.join('_') + '.' + ext);
  }

  function existsWithSize(p) {
    try {
      var st = fs.statSync(p);
      return st.isFile() && st.size > 0;
    } catch (e) { return false; }
  }

  /**
   * 파일 다운로드.
   * opts: { url, source, id, query, ext, suffix, headers, onProgress(받은바이트, 전체바이트) }
   * → Promise<{ path, cached }>
   */
  function download(opts) {
    return new Promise(function (resolve, reject) {
      if (!fs || !https) { reject(new Error('Node.js를 쓸 수 없습니다. 패널을 다시 열어 보세요.')); return; }

      var dest;
      try { dest = opts.destPath || buildPath(opts); }
      catch (e) { reject(new Error('저장 폴더를 만들지 못했습니다: ' + e.message)); return; }

      if (existsWithSize(dest)) { resolve({ path: dest, cached: true }); return; }

      // 이미 받는 중이면 그 작업에 함께 붙는다
      if (inflight[dest]) {
        inflight[dest].then(resolve, reject);
        return;
      }
      var settle = {};
      inflight[dest] = new Promise(function (res2, rej2) { settle.res = res2; settle.rej = rej2; });
      inflight[dest].catch(function () {});   // 붙은 사람이 없을 때 경고 방지
      var origResolve = resolve, origReject = reject;
      resolve = function (v) { delete inflight[dest]; settle.res(v); origResolve(v); };
      reject  = function (v) { delete inflight[dest]; settle.rej(v); origReject(v); };

      var tmp = dest + '.part';
      var redirects = 0;

      function req(u) {
        var parsed;
        try { parsed = new urlmod.URL(u); }
        catch (e) { reject(new Error('주소가 올바르지 않습니다.')); return; }

        var lib = (parsed.protocol === 'http:') ? http : https;
        var r = lib.get({
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: parsed.pathname + parsed.search,
          headers: Object.assign({ 'User-Agent': 'EddieSource/0.1 (Premiere Pro CEP)' }, opts.headers || {})
        }, function (res) {
          // 리다이렉트 따라가기
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (++redirects > 5) { reject(new Error('주소가 계속 바뀝니다. 나중에 다시 시도해 주세요.')); return; }
            req(new urlmod.URL(res.headers.location, u).href);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error('다운로드 실패 (HTTP ' + res.statusCode + ')'));
            return;
          }

          var total = parseInt(res.headers['content-length'] || '0', 10);
          var got = 0;
          var out = fs.createWriteStream(tmp);

          res.on('data', function (c) {
            got += c.length;
            if (opts.onProgress) opts.onProgress(got, total);
          });
          res.pipe(out);

          out.on('finish', function () {
            out.close(function () {
              try {
                fs.renameSync(tmp, dest);
                resolve({ path: dest, cached: false });
              } catch (e) { reject(new Error('파일 저장 실패: ' + e.message)); }
            });
          });
          out.on('error', function (e) {
            try { fs.unlinkSync(tmp); } catch (x) {}
            reject(new Error('파일 저장 실패: ' + e.message));
          });
        });

        r.setTimeout(60000, function () {
          r.destroy(new Error('다운로드 시간이 초과됐습니다.'));
        });
        r.on('error', function (e) {
          try { fs.unlinkSync(tmp); } catch (x) {}
          reject(e);
        });
      }

      req(opts.url);
    });
  }

  /**
   * 썸네일을 로컬에 받아둔다.
   * Pixabay는 이미지 핫링크(사이트 주소를 그대로 쓰는 것)를 금지하므로 반드시 필요하다.
   * → Promise<로컬경로>
   */
  function cacheThumb(source, id, url) {
    if (!fs || !path) return Promise.reject(new Error('Node.js를 쓸 수 없습니다.'));
    var dir = path.join(Eddie.settings.get().downloadDir, '_thumbs');
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (e) { return Promise.reject(e); }

    var dest = path.join(dir, source + '_' + id + '.' + extFromUrl(url, 'jpg'));
    if (existsWithSize(dest)) return Promise.resolve(dest);

    return download({ url: url, destPath: dest }).then(function (r) { return r.path; });
  }

  /** 썸네일 캐시 비우기 → 지운 개수 */
  function clearThumbs() {
    if (!fs || !path) return 0;
    var dir = path.join(Eddie.settings.get().downloadDir, '_thumbs');
    var n = 0;
    try {
      fs.readdirSync(dir).forEach(function (f) {
        try { fs.unlinkSync(path.join(dir, f)); n++; } catch (e) {}
      });
    } catch (e) {}
    return n;
  }

  global.Eddie.download = {
    download: download,
    cacheThumb: cacheThumb,
    clearThumbs: clearThumbs,
    buildPath: buildPath,
    dirFor: dirFor,
    safeName: safeName,
    exists: existsWithSize
  };
  global.Downloader = global.Eddie.download;   // 짧은 별칭

})(window);
