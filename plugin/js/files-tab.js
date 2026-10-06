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

  // 하위 폴더까지 켜면 효과음 모음 같은 곳은 400개를 금방 넘긴다.
  // 앞에서 잘리면 뒤쪽 파일은 검색해도 안 나오므로 넉넉히 잡는다.
  var MAX_FILES = 50000;

  // 한 번 읽은 폴더를 기억해 둔다 (다시 들어오면 바로 보여주려고)
  var CACHE = {};

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
    // 체크하면 이전 방식: 폴더를 두 번 누르면 그 폴더 안으로 들어간다
    this.folderOpen = localStorage.getItem('eddieDrop.files.folderOpen') === '1';
    this.expanded = {};        // 펼쳐 놓은 폴더 (경로 → true)
    this.childCache = {};      // 폴더별 직속 목록 (한 번 읽으면 기억)
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
    // 기억해 둔 목록을 버리고 폴더를 다시 읽는다
      frow.appendChild(ui.button('btn', '새로고침', function () { self.load(true); }));
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
    var row = el('div', 'row keep')   // 좁혀도 검색창은 남는다;
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

    var openLab = el('label', 'check mini');
    openLab.title = '체크하면 폴더를 두 번 눌렀을 때 그 폴더 안으로 들어갑니다 (이전 방식).\n체크를 풀면 그 자리에서 펼쳐집니다.';
    var openCb = el('input');
    openCb.type = 'checkbox';
    openCb.checked = this.folderOpen;
    openCb.addEventListener('change', function () {
      self.folderOpen = openCb.checked;
      localStorage.setItem('eddieDrop.files.folderOpen', self.folderOpen ? '1' : '0');
      self.expanded = {};
      self.render();
    });
    openLab.appendChild(openCb);
    openLab.appendChild(el('span', null, '폴더 열어서 보기'));
    checks.appendChild(openLab);
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
      view.appendChild(Eddie.ui.splitter(bar, 'files'));

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
        // 폴더는 그 자리에서 펼쳤다 접는다 (프로젝트 패널처럼)
        if (item.isDir) {
          if (self.folderOpen) self.enter(item.fullPath);       // 이전 방식: 폴더 안으로
          else self.toggleFolder(item.fullPath);                // 그 자리에서 펼치기
          return;
        }
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
    this.expanded = {};          // 다른 폴더로 옮기면 펼친 것은 접는다
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
  /**
   * 폴더를 훑어서 파일 목록을 만든다.
   *
   * 프리미어 프로젝트 패널처럼 "한 번 읽어두고 그 목록에서 찾는" 방식이다.
   * 예전에는 3단계 아래까지만 훑어서, 더 깊은 곳에 있는 파일은
   * 검색해도 영영 안 나왔다. (실제 소스 폴더에서 15%가 빠졌다)
   *
   * 이제 끝까지 훑는다. 대신 아주 큰 폴더에서 패널이 멈추지 않도록
   * 조금씩 나눠 읽고, 읽는 동안 몇 개까지 읽었는지 보여준다.
   * 한 번 읽은 폴더는 기억해 두었다가 다시 들어오면 바로 보여준다.
   */
  FilesTab.prototype.load = function (force) {
    var self = this;

    if (!fs || !path) { this.grid.message('이 환경에서는 파일을 읽을 수 없습니다.'); return; }
    if (!this.dir) { this.grid.message('위의 <b>[폴더 선택]</b> 을 눌러 폴더를 골라주세요.'); return; }

    this.pathBox.textContent = Eddie.ui.prettyName(this.dir);
    this.upBtn.disabled = (path.dirname(this.dir) === this.dir);
    this.renderFavs();

    // 이미 읽어둔 폴더면 바로 보여준다
    var key = this.dir + '|' + (this.deep ? 'deep' : 'flat');
    if (!force && CACHE[key]) {
      this.entries = CACHE[key].entries;
      this.truncated = CACHE[key].truncated;
      this.render();
      return;
    }

    this.scanId = (this.scanId || 0) + 1;
    var myScan = this.scanId;

    var out = [];
    var truncated = false;
    var queue = [{ dir: this.dir, depth: 0 }];

    this.grid.message('폴더를 읽는 중…');

    function step() {
      if (self.scanId !== myScan) return;              // 그 사이 다른 폴더로 옮겼다

      var until = Date.now() + 40;                     // 한 번에 40ms 만 일한다
      while (queue.length && Date.now() < until) {
        var job = queue.shift();
        var names;
        try { names = fs.readdirSync(job.dir); }
        catch (e) { continue; }

        for (var i = 0; i < names.length; i++) {
          if (out.length >= MAX_FILES) { truncated = true; queue.length = 0; break; }

          var name = names[i];
          if (name.charAt(0) === '.') continue;

          var full = path.join(job.dir, name);
          var st;
          try { st = fs.statSync(full); } catch (e) { continue; }

          // 맥은 파일 이름을 "ㄷ ㅡ ㅇ" 처럼 쪼개서(NFD) 돌려준다.
          // 키보드로 친 검색어는 합쳐진 형태(NFC)라 그대로 비교하면 영영 안 맞는다.
          // 이름만 NFC 로 맞추고, 경로(full)는 파일을 열어야 하므로 원본 그대로 둔다.
          var shown = Eddie.ui.prettyName(name);

          if (st.isDirectory()) {
            if (job.depth === 0) {
              out.push({ isDir: true, name: shown, fullPath: full, mtime: st.mtimeMs, size: 0 });
            }
            if (self.deep) queue.push({ dir: full, depth: job.depth + 1 });   // 깊이 제한 없음
            continue;
          }

          var k = kindOfFile(name);
          if (!k) continue;
          out.push({ isDir: false, name: shown, fullPath: full, kind: k,
                     size: st.size, mtime: st.mtimeMs });
        }
      }

      if (queue.length) {
        self.grid.message('폴더를 읽는 중… ' + out.length + '개');
        setTimeout(step, 0);                            // 화면이 멈추지 않게 잠깐 넘겨준다
        return;
      }

      self.entries = out;
      self.truncated = truncated;
      CACHE[key] = { entries: out, truncated: truncated };
      self.render();
    }

    setTimeout(step, 10);
  };

  // ---------------- 그리기 ----------------
  /**
   * 폴더 하나의 바로 아래 항목만 읽는다 (하위 폴더 속까지는 안 들어간다).
   * 한 번 읽으면 기억해 두고 다시 읽지 않는다.
   */
  FilesTab.prototype.readOne = function (dir) {
    if (this.childCache[dir]) return this.childCache[dir];

    var out = [];
    var names;
    try { names = fs.readdirSync(dir); }
    catch (e) { this.childCache[dir] = out; return out; }

    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (name.charAt(0) === '.') continue;

      var full = path.join(dir, name);
      var st;
      try { st = fs.statSync(full); } catch (e) { continue; }

      // 맥은 파일 이름을 쪼개서(NFD) 돌려준다 → 합쳐진 형태로 맞춘다
      var shown = Eddie.ui.prettyName(name);

      if (st.isDirectory()) {
        out.push({ isDir: true, name: shown, fullPath: full, mtime: st.mtimeMs, size: 0 });
        continue;
      }
      var k = kindOfFile(name);
      if (!k) continue;
      out.push({ isDir: false, name: shown, fullPath: full, kind: k,
                 size: st.size, mtime: st.mtimeMs });
    }

    this.childCache[dir] = out;
    return out;
  };

  /**
   * 화면에 보일 목록을 만든다.
   *
   * 펼쳐 놓은 폴더는 바로 아래에 그 폴더의 내용을 끼워 넣는다.
   * 프로젝트 패널에서 폴더를 펼치는 것과 같은 모습.
   */
  FilesTab.prototype.visibleTree = function () {
    var self = this;
    var out = [];

    function add(dir, depth) {
      var kids = self.readOne(dir).slice();
      kids.sort(function (a, b) { return self.compare(a, b); });

      for (var i = 0; i < kids.length; i++) {
        var e = kids[i];
        var row = {};
        for (var k in e) if (e.hasOwnProperty(k)) row[k] = e[k];
        row.depth = depth;
        row.open = !!self.expanded[e.fullPath];
        // 안에 쓸 수 있는 파일이 하나도 없으면 화살표를 숨긴다
        if (e.isDir) row.empty = self.readOne(e.fullPath).length === 0;
        out.push(row);

        if (e.isDir && row.open) add(e.fullPath, depth + 1);
      }
    }

    add(this.dir, 0);
    return out;
  };

  /** 폴더를 펼치거나 접는다 */
  FilesTab.prototype.toggleFolder = function (dir) {
    if (this.expanded[dir]) delete this.expanded[dir];
    else this.expanded[dir] = true;

    // 목록을 통째로 다시 그리면 화면이 맨 위로 튄다.
    // 보고 있던 자리를 그대로 두려고 스크롤 위치를 기억했다가 되돌린다.
    var box = this.grid.root;
    var keep = box ? box.scrollTop : 0;

    this.render();

    if (box) box.scrollTop = keep;

    // 방금 누른 폴더를 계속 고른 상태로 둔다.
    // (스크롤을 되돌린 뒤라 그 카드는 이미 화면 안에 있어 더 움직이지 않는다)
    for (var i = 0; i < this.grid.flat.length; i++) {
      var it = this.grid.flat[i].__item;
      if (it && it.fullPath === dir) { this.grid.select(i); break; }
    }
  };

  /** 정렬 기준 (트리와 검색 결과가 같은 규칙을 쓴다) */
  FilesTab.prototype.compare = function (a, b) {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;     // 폴더가 먼저
    function byName(x, y) { return x.name.localeCompare(y.name, 'ko'); }
    switch (this.sort) {
      case 'name-desc': return byName(b, a);
      case 'kind': {
        var ka = KIND_ORDER[a.kind] || 9, kb = KIND_ORDER[b.kind] || 9;
        if (ka !== kb) return ka - kb;
        return byName(a, b);
      }
      case 'size':     return b.size - a.size;
      case 'size-asc': return a.size - b.size;
      case 'newest':   return b.mtime - a.mtime;
      case 'oldest':   return a.mtime - b.mtime;
      default:         return byName(a, b);
    }
  };

  FilesTab.prototype.render = function () {
    var self = this;
    // 검색어도 같은 형태로 맞춘다 (붙여넣기로 자소분리된 글이 올 수 있다)
    var q = Eddie.ui.prettyName(this.query).toLowerCase();

    var list;
    if (q) {
      // 찾는 중에는 트리를 접어두고, 조건에 맞는 파일만 쭉 보여준다
      list = this.entries.filter(function (e) {
        if (e.isDir) return false;
        if (self.kind && e.kind !== self.kind) return false;
        return e.name.toLowerCase().indexOf(q) >= 0;
      });
      list.sort(function (a, b2) { return self.compare(a, b2); });
    } else if (this.folderOpen) {
      // 이전 방식: 지금 들어와 있는 폴더의 내용만 평평하게
      list = this.entries.filter(function (e) {
        if (e.isDir) return true;
        return !self.kind || e.kind === self.kind;
      });
      list.sort(function (a, b2) { return self.compare(a, b2); });
    } else {
      // 평소에는 펼쳐 놓은 폴더를 따라 목록을 만든다
      list = this.visibleTree().filter(function (e) {
        if (e.isDir) return true;                      // 폴더는 늘 보인다
        return !self.kind || e.kind === self.kind;
      });
    }

    this.grid.clear();
    this.grid.defineGroup('files', { name: '내 파일' });

    if (!list.length) {
      this.grid.message(this.entries.length
        ? '조건에 맞는 파일이 없습니다.'
        : '이 폴더에는 쓸 수 있는 파일이 없습니다.<br><span class="dim">영상 · 이미지 · 소리 파일만 보여줍니다.</span>');
      return;
    }

    this.grid.add('files', list.map(function (e) { return self.toItem(e); }), true);
    this.grid.setCount('files', list.length + '개' + (this.truncated ? ' · ' + MAX_FILES + '개까지만 읽었어요' : ''));
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

    base.depth = e.depth || 0;                 // 들여쓴 깊이

    if (e.isDir) {
      base.type = 'folder';
      base.open = !!e.open;
      base.empty = !!e.empty;
      // '폴더 열어서 보기' 일 때는 펼치는 화살표가 필요 없다
      base.tree = !this.folderOpen && !e.empty;
      base.tile = 'sq';
      base.thumb = '';
      base.overlayName = Eddie.ui.prettyName(e.name);   // 타일 위에 폴더 이름
      base.sub = this.folderOpen ? '폴더'
               : (e.empty ? '폴더 · 빈 폴더' : (e.open ? '폴더 · 펼침' : '폴더'));
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
