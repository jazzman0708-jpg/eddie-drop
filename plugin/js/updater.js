/*
 * Eddie Drop - 업데이트 (Eddie.updater)
 *
 * 흐름
 *   1. version.json 을 읽어 새 버전이 있는지 본다
 *   2. zip 을 받아 sha256(파일 지문)이 맞는지 확인한다
 *   3. 지금 쓰던 폴더를 .backup 으로 옮겨두고 새 것을 끼운다
 *   4. 패널을 새로고침한다 — 새 것이 안 열리면 로더가 알아서 되돌린다
 *
 * 설치 파일을 다시 깔지 않아도 되는 이유:
 * 기능 파일은 확장이 아니라 사용자 폴더에 있기 때문이다.
 */
(function (global) {
  'use strict';

  var fs     = (typeof require === 'function') ? require('fs') : null;
  var path   = (typeof require === 'function') ? require('path') : null;
  var crypto = (typeof require === 'function') ? require('crypto') : null;
  var cp     = (typeof require === 'function') ? require('child_process') : null;

  var boot = global.EddieBoot || {};

  // ------------------------------------------------------------------
  // 경로
  // ------------------------------------------------------------------
  function pluginDir()  { return boot.pluginDir || ''; }
  function backupDir()  { return pluginDir() + '.backup'; }
  function workDir()    { return path.join(path.dirname(pluginDir()), '.eddie-drop-update'); }
  function pendingFile(){ return path.join(path.dirname(pluginDir()), '.eddie-drop-pending'); }

  function currentVersion() {
    return (boot.meta && boot.meta.version) || Eddie.version || '0.0.0';
  }

  function cmp(a, b) {
    if (boot.compareVersion) return boot.compareVersion(a, b);
    var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var na = parseInt(pa[i] || '0', 10) || 0, nb = parseInt(pb[i] || '0', 10) || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  /** version.json 주소 — plugin.json 의 update 항목에서 온다 */
  function manifestUrl() {
    var u = (boot.meta && boot.meta.update && boot.meta.update.manifestUrl) || '';
    return /OWNER|REPO/.test(u) ? '' : u;   // 아직 안 채운 자리표시자
  }

  function releasePage() {
    return (boot.meta && boot.meta.update && boot.meta.update.homepage) || '';
  }

  // ------------------------------------------------------------------
  // 1. 확인
  // ------------------------------------------------------------------
  /**
   * 서버의 version.json 을 읽는다.
   * → { version, url, sha256, notes, date, minSupportedVersion,
   *     requiresInstaller, installerPage, newer, blocked }
   */
  function check() {
    var url = manifestUrl();
    if (!url) {
      return Promise.reject(new Error('업데이트 주소가 아직 정해지지 않았습니다. (배포 단계에서 넣습니다)'));
    }
    // 주소가 바뀌어도 https 가 아니면 받지 않는다
    if (url.indexOf('https://') !== 0) {
      return Promise.reject(new Error('업데이트 주소가 https 가 아닙니다.'));
    }

    return Eddie.net.getJson(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache' },
      timeout: 12000
    }).then(function (res) {
      if (res.status !== 200 || !res.json) {
        throw new Error('업데이트 정보를 읽지 못했습니다 (HTTP ' + res.status + ')');
      }
      var info = res.json;
      if (!info.version) throw new Error('업데이트 정보에 버전이 없습니다.');

      info.newer   = cmp(info.version, currentVersion()) > 0;
      info.blocked = !!(info.minSupportedVersion &&
                        cmp(info.minSupportedVersion, currentVersion()) > 0);

      Eddie.settings.set('lastUpdateCheck', Date.now());
      lastInfo = info;
      return info;
    });
  }

  var lastInfo = null;

  // ------------------------------------------------------------------
  // 2. 받기 · 지문 확인
  // ------------------------------------------------------------------
  function sha256(file) {
    return new Promise(function (resolve, reject) {
      var h = crypto.createHash('sha256');
      var s = fs.createReadStream(file);
      s.on('data', function (c) { h.update(c); });
      s.on('end', function () { resolve(h.digest('hex')); });
      s.on('error', reject);
    });
  }

  // ------------------------------------------------------------------
  // 3. 압축 풀기 — 운영체제 기본 도구를 쓴다
  // ------------------------------------------------------------------
  function extract(zipPath, destDir) {
    return new Promise(function (resolve, reject) {
      if (!cp) { reject(new Error('압축을 풀 수 없습니다.')); return; }
      fs.mkdirSync(destDir, { recursive: true });

      var cmd;
      if (Eddie.platform.isWin) {
        var q = function (p) { return "'" + String(p).replace(/'/g, "''") + "'"; };
        cmd = 'powershell -NoProfile -NonInteractive -Command ' +
              JSON.stringify('Expand-Archive -LiteralPath ' + q(zipPath) +
                             ' -DestinationPath ' + q(destDir) + ' -Force');
      } else {
        cmd = '/usr/bin/unzip -o -q ' + JSON.stringify(zipPath) + ' -d ' + JSON.stringify(destDir);
      }

      cp.exec(cmd, { timeout: 120000 }, function (err) {
        if (err) { reject(new Error('압축을 풀지 못했습니다: ' + err.message)); return; }
        resolve(destDir);
      });
    });
  }

  /** 압축 안에 폴더가 한 겹 더 있을 수 있다 → plugin.json 이 있는 곳을 찾는다 */
  function findPayload(dir) {
    if (fs.existsSync(path.join(dir, 'plugin.json'))) return dir;
    var subs = fs.readdirSync(dir).filter(function (n) {
      try { return n !== '__MACOSX' && fs.statSync(path.join(dir, n)).isDirectory(); }
      catch (e) { return false; }
    });
    for (var i = 0; i < subs.length; i++) {
      var p = path.join(dir, subs[i]);
      if (fs.existsSync(path.join(p, 'plugin.json'))) return p;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // 파일 옮기기 (다른 디스크면 rename 이 안 되므로 복사로 대신한다)
  // ------------------------------------------------------------------
  function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }

  function copyDir(from, to) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(function (name) {
      if (name === '.DS_Store' || name === '__MACOSX') return;
      var src = path.join(from, name), dst = path.join(to, name);
      if (fs.statSync(src).isDirectory()) copyDir(src, dst);
      else fs.copyFileSync(src, dst);
    });
  }

  function move(from, to) {
    try { fs.renameSync(from, to); }
    catch (e) { copyDir(from, to); rmrf(from); }
  }

  // ------------------------------------------------------------------
  // 4. 설치
  // ------------------------------------------------------------------
  /**
   * info: check() 가 돌려준 것
   * onStep(글자) 로 진행 상황을 알려준다.
   * 끝나면 패널을 새로고침한다.
   */
  function install(info, onStep) {
    var step = onStep || function () {};

    if (!fs || !path || !crypto) {
      return Promise.reject(new Error('Node.js 를 쓸 수 없어 업데이트할 수 없습니다.'));
    }
    if (!info || !info.url) {
      return Promise.reject(new Error('받을 주소가 없습니다.'));
    }
    if (info.requiresInstaller) {
      return Promise.reject(new Error('이 버전은 설치 파일을 새로 받아야 합니다.'));
    }
    if (info.url.indexOf('https://') !== 0) {
      return Promise.reject(new Error('파일 주소가 https 가 아닙니다. 받지 않습니다.'));
    }
    if (!info.sha256) {
      return Promise.reject(new Error('파일 지문(sha256)이 없어 확인할 수 없습니다.'));
    }

    var work = workDir();
    var zip  = path.join(work, 'eddie-drop-' + info.version + '.zip');
    var un   = path.join(work, 'unpacked');
    var dir  = pluginDir();
    var back = backupDir();
    var swapped = false;

    rmrf(work);
    fs.mkdirSync(work, { recursive: true });

    step('내려받는 중…');
    return Eddie.download.download({
      url: info.url,
      destPath: zip,
      onProgress: function (got, total) {
        if (total) step('내려받는 중… ' + Math.round(got / total * 100) + '%');
      }
    })
      .then(function () {
        step('파일 확인 중…');
        return sha256(zip);
      })
      .then(function (digest) {
        if (digest.toLowerCase() !== String(info.sha256).toLowerCase()) {
          throw new Error('파일이 손상됐거나 바뀌었습니다. 설치를 멈춥니다.');
        }
        step('압축 푸는 중…');
        return extract(zip, un);
      })
      .then(function () {
        var payload = findPayload(un);
        if (!payload) throw new Error('받은 파일 안에 기능 파일이 없습니다.');

        var meta = JSON.parse(fs.readFileSync(path.join(payload, 'plugin.json'), 'utf8'));
        if (cmp(meta.version, currentVersion()) <= 0) {
          throw new Error('받은 파일이 지금 버전보다 새것이 아닙니다 (v' + meta.version + ').');
        }

        step('바꾸는 중…');
        // 되돌릴 수 있게, 새 것이 잘 열렸는지 확인되기 전까지 표시를 남긴다
        fs.writeFileSync(pendingFile(), JSON.stringify({
          from: currentVersion(), to: meta.version, at: Date.now(), tries: 0
        }), 'utf8');

        rmrf(back);
        move(dir, back);
        swapped = true;
        move(payload, dir);

        rmrf(work);
        step('다시 시작합니다…');
        return meta.version;
      })
      .then(function (v) {
        setTimeout(function () { location.reload(); }, 600);
        return v;
      })
      .catch(function (e) {
        // 바꾸던 중에 잘못되면 곧바로 되돌린다
        if (swapped) {
          try { rmrf(dir); move(back, dir); } catch (x) {}
        }
        try { fs.unlinkSync(pendingFile()); } catch (x) {}
        rmrf(work);
        throw e;
      });
  }

  /** 직전 버전으로 되돌리기 (백업이 있을 때만) */
  function canRollback() {
    try { return !!backupDir() && fs.existsSync(path.join(backupDir(), 'plugin.json')); }
    catch (e) { return false; }
  }

  function backupVersion() {
    try { return JSON.parse(fs.readFileSync(path.join(backupDir(), 'plugin.json'), 'utf8')).version; }
    catch (e) { return ''; }
  }

  function rollback() {
    if (!canRollback()) return Promise.reject(new Error('되돌릴 이전 버전이 없습니다.'));
    return new Promise(function (resolve, reject) {
      try {
        var tmp = pluginDir() + '.discard';
        rmrf(tmp);
        move(pluginDir(), tmp);
        move(backupDir(), pluginDir());
        rmrf(tmp);
        setTimeout(function () { location.reload(); }, 400);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  // ------------------------------------------------------------------
  // 너무 오래된 버전 막기
  // ------------------------------------------------------------------
  function block(info) {
    if (document.getElementById('update-block')) return;
    var box = document.createElement('div');
    box.id = 'update-block';
    box.innerHTML =
      '<div class="ub-inner">' +
      '<h2>업데이트가 필요합니다</h2>' +
      '<p>지금 버전(v' + currentVersion() + ')은 더 이상 쓸 수 없습니다.<br>' +
      'v' + info.minSupportedVersion + ' 이상으로 올려주세요.</p>' +
      '<div class="ub-row"></div>' +
      '<div class="ub-status"></div></div>';
    document.body.appendChild(box);

    var row = box.querySelector('.ub-row');
    var stat = box.querySelector('.ub-status');

    if (info.requiresInstaller) {
      row.appendChild(Eddie.ui.button('btn primary', '설치 파일 받기', function () {
        Eddie.host.openUrl(info.installerPage || releasePage());
      }));
    } else {
      row.appendChild(Eddie.ui.button('btn primary', 'v' + info.version + ' 로 업데이트', function () {
        install(info, function (m) { stat.textContent = m; })
          .catch(function (e) { stat.textContent = '실패: ' + e.message; });
      }));
    }
  }

  // ------------------------------------------------------------------
  // 시작할 때 조용히 확인
  // ------------------------------------------------------------------
  function autoCheck() {
    if (!Eddie.settings.get().autoUpdate) return Promise.resolve(null);
    if (!manifestUrl()) return Promise.resolve(null);

    return check().then(function (info) {
      if (info.blocked) { block(info); return info; }
      if (info.newer) {
        Eddie.ui.toast('새 버전 v' + info.version + ' 이 있습니다 — 설정 탭에서 업데이트하세요.');
        var badge = document.querySelector('#tabbar .tab.settings');
        if (badge) badge.classList.add('has-update');
      }
      return info;
    }).catch(function (e) {
      console.warn('[업데이트 확인]', e.message);   // 조용히 넘어간다
      return null;
    });
  }

  /** 새 버전이 잘 열렸다 — 되돌리기 표시를 지운다 */
  function markHealthy() {
    try { if (fs && fs.existsSync(pendingFile())) fs.unlinkSync(pendingFile()); } catch (e) {}
  }

  global.Eddie.updater = {
    currentVersion: currentVersion,
    check: check,
    install: install,
    autoCheck: autoCheck,
    rollback: rollback,
    canRollback: canRollback,
    backupVersion: backupVersion,
    markHealthy: markHealthy,
    manifestUrl: manifestUrl,
    releasePage: releasePage,
    pluginDir: pluginDir,
    last: function () { return lastInfo; }
  };

})(window);
