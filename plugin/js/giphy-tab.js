/*
 * 소스 검색 모듈 - GIF / 스티커 탭 (GIPHY)
 * 약관상 "Powered by GIPHY" 를 눈에 띄게 표기하고,
 * GIPHY 결과는 다른 사이트 결과와 섞지 않는다(탭이 따로인 이유).
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var RATING = [
    { v: 'g',     ko: '전체 이용가 (G)' },
    { v: 'pg',    ko: '가벼운 수위 (PG)' },
    { v: 'pg-13', ko: '중간 수위 (PG-13)' },
    { v: 'r',     ko: '높은 수위 (R)' }
  ];

  // 자주 쓰는 반응 짤 빠른 검색 (한글 라벨 → 영어 검색어)
  var QUICK_GIF = [
    { ko: '웃음',   en: 'laughing' },   { ko: '박수',   en: 'applause' },
    { ko: '놀람',   en: 'shocked' },    { ko: '슬픔',   en: 'crying' },
    { ko: '화남',   en: 'angry' },      { ko: '좋아요', en: 'thumbs up' },
    { ko: '생각',   en: 'thinking' },   { ko: '축하',   en: 'celebrate' },
    { ko: '당황',   en: 'awkward' },    { ko: '하트',   en: 'heart' }
  ];

  var QUICK_STICKER = [
    { ko: '하트',   en: 'heart' },      { ko: '반짝',   en: 'sparkle' },
    { ko: '화살표', en: 'arrow' },      { ko: '말풍선', en: 'speech bubble' },
    { ko: '별',     en: 'star' },       { ko: '불',     en: 'fire' },
    { ko: '체크',   en: 'check mark' }, { ko: '느낌표', en: 'exclamation' },
    { ko: '폭죽',   en: 'confetti' },   { ko: '이모지', en: 'emoji' }
  ];

  // ==================================================================
  function GiphyTab(kind) {            // kind: 'gif' | 'sticker'
    this.kind = kind;
    this.query = '';
    this.offset = 0;
    this.timer = null;
    this.busy = false;
    this.rating = localStorage.getItem('eddieDrop.giphy.rating') || 'g';
    this.recentKey = 'eddieDrop.giphy.recent.' + kind;
  }

  GiphyTab.prototype.mount = function (view) {
    var self = this;
    var ui = Eddie.ui;
    var el = ui.el;
    var isSticker = (this.kind === 'sticker');

    view.classList.add('media-view');
    view.innerHTML = '';

    var bar = el('div', 'searchbar');

    // --- 검색창 ---
    var row = el('div', 'row');
    this.input = el('input', 'grow');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.placeholder = isSticker ? '스티커 검색 (예: 하트, fire)' : 'GIF 검색 (예: 웃음, applause)';
    this.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        clearTimeout(self.timer);
        self.search(true);              // 결과가 오면 포커스를 결과로 넘긴다
      }
    });
    this.input.addEventListener('input', function () {
      clearTimeout(self.timer);
      self.timer = setTimeout(function () { self.search(true); }, 700);
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

    // --- 빠른 검색 칩 ---
    var quick = el('div', 'chips');
    (isSticker ? QUICK_STICKER : QUICK_GIF).forEach(function (q) {
      var c = el('button', 'chip', q.ko);
      c.title = '"' + q.en + '" 로 검색합니다';
      c.addEventListener('click', function () {
        self.input.value = q.en;
        self.search(true);
      });
      quick.appendChild(c);
    });
    bar.appendChild(quick);

    // --- 등급 + 썸네일 크기 ---
    var f = el('div', 'filters');
    var sel = ui.select('', RATING, function () {
      self.rating = sel.value;
      localStorage.setItem('eddieDrop.giphy.rating', sel.value);
      self.search(true);
    });
    sel.value = this.rating;
    f.appendChild(sel);
    bar.appendChild(f);

    var sz = el('div', 'row size-row');
    sz.appendChild(el('span', 'hint', '썸네일'));
    var range = el('input', 'grow');
    range.type = 'range'; range.min = 100; range.max = 340; range.step = 10;
    range.value = localStorage.getItem('eddieDrop.giphy.thumb.' + this.kind) || 150;
    range.addEventListener('input', function () {
      self.grid.setThumbSize(parseInt(range.value, 10));
      localStorage.setItem('eddieDrop.giphy.thumb.' + self.kind, range.value);
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
        Eddie.premiere.preload({
          item: item,
          file: Sources.adapters.giphy.pickFile(item),
          query: self.query,
          grid: self.grid,
          binName: 'GIPHY'
        });
      },
      onActivate: function (item) { self.place(item, 'none'); },
      onPlace: function (item, mode) { self.place(item, mode); },
      onDragPrepare: function (item, silent) {
        if (!silent) Eddie.ui.toast('파일을 받는 중이에요 — 다 받으면 끌어놓을 수 있어요');
        Eddie.premiere.fetchOnly({
          item: item,
          file: SS.adapters.giphy.pickFile(item),
          query: self.query,
          grid: self.grid
        }).then(function () {
          if (!silent) Eddie.ui.toast('준비 완료 — 이제 끌어놓으세요');
        }).catch(function () {});
      }
    });
    this.grid.defineGroup('giphy', { name: 'GIPHY', url: 'https://giphy.com' });

    // --- 약관: Powered by GIPHY (필수 표기) ---
    var foot = el('div', 'giphy-foot');
    var mark = ui.link('Powered by GIPHY', 'https://giphy.com');
    mark.className = 'giphy-mark';
    foot.appendChild(mark);
    if (!isSticker) {
      foot.appendChild(el('span', 'giphy-warn',
        '방송·영화 장면 짤은 저작권이 있을 수 있어요. 수익화 영상에서는 주의하세요.'));
    } else {
      foot.appendChild(el('span', 'giphy-warn',
        '스티커는 투명 배경 GIF로 받습니다.'));
    }
    view.appendChild(foot);

    this.renderRecent();
    this.grid.message(isSticker
      ? '검색어를 입력하거나 위 칩을 눌러보세요.<br><span class="dim">투명 배경 스티커를 찾습니다</span>'
      : '검색어를 입력하거나 위 칩을 눌러보세요.<br><span class="dim">예) 웃음, applause</span>');
  };

  // ---------------- 최근 검색어 ----------------
  GiphyTab.prototype.recent = function () {
    try { return JSON.parse(localStorage.getItem(this.recentKey) || '[]'); }
    catch (e) { return []; }
  };

  GiphyTab.prototype.pushRecent = function (q) {
    if (!q) return;
    var list = this.recent().filter(function (x) { return x !== q; });
    list.unshift(q);
    localStorage.setItem(this.recentKey, JSON.stringify(list.slice(0, 5)));
    this.renderRecent();
  };

  GiphyTab.prototype.renderRecent = function () {
    var self = this;
    var el = Eddie.ui.el;
    this.recentBox.innerHTML = '';
    this.recent().forEach(function (q) {
      var c = el('button', 'chip', q);
      c.addEventListener('click', function () { self.input.value = q; self.search(true); });
      self.recentBox.appendChild(c);
    });
  };

  // ---------------- 검색 ----------------
  GiphyTab.prototype.search = function (reset) {
    var self = this;
    var q = this.input.value.trim();

    if (!q) {
      this.grid.message('검색어를 입력해 보세요.');
      return;
    }
    if (!Eddie.settings.key('giphy')) {
      this.grid.message('설정 탭에서 GIPHY API 키를 넣어주세요.', 'need-key');
      return;
    }
    if (this.busy) return;

    if (reset) {
      this.query = q;
      this.offset = 0;
      this.grid.clear();
      this.grid.group('giphy');
      this.grid.setCount('giphy', '찾는 중…');
      this.pushRecent(q);
    }

    this.busy = true;
    Eddie.ui.status('GIPHY 검색 중… "' + q + '"');

    SS.adapters.giphy.search(this.kind, {
      query: q,
      offset: this.offset,
      limit: 30,
      rating: this.rating
    }).then(function (res) {
      self.busy = false;

      if (res.items.length) self.grid.add('giphy', res.items, false);
      var shown = self.grid.countOf('giphy');

      if (!shown) {
        self.grid.message('결과가 없습니다.<br><span class="dim">영어로 검색하면 결과가 훨씬 많아요.</span>');
        Eddie.ui.status('결과 없음', 'err');
        return;
      }

      if (self.grid.selected < 0 && shown) self.grid.select(0);

      self.grid.setCount('giphy', (res.total ? res.total.toLocaleString() + '개 중 ' : '') + shown + '개');
      self.grid.setMoreHandler('giphy', res.hasMore ? function () {
        self.offset = res.nextOffset;
        self.search(false);
      } : null);

      Eddie.ui.status((self.kind === 'sticker' ? '스티커' : 'GIF') + ' ' + shown + '개', 'ok');

    }).catch(function (e) {
      self.busy = false;
      self.grid.setNote('giphy', (e.message || String(e)), 'err');
      self.grid.setCount('giphy', '');
      Eddie.ui.status(e.message || String(e), 'err');
    });
  };

  // ---------------- 넣기 ----------------
  GiphyTab.prototype.place = function (item, mode) {
    Eddie.premiere.run({
      item: item,
      file: SS.adapters.giphy.pickFile(item),
      query: this.query,
      mode: mode,
      grid: this.grid,
      binName: 'GIPHY'
    });
  };

  // ---------------- 키보드 ----------------
  GiphyTab.prototype.focusResults = function () {
    if (this.grid) this.grid.focus();
  };

  GiphyTab.prototype.handleKey = function (e, name) {
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

    // Enter 는 쓰지 않는다 (프리미어 인/아웃 렌더가 같이 돈다) — 소스 모니터는 더블클릭
    if (name === 'comma')       { this.place(item, 'insert');    e.preventDefault(); }
    else if (name === 'period') { this.place(item, 'overwrite'); e.preventDefault(); }
  };

  SS.GiphyTab = GiphyTab;

})(window);
