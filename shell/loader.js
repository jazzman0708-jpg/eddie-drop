/*
 * Eddie Drop - 로더 (확장 껍데기)
 *
 * 하는 일
 *   1. 사용자 폴더에 기능 파일이 있는지 본다
 *        맥   ~/Library/Application Support/Eddie/plugins/eddie-drop/
 *        윈도 %APPDATA%\Eddie\plugins\eddie-drop\
 *   2. 없거나 확장에 든 기본 벌이 더 새것이면 복사해 넣는다
 *   3. 사용자 폴더의 plugin.json 을 읽어 css · js · jsx 를 순서대로 불러온다
 *
 * 이렇게 해두면 설치 파일을 다시 깔지 않아도 기능만 새로 받을 수 있다.
 * 이 파일은 확장에 들어가므로 되도록 손대지 않는다.
 */
(function () {
  'use strict';

  var fs = (typeof require === 'function') ? require('fs') : null;
  var pathMod = (typeof require === 'function') ? require('path') : null;
  var os = (typeof require === 'function') ? require('os') : null;

  var cs = new CSInterface();
  var statusEl, detailEl;

  // ---------------- 화면 ----------------
  function say(msg, detail) {
    if (!statusEl) statusEl = document.getElementById('boot-status');
    if (!detailEl) detailEl = document.getElementById('boot-detail');
    if (statusEl) statusEl.textContent = msg;
    if (detailEl) detailEl.innerHTML = detail || '';
  }

  function fail(msg, detail) {
    say(msg, detail || '');
    var box = document.getElementById('boot');
    if (box) box.classList.add('failed');
    console.error('[로더]', msg, detail || '');
  }

  // ---------------- 경로 ----------------
  var isWin = /^win/i.test((os && os.platform && os.platform()) || '') ||
              /Win/i.test(navigator.platform || '');

  function appSupportDir() {
    var home = (os && os.homedir) ? os.homedir() : '';
    if (isWin) {
      var appData = (typeof process !== 'undefined' && process.env &&
                     (process.env.APPDATA || process.env.appdata));
      return pathMod.join(appData || pathMod.join(home, 'AppData', 'Roaming'), 'Eddie');
    }
    return pathMod.join(home, 'Library', 'Application Support', 'Eddie');
  }

  function pluginsDir() {
    return pathMod.join(appSupportDir(), 'plugins');
  }

  function userPluginDir() {
    return pathMod.join(pluginsDir(), 'eddie-drop');
  }

  /**
   * 업데이트 직후에만 잠깐 생기는 표시 파일.
   *
   *   업데이트 → 표시 남김(tries:0) → 패널 새로고침
   *   → 새 버전이 끝까지 잘 열리면 표시를 지운다
   *   → 안 열리면 표시가 그대로 남고, 다음에 열 때 이전 버전으로 되돌린다
   */
  function pendingFile() {
    return pathMod.join(pluginsDir(), '.eddie-drop-pending');
  }

  function extensionDir() {
    return cs.getSystemPath(SystemPath.EXTENSION);
  }

  function bundledDir() {
    return pathMod.join(extensionDir(), 'plugin');
  }

  /**
   * 개발 모드인지.
   * 확장 폴더에 .dev 파일이 있으면 켜진다 — 만들 때만 쓰는 표시라
   * 배포본에는 절대 들어가지 않는다(build.sh 가 막는다).
   */
  var dev = false;
  function detectDev() {
    try { dev = fs.existsSync(pathMod.join(extensionDir(), '.dev')); }
    catch (e) { dev = false; }
    return dev;
  }

  function fileUrl(p) {
    var s = String(p).replace(/\\/g, '/');
    if (s.charAt(0) !== '/') s = '/' + s;
    return 'file://' + encodeURI(s);
  }

  // ---------------- 파일 다루기 ----------------
  function readJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { return null; }
  }

  function copyDir(from, to) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(function (name) {
      if (name === '.DS_Store') return;
      var src = pathMod.join(from, name);
      var dst = pathMod.join(to, name);
      var st = fs.statSync(src);
      if (st.isDirectory()) copyDir(src, dst);
      else fs.copyFileSync(src, dst);
    });
  }

  /** '1.2.0' 비교 → 양수면 a 가 더 새것 */
  function compareVersion(a, b) {
    var pa = String(a || '0').split('.');
    var pb = String(b || '0').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var na = parseInt(pa[i] || '0', 10) || 0;
      var nb = parseInt(pb[i] || '0', 10) || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }

  /**
   * 업데이트한 새 버전이 열리다 말았으면 직전 버전으로 되돌린다.
   * → 되돌렸으면 안내 문구, 아니면 null
   */
  function rollbackIfBroken() {
    var marker = pendingFile();
    if (!fs.existsSync(marker)) return null;

    var note = null;
    try { note = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch (e) {}
    note = note || {};

    // 첫 번째 열기는 새 버전이 스스로 증명할 기회다. 여기서 되돌리면 안 된다.
    var tries = (note.tries || 0) + 1;
    if (tries < 2) {
      note.tries = tries;
      try { fs.writeFileSync(marker, JSON.stringify(note), 'utf8'); } catch (e) {}
      return null;
    }

    // 두 번째로 열었는데도 표시가 남아 있다 = 지난번에 끝까지 못 열렸다
    var userDir = userPluginDir();
    var backup = userDir + '.backup';

    try { fs.unlinkSync(marker); } catch (e) {}

    if (!fs.existsSync(pathMod.join(backup, 'plugin.json'))) return null;

    try {
      var discard = userDir + '.discard';
      rmrf(discard);
      if (fs.existsSync(userDir)) fs.renameSync(userDir, discard);
      fs.renameSync(backup, userDir);
      rmrf(discard);
    } catch (e) {
      return null;
    }

    return '새 버전(v' + ((note && note.to) || '?') + ')이 제대로 열리지 않아 ' +
           '이전 버전(v' + ((note && note.from) || '?') + ')으로 되돌렸습니다.';
  }

  // ---------------- 준비 ----------------
  /**
   * 사용자 폴더에 기능 파일을 갖춰 놓는다.
   * → { dir, meta, copied, rolledBack }
   */
  function prepare() {
    var rolledBack = rollbackIfBroken();

    var userDir = userPluginDir();
    var bundled = bundledDir();

    var bundledMeta = readJson(pathMod.join(bundled, 'plugin.json'));
    if (!bundledMeta) throw new Error('확장 안에 기본 기능 파일이 없습니다: ' + bundled);

    var userMeta = readJson(pathMod.join(userDir, 'plugin.json'));
    var copied = false;

    // 개발 중(.debug 가 있을 때)에는 고칠 때마다 바로 보이도록 매번 새로 복사한다.
    // .debug 는 배포본에 들어가지 않으므로 사용자에게는 이 길로 오지 않는다.
    if (dev) {
      rmrf(userDir);
      copyDir(bundled, userDir);
      return { dir: userDir, meta: bundledMeta, copied: true, dev: true, rolledBack: rolledBack };
    }

    if (!userMeta) {
      say('처음 실행이라 기능 파일을 준비하는 중…');
      copyDir(bundled, userDir);
      copied = true;
    } else if (compareVersion(bundledMeta.version, userMeta.version) > 0) {
      // 설치 파일을 새로 깔아 기본 벌이 더 새것이 된 경우
      say('새 버전으로 바꾸는 중… (v' + userMeta.version + ' → v' + bundledMeta.version + ')');
      var backup = userDir + '.backup';
      rmrf(backup);
      try { fs.renameSync(userDir, backup); } catch (e) {}
      copyDir(bundled, userDir);
      copied = true;
    }

    var meta = readJson(pathMod.join(userDir, 'plugin.json'));
    if (!meta) throw new Error('기능 파일 정보를 읽지 못했습니다: ' + userDir);

    return { dir: userDir, meta: meta, copied: copied, rolledBack: rolledBack };
  }

  // ---------------- 불러오기 ----------------
  function loadTag(tag, attrs) {
    return new Promise(function (resolve, reject) {
      var e = document.createElement(tag);
      Object.keys(attrs).forEach(function (k) { e[k] = attrs[k]; });
      e.onload = function () { resolve(); };
      e.onerror = function () { reject(new Error('읽지 못했습니다: ' + (attrs.src || attrs.href))); };
      document.head.appendChild(e);
    });
  }

  function inOrder(list, fn) {
    return list.reduce(function (p, x) { return p.then(function () { return fn(x); }); },
                       Promise.resolve());
  }

  /**
   * ExtendScript 안에 넣을 문자열 리터럴.
   * 한글이 섞인 경로도 안전하도록 아스키가 아닌 글자는 \uXXXX 로 바꾼다.
   */
  function esLit(str) {
    var out = '"';
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i), n = str.charCodeAt(i);
      if (c === '"' || c === '\\') out += '\\' + c;
      else if (n < 32 || n > 126) out += '\\u' + ('000' + n.toString(16)).slice(-4);
      else out += c;
    }
    return out + '"';
  }

  /**
   * 프리미어 쪽 기능 파일(host.jsx) 읽어들이기.
   *
   * $.evalFile 은 반드시 최상위(전역)에서 불러야 한다.
   * 함수 안에서 부르면 host.jsx 의 함수들이 그 함수 안에만 생겨서
   * 나중에 ED_call 을 찾지 못한다. (try 블록은 범위를 만들지 않으므로 안전하다)
   */
  function loadJsx(file) {
    return new Promise(function (resolve) {
      var lit = esLit(file);
      var script =
        'var ED_bootErr = "";' +
        'if (ED_fileExists(' + lit + ') !== "1") { ED_bootErr = ' + esLit('기능 파일이 없습니다: ' + file) + '; }' +
        'else { try { $.evalFile(new File(' + lit + ')); } catch (e) { ED_bootErr = String(e); } }' +
        'ED_bootResult(ED_bootErr);';

      cs.evalScript(script, function (raw) {
        var r = null;
        try { r = JSON.parse(raw); } catch (e) {}
        if (r && r.ok) { resolve(null); return; }
        resolve(new Error((r && r.error) ||
          '프리미어 기능을 읽지 못했습니다. 프리미어를 껐다 켜 주세요. (' + String(raw).slice(0, 80) + ')'));
      });
    });
  }

  // ---------------- 시작 ----------------
  function boot() {
    if (!fs || !pathMod) {
      fail('Node.js 를 쓸 수 없습니다.',
           'manifest 의 <code>--enable-nodejs</code> 설정을 확인해 주세요.');
      return;
    }

    detectDev();

    var info;
    try { info = prepare(); }
    catch (e) {
      fail('기능 파일을 준비하지 못했습니다.', String(e.message || e));
      return;
    }

    window.EddieBoot = {
      pluginDir: info.dir,
      bundledDir: bundledDir(),
      appSupportDir: appSupportDir(),
      pendingFile: pendingFile(),
      rolledBack: info.rolledBack || null,
      meta: info.meta,
      isWin: isWin,
      dev: dev,
      fileUrl: fileUrl,
      compareVersion: compareVersion,
      reload: function () { location.reload(); }
    };

    say('기능을 불러오는 중… (v' + info.meta.version + (info.dev ? ' · 개발' : '') + ')');

    var styles = info.meta.styles || [];
    var scripts = info.meta.scripts || [];

    inOrder(styles, function (rel) {
      return loadTag('link', { rel: 'stylesheet', href: fileUrl(pathMod.join(info.dir, rel)) });
    })
      // 프리미어 쪽을 먼저 읽는다.
      // 화면 스크립트가 시작하자마자 프리미어에 말을 걸기 때문에,
      // 순서가 바뀌면 "프리미어 연결 실패" 가 잠깐 떴다가 사라진다.
      .then(function () {
        if (!info.meta.jsx) return null;
        return loadJsx(pathMod.join(info.dir, info.meta.jsx));
      })
      .then(function (jsxErr) {
        if (jsxErr) {
          window.EddieBoot.jsxError = jsxErr.message;
          console.error('[로더]', jsxErr.message);
        }
        return inOrder(scripts, function (rel) {
          return loadTag('script', { src: fileUrl(pathMod.join(info.dir, rel)), async: false });
        });
      })
      .then(function () {
        var box = document.getElementById('boot');
        if (box) box.parentNode.removeChild(box);
      })
      .catch(function (e) {
        fail('기능을 불러오지 못했습니다.',
             String(e.message || e) +
             '<br><br>기능 파일 폴더를 지우고 패널을 다시 열면 기본 상태로 되돌아갑니다.<br><code>' +
             info.dir + '</code>');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
