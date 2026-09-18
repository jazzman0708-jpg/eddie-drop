/*
 * Eddie Drop - 내 파일 탭
 * 내 컴퓨터에 있는 영상 · 이미지 · 효과음을 찾아 바로 넣는다.
 * 인터넷에서 받지 않으므로 다운로드 단계가 없다.
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var fs   = (typeof require === 'function') ? require('fs') : null;
  var path = (typeof require === 'function') ? require('path') : null;
  var os   = (typeof require === 'function') ? require('os') : null;

  var VIDEO = ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'mxf', 'mpg', 'mpeg', 'wmv'];
  var IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'webp', 'bmp', 'heic'];
  var AUDIO = ['mp3', 'wav', 'aif', 'aiff', 'm4a', 'flac', 'ogg', 'aac'];

  var KINDS = [
    { v: '',      ko: '전체' },
    { v: 'video', ko: '영상' },
    { v: 'image', ko: '이미지' },
    { v: 'audio', ko: '효과음 · 음악' }
  ];

  var SORTS = [
    { v: 'name',      ko: '이름순 (가나다)' },
    { v: 'name-desc', ko: '이름 거꾸로' },
    { v: 'kind',      ko: '종류순 (영상 → 이미지 → 소리)' },
    { v: 'size',      ko: '크기순 (큰 것부터)' },
    { v: 'size-asc',  ko: '크기순 (작은 것부터)' },
    { v: 'newest',    ko: '최근 추가순' },
    { v: 'oldest',    ko: '오래된 순' }
  ];

  // 종류순으로 묶을 때의 차례
  var KIND_ORDER = { video: 1, image: 2, audio: 3 };

  var MAX_FILES = 400;          // 한 폴더에 너무 많으면 앞에서 자른다

  // 효과음 미리듣기 (한 번에 하나만)
  var player = null;
  var playingItem = null;

  function stopAudio() {
    if (player) { try { player.pause(); } catch (e) {} }
    if (playingItem && playingItem.__card) playingItem.__card.classList.remove('playing');
    playingItem = null;
  }

  function ext(name) {
    var m = String(name).match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
  }

  function kindOfFile(name) {
    var e = ext(name);
    if (VIDEO.indexOf(e) >= 0) return 'video';
    if (IMAGE.indexOf(e) >= 0) return 'image';
    if (AUDIO.indexOf(e) >= 0) return 'audio';
    return '';
  }

  function fileUrl(p) { return Eddie.platform.fileUrl(p); }

  function fmtDate(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getFullYear() + '').slice(2) + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }

  function fmtSize(bytes) {
    if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + 'GB';
    if (bytes > 1048576) return (bytes / 1048576).toFixed(0) + 'MB';
    return Math.max(1, Math.round(bytes / 1024)) + 'KB';
  }

  // ==================================================================
  function FilesTab() {
    this.dir = null;
    this.kind = '';
    this.sort = 'name';
    this.query = '';
    this.deep = false;
    this.timer = null;
    this.entries = [];
  }

  FilesTab.prototype.startDir = function () {
    var saved = Eddie.settings.get().myFolder;
    if (saved && fs) { try { if (fs.statSync(saved).isDirectory()) return saved; } catch (e) {} }
    return Eddie.platform.defaultMediaDir() || null;
  };

  // ---------------- 화면 ----------------
  FilesTab.prototype.mount = function (view) {
    var self = this;
    var ui = Eddie.ui;
    var el = ui.el;

    view.classList.add('media-view');
    view.innerHTML = '';

    var bar = el('div', 'searchbar');

    // --- 폴더 줄 ---
    var frow = el('div', 'row');
    frow.appendChild(ui.button('btn', '폴더 선택', function () { self.pickFolder(); }));
    this.upBtn = ui.button('btn', '↑ 상위', function () { self.goUp(); });
    frow.appendChild(this.upBtn);
    this.pathBox = el('div', 'grow folder-path');
    this.pathBox.title = '지금 보고 있는 폴더';
    frow.appendChild(this.pathBox);
    frow.appendChild(ui.button('btn', '새로고침', function () { self.load(); }));
    bar.appendChild(frow);

    // --- 폴더 단위로 한 번에 불러오기 ---
    var irow = el('div', 'row');
    this.importBtn = ui.button('btn primary grow', '이 폴더 전체를 프로젝트로 불러오기', function () {
      self.importCurrent();
    });
    irow.appendChild(this.importBtn);
    bar.appendChild(irow);
    bar.appendChild(el('p', 'hint', '지금 보이는 파일들을 폴더 이름의 빈으로 한 번에 넣습니다. 이미 있는 건 건너뜁니다.'));

    // --- 즐겨찾기 ---
    this.favBox = el('div', 'chips recent');
    bar.appendChild(this.favBox);

    // --- 검색 + 필터 ---
    var row = el('div', 'row');
    this.input = el('input', 'grow');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.placeholder = '파일 이름으로 찾기';
    this.input.addEventListener('input', function () {
      clearTimeout(self.timer);
      self.timer = setTimeout(function () { self.query = self.input.value.trim(); self.render(); }, 250);
    });
    row.appendChild(this.input);
    bar.appendChild(row);

    var f = el('div', 'filters');
    var kSel = ui.select('', KINDS, function () { self.kind = kSel.value; self.render(); });
    this.sort = localStorage.getItem('eddieDrop.files.sort') || 'name';
    var sSel = ui.select('', SORTS, function () {
      self.sort = sSel.value;
      localStorage.setItem('eddieDrop.files.sort', self.sort);
      self.render();
    });
    sSel.value = this.sort;
    f.appendChild(kSel);
    f.appendChild(sSel);
    bar.appendChild(f);

    var checks = el('div', 'filter-checks');
    var deepLab = el('label', 'check mini');
    var deepCb = el('input');
    deepCb.type = 'checkbox';
    deepCb.addEventListener('change', function () { self.deep = deepCb.checked; self.load(); });
    deepLab.appendChild(deepCb);
    deepLab.appendChild(el('span', null, '하위 폴더까지'));
    checks.appendChild(deepLab);
    bar.appendChild(checks);

    bar.appendChild(el('p', 'hint howto',
      '클릭 = 고르기 (소리는 듣기) · <b>Tab</b> 다음 · <b>더블클릭</b> = 소스 모니터 · <b>,</b> 삽입 · <b>.</b> 덮어쓰기'));

    // --- 보기 방식 ---
    var vrow = el('div', 'pills view-pills');
    this.viewMode = localStorage.getItem('eddieDrop.files.view') || 'grid';
    [['grid', '썸네일 보기'], ['list', '목록 보기']].forEach(function (v) {
      var b = el('button', 'pill' + (self.viewMode === v[0] ? ' active' : ''), v[1]);
      b.addEventListener('click', function () {
        vrow.querySelectorAll('.pill').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        self.setView(v[0]);
      });
      vrow.appendChild(b);
    });
    bar.appendChild(vrow);

    // --- 썸네일 크기 ---
    var sz = el('div', 'row size-row');
    this.sizeRow = sz;
    sz.appendChild(el('span', 'hint', '썸네일'));
    var range = el('input', 'grow');
    range.type = 'range'; range.min = 100; range.max = 340; range.step = 10;
    range.value = localStorage.getItem('eddieDrop.files.thumb') || 160;
    range.addEventListener('input', function () {
      self.grid.setThumbSize(parseInt(range.value, 10));
      localStorage.setItem('eddieDrop.files.thumb', range.value);
    });
    sz.appendChild(range);
    bar.appendChild(sz);

    view.appendChild(bar);

    // --- 결과 ---
    var results = el('div');
    view.appendChild(results);

    this.grid = new Eddie.Grid(results, {
      thumbSize: parseInt(range.value, 10),
      onSelect: function (item) {
        if (item.isDir) return;                       // 폴더는 불러올 게 없다
        if (item.type === 'audio') self.togglePlay(item);
        // 미리 프로젝트에 넣어두면 , 를 눌렀을 때 포커스가 흔들리지 않는다
        Eddie.premiere.preload({
          item: item,
          file: fileOf(item),
          grid: self.grid,
          binName: path ? Eddie.ui.prettyName(path.basename(self.dir)) : '내 파일'
        });
      },
      onActivate: function (item) {
        if (item.isDir) { self.enter(item.fullPath); return; }
        stopAudio();
        self.place(item, 'none');
      },
      onPlace: function (item, mode) {
        if (item.isDir) { self.importFolder(item.fullPath); return; }   // 폴더는 통째로 불러오기
        self.place(item, mode);
      },
      onDragged: function (item) {
        Eddie.premiere.afterDrop(item, { binName: path ? Eddie.ui.prettyName(path.basename(self.dir)) : '내 파일' });
      },
      onDragPrepare: function () { /* 이미 컴퓨터에 있는 파일이라 받을 게 없다 */ }
    });
    this.grid.defineGroup('files', { name: '내 파일' });
    this.setView(this.viewMode);

    this.dir = this.startDir();
    this.renderFavs();
    this.load();
  };

  /** 썸네일 보기 ↔ 목록 보기 */
  FilesTab.prototype.setView = function (mode) {
    this.viewMode = (mode === 'list') ? 'list' : 'grid';
    localStorage.setItem('eddieDrop.files.view', this.viewMode);
    if (this.grid) this.grid.root.classList.toggle('list-mode', this.viewMode === 'list');
    if (this.sizeRow) this.sizeRow.style.display = (this.viewMode === 'list') ? 'none' : '';
  };

  function fileOf(item) {
    return { localPath: item.fullPath, ext: ext(item.name) };
  }

  // ---------------- 폴더 ----------------
  FilesTab.prototype.pickFolder = function () {
    var r = window.cep.fs.showOpenDialog(false, true, '폴더 선택', this.dir || '', []);
    if (r && r.data && r.data.length) this.enter(Eddie.ui.decodePath(r.data[0]));
  };

  FilesTab.prototype.enter = function (dir) {
    dir = Eddie.ui.decodePath(dir);
    this.dir = dir;
    Eddie.settings.set('myFolder', dir);
    this.addFav(dir);
    this.load();
  };

  FilesTab.prototype.goUp = function () {
    if (!this.dir || !path) return;
    var up = path.dirname(this.dir);
    if (up && up !== this.dir) this.enter(up);
  };

  FilesTab.prototype.favs = function () {
    var list = Eddie.settings.get().myFolders;
    if (!Array.isArray(list)) return [];
    return list.map(function (d) { return Eddie.ui.decodePath(d); });
  };

  FilesTab.prototype.addFav = function (dir) {
    var list = this.favs().filter(function (x) { return x !== dir; });
    list.unshift(dir);
    Eddie.settings.set('myFolders', list.slice(0, 6));
    this.renderFavs();
  };

  FilesTab.prototype.renderFavs = function () {
    var self = this;
    var el = Eddie.ui.el;
    this.favBox.innerHTML = '';
    var all = this.favs();
    var counts = {};
    all.forEach(function (d) {
      var b = path ? path.basename(d) : d;
      counts[b] = (counts[b] || 0) + 1;
    });

    all.forEach(function (dir) {
      var base = path ? path.basename(dir) : dir;
      // 이름이 겹치면 상위 폴더까지 붙여서 구분한다
      if (counts[base] > 1 && path) {
        var up = path.basename(path.dirname(dir));
        if (up) base = up + ' / ' + base;
      }
      var name = Eddie.ui.prettyName(base);
      var c = el('button', 'chip' + (dir === self.dir ? ' on' : ''), name || dir);
      c.title = dir;
      c.addEventListener('click', function () { self.enter(dir); });
      self.favBox.appendChild(c);
    });
  };

  // ---------------- 읽기 ----------------
  FilesTab.prototype.load = function () {
    var self = this;

    if (!fs || !path) { this.grid.message('이 환경에서는 파일을 읽을 수 없습니다.'); return; }
    if (!this.dir) { this.grid.message('위의 <b>[폴더 선택]</b> 을 눌러 폴더를 골라주세요.'); return; }

    this.pathBox.textContent = Eddie.ui.prettyName(this.dir);
    this.upBtn.disabled = (path.dirname(this.dir) === this.dir);
    this.renderFavs();
    this.grid.message('폴더를 읽는 중…');

    setTimeout(function () {
      var out = [];
      var truncated = false;

      function scan(dir, depth) {
        var names;
        try { names = fs.readdirSync(dir); }
        catch (e) { return; }

        names.forEach(function (name) {
          if (out.length >= MAX_FILES) { truncated = true; return; }
          if (name.charAt(0) === '.') return;
          var full = path.join(dir, name);
          var st;
          try { st = fs.statSync(full); } catch (e) { return; }

          if (st.isDirectory()) {
            if (depth === 0) out.push({ isDir: true, name: name, fullPath: full, mtime: st.mtimeMs, size: 0 });
            if (self.deep && depth < 3) scan(full, depth + 1);
            return;
          }
          var k = kindOfFile(name);
          if (!k) return;
          out.push({ isDir: false, name: name, fullPath: full, kind: k, size: st.size, mtime: st.mtimeMs });
        });
      }

      scan(self.dir, 0);
      self.entries = out;
      self.truncated = truncated;
      self.render();
    }, 10);
  };

  // ---------------- 그리기 ----------------
  FilesTab.prototype.render = function () {
    var self = this;
    var q = this.query.toLowerCase();

    var list = this.entries.filter(function (e) {
      if (e.isDir) return !q;                              // 검색 중에는 폴더를 숨긴다
      if (self.kind && e.kind !== self.kind) return false;
      if (q && e.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    function byName(a, b) { return a.name.localeCompare(b.name, 'ko'); }

    list.sort(function (a, b) {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;     // 폴더는 항상 먼저

      switch (self.sort) {
        case 'name-desc': return byName(b, a);
        case 'kind': {
          var ka = KIND_ORDER[a.kind] || 9, kb = KIND_ORDER[b.kind] || 9;
          if (ka !== kb) return ka - kb;
          return byName(a, b);                              // 같은 종류면 이름순
        }
        case 'size':     return b.size - a.size;
        case 'size-asc': return a.size - b.size;
        case 'newest':   return b.mtime - a.mtime;
        case 'oldest':   return a.mtime - b.mtime;
        default:         return byName(a, b);
      }
    });

    this.grid.clear();
    this.grid.defineGroup('files', { name: '내 파일' });

    if (!list.length) {
      this.grid.message(this.entries.length
        ? '조건에 맞는 파일이 없습니다.'
        : '이 폴더에는 쓸 수 있는 파일이 없습니다.<br><span class="dim">영상 · 이미지 · 소리 파일만 보여줍니다.</span>');
      return;
    }

    this.grid.add('files', list.map(function (e) { return self.toItem(e); }), true);
    this.grid.setCount('files', list.length + '개' + (this.truncated ? ' (' + MAX_FILES + '개까지만)' : ''));
    if (this.grid.selected < 0) this.grid.select(0);
  };

  FilesTab.prototype.toItem = function (e) {
    var base = {
      source: 'local',
      sourceName: '내 파일',
      id: e.fullPath,
      name: e.name,
      fullPath: e.fullPath,
      isDir: e.isDir,
      title: Eddie.ui.prettyName(e.name),
      author: { name: Eddie.ui.prettyName(e.name) },
      pageUrl: null,
      __path: e.isDir ? null : e.fullPath,          // 이미 있으니 바로 끌어놓을 수 있다
      files: [{ localPath: e.fullPath, ext: ext(e.name) }],
      ext: ext(e.name)
    };

    if (e.isDir) {
      base.type = 'folder';
      base.tile = 'sq';
      base.thumb = '';
      base.overlayName = Eddie.ui.prettyName(e.name);   // 타일 위에 폴더 이름
      base.sub = '폴더';
      return base;
    }

    base.badge = fmtSize(e.size);
    var kindKo = { video: '영상', image: '이미지', audio: '소리' }[e.kind] || '파일';
    base.sub = kindKo + ' · ' + fmtSize(e.size) + ' · ' + fmtDate(e.mtime);

    if (e.kind === 'image') {
      base.type = 'image';
      base.tile = 'sq';
      base.thumb = fileUrl(e.fullPath);
    } else if (e.kind === 'video') {
      base.type = 'video';
      base.tile = 'sq';                              // 영상·이미지가 섞이므로 타일을 하나로 맞춘다
      base.thumb = '';
      base.previewVideo = fileUrl(e.fullPath);
      base.posterFromVideo = true;                   // 첫 프레임을 썸네일로
    } else {
      base.type = 'audio';
      base.tile = 'sq';
      base.thumb = '';
      base.preview = fileUrl(e.fullPath);
    }
    return base;
  };

  // ---------------- 미리듣기 ----------------
  FilesTab.prototype.togglePlay = function (item) {
    if (playingItem === item && player && !player.paused) { stopAudio(); return; }
    stopAudio();
    if (!player) player = new Audio();
    player.src = item.preview;
    player.currentTime = 0;
    try { player.volume = Math.max(0, Math.min(100, Eddie.settings.get().sfxVolume)) / 100; } catch (e) {}
    player.play().catch(function () {});
    playingItem = item;
    if (item.__card) item.__card.classList.add('playing');
    player.onended = function () { stopAudio(); };
  };

  // ---------------- 넣기 ----------------
  FilesTab.prototype.place = function (item, mode) {
    if (item.isDir) return;
    Eddie.premiere.run({
      item: item,
      file: fileOf(item),
      mode: mode,
      grid: this.grid,
      binName: path ? Eddie.ui.prettyName(path.basename(this.dir)) : '내 파일'
    });
  };

  // ---------------- 폴더 단위 불러오기 ----------------
  /** 지금 화면에 보이는 파일들을 한 번에 불러온다 */
  FilesTab.prototype.importCurrent = function () {
    var items = (this.grid.groups.files ? this.grid.groups.files.items : [])
      .filter(function (it) { return !it.isDir; });

    if (!items.length) { Eddie.ui.toast('불러올 파일이 없습니다.'); return; }

    var name = path ? path.basename(this.dir) : '내 파일';
    this.doImport(items.map(function (it) { return it.fullPath; }), name);
  };

  /** 폴더 하나를 통째로 불러온다 (하위 폴더는 제외) */
  FilesTab.prototype.importFolder = function (dir) {
    if (!fs || !path) return;
    var paths = [];
    try {
      fs.readdirSync(dir).forEach(function (name) {
        if (name.charAt(0) === '.') return;
        if (!kindOfFile(name)) return;
        var full = path.join(dir, name);
        try { if (fs.statSync(full).isFile()) paths.push(full); } catch (e) {}
      });
    } catch (e) {
      Eddie.ui.toast('폴더를 읽지 못했습니다.');
      return;
    }
    if (!paths.length) { Eddie.ui.toast('그 폴더에는 쓸 수 있는 파일이 없습니다.'); return; }
    this.doImport(paths, path.basename(dir));
  };

  FilesTab.prototype.doImport = function (paths, binName) {
    var btn = this.importBtn;
    var label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = paths.length + '개 불러오는 중…'; }
    Eddie.ui.status(paths.length + '개를 프로젝트로 불러오는 중…');

    var root = Eddie.settings.get().binRoot || 'Eddie Drop';

    Eddie.host.core('importMany', { paths: paths, bin: [root, binName || '내 파일'] })
      .then(function (r) {
        var msg = r.added + '개를 [' + binName + '] 빈에 넣었습니다' +
                  (r.skipped ? ' (이미 있던 ' + r.skipped + '개는 건너뜀)' : '');
        Eddie.ui.toast(msg);
        Eddie.ui.status(msg, 'ok');
        Eddie.ui.repin();
      })
      .catch(function (e) {
        Eddie.ui.toast('불러오지 못했습니다: ' + (e.message || e));
        Eddie.ui.status(e.message || String(e), 'err');
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = label; }
      });
  };

  // ---------------- 키보드 ----------------
  FilesTab.prototype.focusResults = function () { if (this.grid) this.grid.focus(); };

  FilesTab.prototype.handleKey = function (e, name) {
    var g = this.grid;
    if (!g) return;
    name = name || Eddie.ui.keyName(e);

    if (name === 'tab')   { g.step(e.shiftKey ? -1 : 1); e.preventDefault(); return; }
    if (name === 'left')  { g.move('left');  e.preventDefault(); return; }
    if (name === 'right') { g.move('right'); e.preventDefault(); return; }
    if (name === 'up')    { g.move('up');    e.preventDefault(); return; }
    if (name === 'down')  { g.move('down');  e.preventDefault(); return; }

    var item = g.selectedItem();
    if (!item) return;

    if (name === 'space') {
      if (item.type === 'audio') this.togglePlay(item);
      else g.togglePreview();
      e.preventDefault();
      return;
    }
    if (item.isDir) return;
    if (name === 'comma')       { this.place(item, 'insert');    e.preventDefault(); }
    else if (name === 'period') { this.place(item, 'overwrite'); e.preventDefault(); }
  };

  FilesTab.prototype.onHide = function () {
    if (Eddie.settings.get().sfxStopOnLeave !== false) stopAudio();
  };

  SS.FilesTab = FilesTab;

})(window);
