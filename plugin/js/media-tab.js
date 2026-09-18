/*
 * 소스 검색 모듈 - 영상 / 이미지 탭
 * 여러 소스(Pexels · Pixabay)를 한 화면에서 검색하고, 결과는 소스별로 나눠서 보여준다.
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  // 이 사이트들에는 연령 필터가 없다. 대신 검색어에 영어 키워드를 붙여준다.
  var PEOPLE = [
    { ko: '아이',      en: 'child' },
    { ko: '10대',      en: 'teenager' },
    { ko: '20대 여성', en: 'young woman' },
    { ko: '20대 남성', en: 'young man' },
    { ko: '중년',      en: 'middle aged' },
    { ko: '노인',      en: 'senior' },
    { ko: '커플',      en: 'couple' },
    { ko: '가족',      en: 'family' },
    { ko: '직장인',    en: 'office worker' }
  ];

  var ORIENTATION = [
    { v: '',          ko: '방향 전체' },
    { v: 'landscape', ko: '가로' },
    { v: 'portrait',  ko: '세로' },
    { v: 'square',    ko: '정사각' }
  ];

  var SIZE_VIDEO = [
    { v: '',       ko: '크기 전체' },
    { v: 'large',  ko: '4K 이상' },
    { v: 'medium', ko: 'FHD 이상' },
    { v: 'small',  ko: 'HD 이상' }
  ];

  var SIZE_IMAGE = [
    { v: '',       ko: '크기 전체' },
    { v: 'large',  ko: '큰 사진' },
    { v: 'medium', ko: '보통' },
    { v: 'small',  ko: '작은 사진' }
  ];

  // fps 검색 파라미터를 주는 사이트가 없어서, 받아온 결과에서 걸러낸다.
  var FPS = [
    { v: '',     ko: 'fps 전체' },
    { v: '24',   ko: '24fps (영화)',           min: 23.4, max: 24.6 },
    { v: '25',   ko: '25fps (PAL)',            min: 24.6, max: 25.4 },
    { v: '30',   ko: '30fps',                  min: 29.0, max: 30.6 },
    { v: '50',   ko: '50fps',                  min: 49.0, max: 50.6 },
    { v: '60',   ko: '60fps',                  min: 59.0, max: 60.6 },
    { v: 'high', ko: '50fps 이상 (슬로우모션)', min: 49.0, max: 1000 }
  ];

  var COLORS = [
    { v: '',            ko: '색상 전체' },
    { v: 'red',         ko: '빨강' },   { v: 'orange',      ko: '주황' },
    { v: 'yellow',      ko: '노랑' },   { v: 'green',       ko: '초록' },
    { v: 'turquoise',   ko: '청록' },   { v: 'blue',        ko: '파랑' },
    { v: 'violet',      ko: '보라' },   { v: 'pink',        ko: '분홍' },
    { v: 'brown',       ko: '갈색' },   { v: 'black',       ko: '검정' },
    { v: 'gray',        ko: '회색' },   { v: 'white',       ko: '흰색' },
    { v: 'transparent', ko: '투명 (Pixabay만)' },
    { v: 'grayscale',   ko: '흑백 (Pixabay만)' }
  ];

  var CATEGORY = [
    { v: '',               ko: '카테고리 전체' },
    { v: 'people',         ko: '사람' },       { v: 'nature',    ko: '자연' },
    { v: 'business',       ko: '비즈니스' },   { v: 'travel',    ko: '여행' },
    { v: 'food',           ko: '음식' },       { v: 'animals',   ko: '동물' },
    { v: 'places',         ko: '장소' },       { v: 'buildings', ko: '건물' },
    { v: 'backgrounds',    ko: '배경' },       { v: 'fashion',   ko: '패션' },
    { v: 'science',        ko: '과학' },       { v: 'education', ko: '교육' },
    { v: 'feelings',       ko: '감정' },       { v: 'health',    ko: '건강' },
    { v: 'religion',       ko: '종교' },       { v: 'industry',  ko: '산업' },
    { v: 'computer',       ko: '컴퓨터' },     { v: 'sports',    ko: '스포츠' },
    { v: 'transportation', ko: '교통' },       { v: 'music',     ko: '음악' }
  ];

  var IMAGE_TYPE = [
    { v: '',             ko: '사진/그림 전체' },
    { v: 'photo',        ko: '사진' },
    { v: 'illustration', ko: '일러스트' },
    { v: 'vector',       ko: '벡터' }
  ];

  var VIDEO_TYPE = [
    { v: '',          ko: '영상 종류 전체' },
    { v: 'film',      ko: '실사' },
    { v: 'animation', ko: '애니메이션' }
  ];

  var ORDER = [
    { v: '',       ko: '인기순' },
    { v: 'latest', ko: '최신순' }
  ];

  function fpsRange(v) {
    for (var i = 0; i < FPS.length; i++) if (FPS[i].v === v && v) return FPS[i];
    return null;
  }

  function matchFps(item, range) {
    if (!range) return true;
    var fs = item.files || [];
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i].fps;
      if (f && f >= range.min && f <= range.max) return true;
    }
    return false;
  }

  // ==================================================================
  function MediaTab(kind) {              // kind: 'video' | 'image'
    this.kind = kind;
    this.query = '';
    this.people = [];
    this.timer = null;
    this.filters = {
      orientation: '', size: '', color: '', fps: '',
      category: '', imageType: '', videoType: '', order: '',
      editorsChoice: false, safesearch: true
    };
    this.mode = localStorage.getItem('eddieDrop.ss.mode.' + kind) || 'pexels';
    this.state = {};
    this.recentKey = 'eddieDrop.ss.recent.' + kind;
  }

  MediaTab.prototype.ui = function () { return Eddie.ui; };

  /** 지금 검색할 소스들 (검색 기능이 준비된 것만) */
  MediaTab.prototype.sources = function () {
    var ids = (this.mode === 'both') ? ['pexels', 'pixabay'] : [this.mode];
    return ids.filter(function (id) {
      var a = SS.adapters[id];
      return a && typeof a.search === 'function';
    });
  };

  // ==================================================================
  // 화면 만들기
  // ==================================================================
  MediaTab.prototype.mount = function (view) {
    var self = this;
    var ui = this.ui();
    var el = ui.el;

    view.classList.add('media-view');
    view.innerHTML = '';

    var bar = el('div', 'searchbar');

    // --- 소스 토글 ---
    var pills = el('div', 'pills');
    [['pexels', 'Pexels'], ['pixabay', 'Pixabay'], ['both', '둘 다']].forEach(function (s) {
      var b = el('button', 'pill' + (self.mode === s[0] ? ' active' : ''), s[1]);
      b.addEventListener('click', function () {
        pills.querySelectorAll('.pill').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        self.mode = s[0];
        localStorage.setItem('eddieDrop.ss.mode.' + self.kind, s[0]);
        self.renderFilters();
        self.search(true);
      });
      pills.appendChild(b);
    });
    bar.appendChild(pills);

    // --- 검색창 ---
    var row = el('div', 'row');
    this.input = el('input', 'grow');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.placeholder = (this.kind === 'video')
      ? '영상 검색 (예: 바다, coffee)'
      : '이미지 검색 (예: 사무실, sunset)';
    this.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        clearTimeout(self.timer);
        self.search(true);              // 결과가 오면 포커스를 결과로 넘긴다
      }
    });
    this.input.addEventListener('input', function () {
      clearTimeout(self.timer);
      self.timer = setTimeout(function () { self.search(true); }, 700);   // API 한도 절약
    });
    row.appendChild(this.input);
    row.appendChild(ui.button('btn primary', '검색', function () {
      clearTimeout(self.timer);
      self.search(true);
    }));
    bar.appendChild(row);

    // --- 최근 검색어 ---
    this.recentBox = el('div', 'chips recent');
    bar.appendChild(this.recentBox);

    // --- 인물 빠른 태그 ---
    var det = el('details', 'people');
    det.appendChild(el('summary', null, '인물 빠른 태그'));
    var pc = el('div', 'chips');
    PEOPLE.forEach(function (p) {
      var c = el('button', 'chip', p.ko);
      c.title = '검색어에 "' + p.en + '" 를 붙입니다';
      c.addEventListener('click', function () {
        var i = self.people.indexOf(p.en);
        if (i >= 0) { self.people.splice(i, 1); c.classList.remove('on'); }
        else { self.people.push(p.en); c.classList.add('on'); }
        self.search(true);
      });
      pc.appendChild(c);
    });
    det.appendChild(pc);
    det.appendChild(el('p', 'hint', '이 사이트들에는 나이 필터가 없어서, 누르면 검색어에 영어 키워드를 붙여줍니다.'));
    bar.appendChild(det);

    // --- 필터 (소스에 따라 다시 그려진다) ---
    this.filterBox = el('div', 'filterbox');
    bar.appendChild(this.filterBox);

    // --- 썸네일 크기 ---
    var sz = el('div', 'row size-row');
    sz.appendChild(el('span', 'hint', '썸네일'));
    var range = el('input', 'grow');
    range.type = 'range'; range.min = 100; range.max = 340; range.step = 10;
    range.value = localStorage.getItem('eddieDrop.ss.thumb.' + this.kind) || 160;
    range.addEventListener('input', function () {
      self.grid.setThumbSize(parseInt(range.value, 10));
      localStorage.setItem('eddieDrop.ss.thumb.' + self.kind, range.value);
    });
    sz.appendChild(range);
    bar.appendChild(sz);

    bar.appendChild(el('p', 'hint howto',
      '클릭 = 고르기 · <b>Tab</b> 다음 · <b>Shift+Tab</b> 이전 · <b>더블클릭</b> = 소스 모니터 · <b>,</b> 삽입 · <b>.</b> 덮어쓰기'));

    view.appendChild(bar);

    // --- 결과 ---
    var results = el('div');
    view.appendChild(results);

    this.grid = new Eddie.Grid(results, {
      thumbSize: parseInt(range.value, 10),
      onSelect: function (item) {
        // 미리 받아서 프로젝트에 넣어둔다 → , 를 눌렀을 때 포커스가 안 흔들린다
        Eddie.premiere.preload({
          item: item,
          file: self.fileFor(item),
          query: self.query,
          grid: self.grid,
          binName: (Sources.adapters[item.source] || {}).name
        });
      },
      onActivate: function (item) { self.place(item, 'none'); },
      onPlace: function (item, mode) { self.place(item, mode); },
      onDragged: function (item) {
        Eddie.premiere.afterDrop(item, { binName: (Sources.adapters[item.source] || {}).name });
      },
      onDragPrepare: function (item, silent) {
        if (!silent) Eddie.ui.toast('파일을 받는 중이에요 — 다 받으면 끌어놓을 수 있어요');
        Eddie.premiere.fetchOnly({
          item: item,
          file: self.fileFor(item),
          query: self.query,
          grid: self.grid
        }).then(function () {
          if (!silent) Eddie.ui.toast('준비 완료 — 이제 끌어놓으세요');
        }).catch(function () {});
      }
    });

    Object.keys(SS.adapters).forEach(function (id) {
      var a = SS.adapters[id];
      self.grid.defineGroup(id, { name: a.name, url: a.url });
    });

    this.renderFilters();
    this.renderRecent();
    this.grid.message('검색어를 입력해 보세요.<br><span class="dim">예) 바다, 도시 야경, coffee</span>');
  };

  // ==================================================================
  // 필터
  // ==================================================================
  MediaTab.prototype.renderFilters = function () {
    var self = this;
    var ui = this.ui();
    var el = ui.el;
    var box = this.filterBox;
    var isVideo = (this.kind === 'video');
    var srcs = this.sources();
    var hasPixabay = srcs.indexOf('pixabay') >= 0;
    var hasPexels  = srcs.indexOf('pexels') >= 0;

    box.innerHTML = '';

    /**
     * opts: { disabled, why, disabledValues: [] }
     * 지원하지 않는 필터는 아예 못 고르게 막고 이유를 툴팁으로 보여준다.
     */
    function put(parent, options, prop, opts) {
      opts = opts || {};

      var list = options.map(function (o) {
        var off = opts.disabledValues && opts.disabledValues.indexOf(o.v) >= 0;
        return off ? { v: o.v, ko: o.ko + ' — 지원 안 함', disabled: true } : o;
      });

      var sel = ui.select('', list, function () {
        self.filters[prop] = sel.value;
        self.search(true);
      });

      // 못 쓰는 값이 남아 있으면 비워준다
      if (opts.disabled || (opts.disabledValues && opts.disabledValues.indexOf(self.filters[prop]) >= 0)) {
        self.filters[prop] = '';
      }
      sel.value = self.filters[prop];

      if (opts.disabled) {
        sel.disabled = true;
        sel.classList.add('off');
        sel.title = opts.why || '이 소스는 지원하지 않아요';
      }
      parent.appendChild(sel);
      return sel;
    }

    // ---- 공통 줄 ----
    var f = el('div', 'filters');

    // 방향: Pixabay 영상에는 방향 파라미터가 없다
    var orientOff = isVideo && hasPixabay && !hasPexels;
    put(f, ORIENTATION, 'orientation', {
      disabled: orientOff,
      why: 'Pixabay 영상은 방향 필터를 지원하지 않아요',
      disabledValues: (!isVideo && hasPixabay && !hasPexels) ? ['square'] : []   // Pixabay 이미지에 정사각 없음
    });

    put(f, isVideo ? SIZE_VIDEO : SIZE_IMAGE, 'size');

    if (isVideo) {
      // fps: Pexels 응답에만 fps 가 있다
      put(f, FPS, 'fps', {
        disabled: !hasPexels,
        why: 'Pixabay는 fps 정보를 주지 않아 쓸 수 없어요'
      });
    } else {
      // 투명·흑백은 Pixabay 에만 있다
      put(f, COLORS, 'color', {
        disabledValues: hasPixabay ? [] : ['transparent', 'grayscale']
      });
    }
    box.appendChild(f);

    // ---- Pixabay 전용 줄 ----
    if (hasPixabay) {
      var f2 = el('div', 'filters');
      put(f2, CATEGORY, 'category');
      put(f2, isVideo ? VIDEO_TYPE : IMAGE_TYPE, isVideo ? 'videoType' : 'imageType');
      put(f2, ORDER, 'order');
      box.appendChild(f2);

      var f3 = el('div', 'filter-checks');
      f3.appendChild(checkbox('에디터 추천만', 'editorsChoice'));
      f3.appendChild(checkbox('안전 검색', 'safesearch'));
      box.appendChild(f3);

      box.appendChild(el('p', 'hint', '둘째 줄부터는 Pixabay 전용 필터입니다.'));
    }

    function checkbox(label, prop) {
      var lab = el('label', 'check mini');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!self.filters[prop];
      cb.addEventListener('change', function () {
        self.filters[prop] = cb.checked;
        self.search(true);
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, label));
      return lab;
    }

    // ---- "둘 다" 일 때만 생기는 안내 ----
    var warns = [];
    if (hasPexels && hasPixabay) {
      if (isVideo && this.filters.fps) warns.push('fps 필터는 Pexels 결과에만 적용됩니다.');
      if (isVideo && this.filters.orientation) warns.push('방향은 Pexels 영상에만 적용됩니다.');
      if (!isVideo && this.filters.orientation === 'square') warns.push('정사각은 Pexels 에만 있습니다.');
      if (this.filters.category) warns.push('카테고리는 Pixabay 에만 적용됩니다.');
      if (this.filters.order) warns.push('정렬은 Pixabay 에만 적용됩니다.');
    }
    if (warns.length) box.appendChild(el('p', 'hint fps-note', warns.join(' · ')));
  };

  // ==================================================================
  // 최근 검색어
  // ==================================================================
  MediaTab.prototype.recent = function () {
    try { return JSON.parse(localStorage.getItem(this.recentKey) || '[]'); }
    catch (e) { return []; }
  };

  MediaTab.prototype.pushRecent = function (q) {
    if (!q) return;
    var list = this.recent().filter(function (x) { return x !== q; });
    list.unshift(q);
    localStorage.setItem(this.recentKey, JSON.stringify(list.slice(0, 5)));
    this.renderRecent();
  };

  MediaTab.prototype.renderRecent = function () {
    var self = this;
    var el = this.ui().el;
    this.recentBox.innerHTML = '';
    this.recent().forEach(function (q) {
      var c = el('button', 'chip', q);
      c.addEventListener('click', function () { self.input.value = q; self.search(true); });
      self.recentBox.appendChild(c);
    });
  };

  // ==================================================================
  // 검색
  // ==================================================================
  MediaTab.prototype.buildQuery = function () {
    var q = this.input.value.trim();
    if (this.people.length) q = (q + ' ' + this.people.join(' ')).trim();
    return q;
  };

  MediaTab.prototype.paramsFor = function (src) {
    var st = this.state[src];
    var p = {
      query: this.query,
      page: st.page,
      perPage: (this.kind === 'video') ? 24 : 30,
      orientation: this.filters.orientation,
      size: this.filters.size,
      color: this.kind === 'image' ? this.filters.color : '',
      category: this.filters.category,
      imageType: this.filters.imageType,
      videoType: this.filters.videoType,
      order: this.filters.order,
      editorsChoice: this.filters.editorsChoice,
      safesearch: this.filters.safesearch
    };
    // 인물 칩을 눌렀으면 Pixabay는 사람 카테고리도 같이 걸어준다
    if (src === 'pixabay' && this.people.length && !p.category) p.category = 'people';
    return p;
  };

  MediaTab.prototype.search = function (reset) {
    var self = this;
    var q = this.buildQuery();

    if (!q) {
      this.grid.message('검색어를 입력해 보세요.<br><span class="dim">예) 바다, 도시 야경, coffee</span>');
      return;
    }

    var srcs = this.sources();
    if (!srcs.length) {
      this.grid.message('검색할 수 있는 소스가 없습니다.');
      return;
    }

    // 키가 없는 소스 확인
    var missing = srcs.filter(function (id) { return !Eddie.settings.key(id); });
    if (missing.length === srcs.length) {
      var names = missing.map(function (id) { return SS.adapters[id].name; }).join(' · ');
      this.grid.message('설정 탭에서 ' + names + ' API 키를 넣어주세요.', 'need-key');
      return;
    }

    if (reset) {
      this.query = q;
      this.grid.clear();
      // 소스 구역을 먼저 만들어 두면 응답이 빠른 쪽이 위로 올라가지 않는다
      srcs.forEach(function (src) {
        self.state[src] = { page: 1, autoFill: 0 };
        self.grid.group(src);
        self.grid.setCount(src, '찾는 중…');
        self.grid.setNote(src, '');
      });
      this.pushRecent(this.input.value.trim());
    }

    Eddie.ui.status('검색 중… "' + q + '"');
    srcs.forEach(function (src) { self.runSource(src, reset); });
  };

  MediaTab.prototype.runSource = function (src, reset) {
    var self = this;
    var adapter = SS.adapters[src];
    var st = this.state[src] || (this.state[src] = { page: 1, autoFill: 0 });

    if (st.busy) return;

    if (!Eddie.settings.key(src)) {
      this.grid.setNote(src, '설정 탭에서 ' + adapter.name + ' API 키를 넣어주세요.', 'warn');
      return;
    }

    st.busy = true;
    var range = (this.kind === 'video') ? fpsRange(this.filters.fps) : null;
    var useFps = !!(range && adapter.supports && adapter.supports.fps);

    adapter.search(this.kind, this.paramsFor(src)).then(function (res) {
      st.busy = false;

      var items = res.items || [];
      if (useFps) {
        items = items.filter(function (it) {
          if (!matchFps(it, range)) return false;
          it.__wantFps = range;
          return true;
        });
      }

      if (items.length) self.grid.add(src, items, false);

      var shown = self.grid.countOf(src);

      // fps로 많이 걸러졌으면 다음 페이지를 자동으로 더 가져온다
      if (useFps && shown < 8 && res.hasMore && st.autoFill < 3) {
        st.autoFill++;
        st.page++;
        Eddie.ui.status(adapter.name + ' — 조건에 맞는 영상을 더 찾는 중… (' + shown + '개)');
        self.runSource(src, false);
        return;
      }

      // 안내줄
      var note = '';
      if (range && !useFps) note = adapter.name + '은 fps 정보를 주지 않아 fps 필터가 적용되지 않았습니다.';
      else if (self.kind === 'video' && self.filters.orientation && src === 'pixabay') note = 'Pixabay 영상은 방향 필터가 없어서 전체에서 찾았습니다.';
      self.grid.setNote(src, note, 'warn');

      self.grid.setCount(src, shown
        ? ((res.total ? res.total.toLocaleString() + '개 중 ' : '') + shown + '개')
        : '결과 없음');

      if (self.grid.selected < 0 && shown) self.grid.select(0);

      self.grid.setMoreHandler(src, res.hasMore && shown ? function () {
        st.page++;
        st.autoFill = 0;
        self.runSource(src, false);
      } : null);

      self.reportStatus();

    }).catch(function (e) {
      st.busy = false;
      self.grid.setNote(src, (e.message || String(e)), 'err');
      self.grid.setCount(src, '');
      Eddie.ui.status(adapter.name + ': ' + (e.message || e), 'err');
    });
  };

  MediaTab.prototype.reportStatus = function () {
    var self = this;
    var total = 0;
    this.sources().forEach(function (src) { total += self.grid.countOf(src); });
    if (!total) {
      Eddie.ui.status('결과 없음', 'err');
      return;
    }
    Eddie.ui.status((this.kind === 'video' ? '영상' : '이미지') + ' ' + total + '개', 'ok');
  };

  // ==================================================================
  // 넣기
  // ==================================================================
  MediaTab.prototype.fileFor = function (item) {
    var adapter = SS.adapters[item.source];
    var quality = Eddie.settings.get().quality;
    return adapter && adapter.pickFile ? adapter.pickFile(item, quality) : (item.files || [])[0];
  };

  MediaTab.prototype.place = function (item, mode) {
    Eddie.premiere.run({
      item: item,
      file: this.fileFor(item),
      query: this.query,
      mode: mode,
      grid: this.grid,
      binName: (SS.adapters[item.source] || {}).name
    });
  };

  // ==================================================================
  // 키보드
  // ==================================================================
  MediaTab.prototype.focusResults = function () {
    if (this.grid) this.grid.focus();
  };

  MediaTab.prototype.handleKey = function (e, name) {
    var g = this.grid;
    if (!g) return;
    name = name || Eddie.ui.keyName(e);

    if (name === 'tab')   { g.step(e.shiftKey ? -1 : 1); e.preventDefault(); return; }
    if (name === 'left')  { g.move('left');  e.preventDefault(); return; }
    if (name === 'right') { g.move('right'); e.preventDefault(); return; }
    if (name === 'up')    { g.move('up');    e.preventDefault(); return; }
    if (name === 'down')  { g.move('down');  e.preventDefault(); return; }
    if (name === 'space') { g.togglePreview(); e.preventDefault(); return; }

    var item = g.selectedItem();
    if (!item) return;

    // Enter 는 쓰지 않는다 (프리미어 인/아웃 렌더가 같이 돈다) — 소스 모니터는 더블클릭
    if (name === 'comma')       { this.place(item, 'insert');    e.preventDefault(); }
    else if (name === 'period') { this.place(item, 'overwrite'); e.preventDefault(); }
  };

  SS.MediaTab = MediaTab;

})(window);
