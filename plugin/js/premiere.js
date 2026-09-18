/*
 * Eddie Drop - 프리미어 넣기 흐름 (Eddie.premiere)
 *   받기 → 프로젝트로 불러오기(소스별 빈) → 소스 모니터 또는 타임라인
 * 모듈은 "어떤 항목의 어떤 파일을" 만 알려주면 된다.
 */
(function (global) {
  'use strict';

  var ui = null;
  function UI() { return ui || (ui = Eddie.ui); }

  function binPath(item, binName) {
    var root = Eddie.settings.get().binRoot || 'Eddie Drop';
    return [root, binName || item.sourceName || item.source];
  }

  function kindOf(item) {
    return (item.type === 'audio') ? 'audio' : 'video';
  }

  /**
   * opts: { item, file, query, mode: 'none'|'insert'|'overwrite', grid, binName }
   *   mode 'none'  → 받아서 프로젝트에 넣고 소스 모니터에 연다
   *   insert/overwrite → 플레이헤드 위치에 넣는다
   */
  function run(opts) {
    var item = opts.item;
    var file = opts.file;
    var grid = opts.grid;
    var mode = opts.mode || 'none';

    function prog(r, label) { grid && grid.progress(item, r, label); }

    // 인터넷에서 받는 파일은 url, 내 컴퓨터 파일은 localPath 를 쓴다
    if (!file || (!file.url && !file.localPath)) {
      UI().toast('받을 수 있는 파일이 없습니다.');
      return Promise.resolve();
    }

    // 내 컴퓨터 파일은 받을 필요가 없다
    if (file.localPath) {
      prog(1, '불러오는 중…');
      return placeLocal(opts, file.localPath);
    }

    prog(0, '받는 중…');

    return Eddie.download.download({
      url: file.url,
      source: item.source,
      id: item.id,
      query: opts.query,
      ext: file.ext || item.ext,
      suffix: file.width ? (file.width + 'p') : null,
      headers: file.headers || item.downloadHeaders || null,
      onProgress: function (got, total) {
        if (total) prog(got / total, UI().fmtMB(got) + ' / ' + UI().fmtMB(total));
        else prog(0.5, UI().fmtMB(got));
      }
    }).then(function (res) {
      // 효과음은 넣기 전에 소리 크기를 재서 목표 dB 에 맞춘다
      if (kindOf(item) !== 'audio' || mode === 'none' || !Eddie.settings.get().sfxNormalize) {
        return { path: res.path, cached: res.cached, level: null };
      }
      prog(1, '소리 크기 재는 중…');
      var target = Eddie.settings.get().sfxTargetDb;
      return Eddie.audioLevel.gainFor(res.path, (target === undefined ? -15 : target))
        .then(function (g) { return { path: res.path, cached: res.cached, level: g }; })
        .catch(function () { return { path: res.path, cached: res.cached, level: null }; });

    }).then(function (res) {
      prog(1, res.cached ? '이미 받아둔 파일' : '불러오는 중…');
      item.__level = res.level;
      return Eddie.host.core('importAndPlace', {
        path: res.path,
        bin: binPath(item, opts.binName),
        mode: mode,
        kind: kindOf(item),
        openInSource: (mode === 'none'),
        advance: Eddie.settings.get().advancePlayhead !== false,
        levelDb: res.level ? res.level.gainDb : null
      }).then(function (r) { return { r: r, path: res.path, level: res.level }; });

    }).then(function (out) { return finish(opts, out); })
      .catch(function (e) {
        var msg = e.message || String(e);
        if (msg.indexOf('활성 시퀀스') >= 0) msg = '시퀀스를 먼저 열어주세요.';
        grid && grid.progressError(item, msg, function () { run(opts); });
        UI().toast(msg);
      });
  }

  /** 넣고 난 뒤 공통 마무리 (안내 문구 · 포커스 · 상태) */
  function finish(opts, out) {
    var item = opts.item;
    var grid = opts.grid;
    var mode = opts.mode || 'none';

    grid && grid.progressDone(item);
    grid && grid.markDraggable(item);
    item.__path = out.path;
    item.__nodeId = out.r.item.nodeId;

    // 이번에 새로 불러왔다면 포커스가 프로젝트 패널로 갔을 수 있다
    if (out.r.item && out.r.item.reused === false) UI().repin();

    {
      if (mode === 'none') {
        UI().toast('소스 모니터에 열었어요 — 이제 , 또는 . 로 넣으세요');
        UI().status('소스 모니터: ' + out.r.item.name, 'ok');
      } else {
        var p = out.r.placed;
        var msg = (mode === 'insert' ? '삽입' : '덮어쓰기') + ' 완료 · ' + p.track + ' 트랙';
        if (p.leveled !== null && p.leveled !== undefined && p.leveled !== false && out.level) {
          msg += ' · 레벨 ' + (p.leveled > 0 ? '+' : '') + p.leveled + 'dB' +
                 ' (피크 ' + out.level.peakDb + '→' + (Eddie.settings.get().sfxTargetDb === undefined ? -15 : Eddie.settings.get().sfxTargetDb) + 'dB)';
        } else if (p.leveled === false) {
          msg += ' · 레벨은 못 맞췄어요';
        }
        UI().toast(p.warn ? msg + ' — ' + p.warn : msg);
        UI().status(msg, 'ok');
        // 불러오기 때문에 포커스가 프로젝트/소스 패널로 넘어갔을 수 있다.
        // 되돌려놔야 , 를 연달아 눌러도 프리미어로 새지 않는다.
        UI().repin();
      }
      return out.r;
    }
  }

  /** 이미 컴퓨터에 있는 파일을 넣는다 (받기 단계를 건너뛴다) */
  function placeLocal(opts, path) {
    var item = opts.item;
    var mode = opts.mode || 'none';
    var s = Eddie.settings.get();

    var prep = Promise.resolve(null);
    if (kindOf(item) === 'audio' && mode !== 'none' && s.sfxNormalize) {
      var target = (s.sfxTargetDb === undefined) ? -15 : s.sfxTargetDb;
      prep = Eddie.audioLevel.gainFor(path, target).catch(function () { return null; });
    }

    return prep.then(function (level) {
      return Eddie.host.core('importAndPlace', {
        path: path,
        bin: binPath(item, opts.binName),
        mode: mode,
        kind: kindOf(item),
        openInSource: (mode === 'none'),
        advance: s.advancePlayhead !== false,
        levelDb: level ? level.gainDb : null
      }).then(function (r) { return { r: r, path: path, level: level }; });
    }).then(function (out) { return finish(opts, out); })
      .catch(function (e) {
        var msg = e.message || String(e);
        if (msg.indexOf('활성 시퀀스') >= 0) msg = '시퀀스를 먼저 열어주세요.';
        opts.grid && opts.grid.progressError(item, msg, function () { run(opts); });
        UI().toast(msg);
      });
  }

  /**
   * 파일만 받아둔다 (드래그앤드롭 준비용).
   * 드롭하면 프리미어가 알아서 불러오므로 프로젝트에는 넣지 않는다.
   * opts: { item, file, query, grid }
   */
  function fetchOnly(opts) {
    var item = opts.item;
    var file = opts.file;
    var grid = opts.grid;

    if (item.__path && Eddie.download.exists(item.__path)) return Promise.resolve(item.__path);
    if (item.__fetching) return item.__fetching;
    if (file && file.localPath) { item.__path = file.localPath; return Promise.resolve(file.localPath); }
    if (!file || !file.url) return Promise.reject(new Error('받을 수 있는 파일이 없습니다.'));

    grid && grid.progress(item, 0, '드래그 준비 중…');

    item.__fetching = Eddie.download.download({
      url: file.url,
      source: item.source,
      id: item.id,
      query: opts.query,
      ext: file.ext || item.ext,
      suffix: file.width ? (file.width + 'p') : null,
      headers: file.headers || item.downloadHeaders || null,
      onProgress: function (got, total) {
        if (total) grid && grid.progress(item, got / total, UI().fmtMB(got) + ' / ' + UI().fmtMB(total));
      }
    }).then(function (res) {
      item.__fetching = null;
      item.__path = res.path;
      grid && grid.progressDone(item);
      grid && grid.markDraggable(item);

      // 효과음은 끌어놓기로 넣을 때도 레벨을 맞출 수 있게 미리 재둔다
      if (kindOf(item) === 'audio' && Eddie.settings.get().sfxNormalize) {
        var target = Eddie.settings.get().sfxTargetDb;
        Eddie.audioLevel.gainFor(res.path, (target === undefined ? -15 : target))
          .then(function (g) { item.__level = g; })
          .catch(function () {});
      }
      return res.path;
    }).catch(function (e) {
      item.__fetching = null;
      var msg = e.message || String(e);
      grid && grid.progressError(item, msg, function () { fetchOnly(opts); });
      UI().toast(msg);
      throw e;
    });

    return item.__fetching;
  }

  /**
   * 끌어놓기로 넣은 클립을 뒷정리한다.
   * 드롭은 프리미어가 처리하므로 패널이 클립을 만들지 않는다.
   * → 클립이 생길 때까지 확인하다가, 찾으면
   *    효과음은 레벨을, 영상·이미지는 크기를 맞춘다.
   */
  function afterDrop(item, opts) {
    var s = Eddie.settings.get();
    if (!item.__path) return;

    // 드롭이 CEF 밖(프리미어)에서 끝나면 dragend 가 안 올 수도 있다.
    // 그래서 dragstart 에서도 부르는데, 두 번 도는 걸 막는다.
    if (item.__afterDropRunning) return;
    item.__afterDropRunning = true;
    setTimeout(function () { item.__afterDropRunning = false; }, 12000);

    // 끌어놓기는 프리미어가 직접 불러오기 때문에 프로젝트 맨 위에 들어간다.
    // 들어온 뒤에 찾아서 소스별 빈으로 옮긴다. (더블클릭·삽입과 같은 자리로)
    var bin = binPath(item, opts && opts.binName);
    poll('organizeByPath', { path: item.__path, bin: bin }, function (r) {
      if (r && r.moved > 0) UI().status('[' + bin.join(' / ') + '] 빈으로 정리했어요', 'ok');
    });

    var isAudio = (kindOf(item) === 'audio');

    if (isAudio) {
      if (!s.sfxNormalize) return;
      var target = (s.sfxTargetDb === undefined) ? -15 : s.sfxTargetDb;
      Eddie.audioLevel.gainFor(item.__path, target).then(function (g) {
        if (!g || g.silent) return;
        poll('levelClipsByPath', { path: item.__path, levelDb: g.gainDb }, function () {
          UI().toast('레벨 ' + (g.gainDb > 0 ? '+' : '') + g.gainDb + 'dB 로 맞췄어요 (피크 ' + g.peakDb + '→' + target + 'dB)');
        });
      }).catch(function () {});
      return;
    }

  }

  /**
   * 클립이 들어올 때까지 지켜본다.
   * 드래그를 시작한 시점부터 부르므로, 놓을 때까지 기다렸다가 처리한다.
   */
  function poll(fn, args, onDone) {
    var tries = 0;
    function attempt() {
      tries++;
      Eddie.host.core(fn, args).then(function (r) {
        if (r && r.count > 0) { onDone(r); return; }
        if (tries < 14) setTimeout(attempt, 700);      // 약 10초간 지켜본다
      }).catch(function (e) {
        if (tries < 14) setTimeout(attempt, 700);      // 시퀀스가 아직 없을 수도 있다
      });
    }
    setTimeout(attempt, 600);                          // 놓기 전에는 확인할 게 없다
  }

  /**
   * 고른 항목을 미리 받아서 프로젝트에 넣어둔다.
   *
   * 왜 필요한가: 파일을 불러오면(importFiles) 프리미어가 프로젝트 패널로 포커스를 옮긴다.
   * 그 상태에서 , 를 누르면 패널이 아니라 프리미어가 키를 받아
   * "소스 모니터에 열려 있던 클립" 이 대신 삽입되는 사고가 난다.
   * 미리 불러와 두면 , 를 눌렀을 때는 배치만 하므로 포커스가 흔들리지 않는다.
   */
  function preload(opts) {
    var item = opts.item;
    var s = Eddie.settings.get();
    if (item.__nodeId) return Promise.resolve(item.__nodeId);          // 이미 넣어둠
    if (item.__preloading) return item.__preloading;

    item.__preloading = fetchOnly(opts).then(function (path) {
      return Eddie.host.core('importFile', {
        path: path,
        bin: binPath(item, opts.binName)
      });
    }).then(function (info) {
      item.__preloading = null;
      item.__nodeId = info.nodeId;
      // 불러오면서 포커스가 넘어갔을 수 있으니 되돌린다
      UI().repin();
      return info.nodeId;
    }).catch(function () {
      item.__preloading = null;
      UI().repin();          // 실패해도 포커스는 되돌린다
      return null;
    });

    return item.__preloading;
  }

  global.Eddie.premiere = {
    run: run,
    fetchOnly: fetchOnly,
    preload: preload,
    afterDrop: afterDrop,
    levelAfterDrop: afterDrop,   // 예전 이름
    // 마지막으로 확인한 프리미어 정보 (문의 메일에 버전을 적을 때 쓴다)
    lastPing: null,
    ping: function () {
      return Eddie.host.core('ping').then(function (d) {
        Eddie.premiere.lastPing = d;
        return d;
      });
    },
    hasSequence:  function ()     { return Eddie.host.core('hasActiveSequence'); },
    openInSource: function (args) { return Eddie.host.core('openInSource', args); },
    place:        function (args) { return Eddie.host.core('place', args); }
  };

})(window);
