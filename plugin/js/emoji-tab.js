/*
 * Eddie Drop - 이모지 탭
 *
 * 맥·윈도우에 들어 있는 이모지는 애플·MS 것이라 영상에 넣어 배포하면
 * 저작권 문제가 생길 수 있다. 그래서 구글이 만든 Noto Color Emoji 를 쓴다.
 * 열린 라이선스(SIL OFL)라 영상에 넣어 수익화해도 자유롭고, 출처 표기도 필요 없다.
 *
 * 폰트는 처음 탭을 열 때 한 번만 받아서 설정 폴더에 둔다.
 * (업데이트 파일에 5.5MB 를 매번 넣지 않으려는 것)
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var fs   = (typeof require === 'function') ? require('fs') : null;
  var path = (typeof require === 'function') ? require('path') : null;

  var FONT_URL  = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-color-emoji/files/noto-color-emoji-emoji-400-normal.woff2';
  var FONT_NAME = 'EddieNotoEmoji';
  var SIZE = 512;                 // 만들어 넣을 그림 크기
  var PAGE = 180;                 // 한 번에 보여줄 개수

  var fontReady = null;           // 폰트 준비 약속 (한 번만 한다)

  function fontFile() {
    return path.join(Eddie.platform.appSupportDir(), 'fonts', 'NotoColorEmoji.woff2');
  }

  /** 폰트를 받아서 패널에 올린다 (이미 있으면 바로) */
  function ensureFont(onProgress) {
    if (fontReady) return fontReady;

    fontReady = new Promise(function (resolve, reject) {
      if (!fs || !path) { reject(new Error('이 환경에서는 쓸 수 없습니다.')); return; }

      var file = fontFile();
      var have = false;
      try { have = fs.statSync(file).size > 1000000; } catch (e) {}

      var step = have ? Promise.resolve() : (function () {
        onProgress && onProgress('이모지 그림을 받는 중…');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        return Eddie.download.download({
          url: FONT_URL,
          destPath: file,
          onProgress: function (got, total) {
            if (total && onProgress) {
              onProgress('이모지 그림을 받는 중… ' + Math.round(got / total * 100) + '%');
            }
          }
        });
      })();

      step.then(function () {
        var f = new FontFace(FONT_NAME, 'url(' + Eddie.platform.fileUrl(file) + ')');
        return f.load().then(function (loaded) {
          document.fonts.add(loaded);
        });
      }).then(resolve).catch(function (e) {
        fontReady = null;                      // 다음에 다시 해볼 수 있게
        reject(e);
      });
    });

    return fontReady;
  }

  /** 이모지 하나를 투명 배경 PNG 로 만들어 저장한다 → 파일 경로 */
  function makePng(ch, name) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    var c = cv.getContext('2d');
    c.clearRect(0, 0, SIZE, SIZE);
    c.font = Math.round(SIZE * 0.82) + 'px "' + FONT_NAME + '"';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ch, SIZE / 2, SIZE / 2 + SIZE * 0.04);

    var dir = path.join(Eddie.settings.get().downloadDir, 'Emoji');
    fs.mkdirSync(dir, { recursive: true });

    var codes = [];
    for (var i = 0; i < ch.length; i++) {
      var cp = ch.codePointAt(i);
      if (cp > 0xFFFF) i++;
      if (cp !== 0xFE0F) codes.push(cp.toString(16));
    }
    var file = path.join(dir, 'emoji_' + codes.join('-') + '_' +
                              Eddie.download.safeName(name) + '.png');

    if (Eddie.download.exists(file)) return file;

    var b64 = cv.toDataURL('image/png').split(',')[1];
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    return file;
  }

  // ══════════════════════════════════════════════════════════
  function EmojiTab() {
    this.query = '';
    this.group = '';
    this.tone = 0;                 // 0 = 기본
    this.shown = PAGE;
  }

  EmojiTab.prototype.mount = function (view) {
    var self = this;
    var ui = Eddie.ui, el = ui.el;
    this.view = view;
    view.innerHTML = '';

    var bar = el('div', 'searchbar');

    // --- 검색 ---
    var row = el('div', 'row keep');
    this.input = el('input', 'grow');
    this.input.type = 'text';
    this.input.placeholder = '이모지 검색 (예: 웃음, 하트, fire)';
    this.input.addEventListener('input', function () {
      clearTimeout(self.timer);
      self.timer = setTimeout(function () {
        self.query = self.input.value.trim();
        self.shown = PAGE;
        self.render();
      }, 200);
    });
    row.appendChild(this.input);
    bar.appendChild(row);

    // --- 피부톤 ---
    var trow = el('div', 'row tone-row');
    trow.appendChild(el('span', 'hint', '피부톤'));
    var SAMPLE = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];
    EmojiData.tones.forEach(function (label, i) {
      var b = el('button', 'tone' + (i === self.tone ? ' active' : ''), SAMPLE[i]);
      b.title = label;
      b.addEventListener('click', function () {
        self.tone = i;
        trow.querySelectorAll('.tone').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        self.render();
      });
      trow.appendChild(b);
    });
    bar.appendChild(trow);

    // --- 분류 ---
    var chips = el('div', 'chips');
    function chip(label, value) {
      var b = el('button', 'chip' + (value === self.group ? ' active' : ''), label);
      b.addEventListener('click', function () {
        self.group = value;
        self.shown = PAGE;
        chips.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        self.render();
      });
      chips.appendChild(b);
    }
    chip('전체', '');
    EmojiData.groups.forEach(function (g) { chip(g, g); });
    bar.appendChild(chips);

    // --- 크기 조절 ---
    var sz = el('div', 'row size-row');
    sz.appendChild(el('span', 'hint', '크기'));
    var range = el('input', 'grow');
    range.type = 'range'; range.min = 64; range.max = 200; range.step = 8;
    range.value = localStorage.getItem('eddieDrop.emoji.size') || 96;
    range.addEventListener('input', function () {
      self.grid.setThumbSize(parseInt(range.value, 10));
      localStorage.setItem('eddieDrop.emoji.size', range.value);
    });
    sz.appendChild(range);
    bar.appendChild(sz);

    bar.appendChild(el('p', 'hint howto',
      '클릭 = 고르기 · <b>Tab</b> 다음 · <b>,</b> 삽입 · <b>.</b> 덮어쓰기 · 끌어놓기도 됩니다'));

    view.appendChild(bar);
    view.appendChild(Eddie.ui.splitter(bar, 'emoji'));

    // --- 결과 ---
    var results = el('div');
    view.appendChild(results);

    this.grid = new Eddie.Grid(results, {
      thumbSize: parseInt(range.value, 10),
      onPlace: function (item, mode) { self.place(item, mode); },
      onActivate: function (item) { self.place(item, 'none'); },
      onDragged: function (item) { Eddie.premiere.afterDrop(item, { binName: '이모지' }); },
      onDragPrepare: function (item, silent) {
        if (!silent) Eddie.ui.toast('그림을 만드는 중이에요 — 잠시만요');
        self.prepare(item).then(function () {
          if (!silent) Eddie.ui.toast('준비 완료 — 이제 끌어놓으세요');
        });
      }
    });
    this.grid.defineGroup('emoji', { name: '이모지' });

    this.grid.message('이모지 그림을 준비하는 중…');
    ensureFont(function (msg) { self.grid.message(msg); })
      .then(function () { self.render(); })
      .catch(function (e) {
        self.grid.message('이모지 그림을 받지 못했습니다.<br>' +
          '<span class="dim">' + (e.message || e) + '</span><br>' +
          '<span class="dim">인터넷 연결을 확인하고 탭을 다시 열어주세요.</span>');
      });
  };

  /** 지금 고른 피부톤을 입힌 글자 */
  EmojiTab.prototype.charOf = function (e) {
    if (this.tone > 0 && e.t) return e.t[this.tone - 1];
    return e.c;
  };

  EmojiTab.prototype.match = function (e, q) {
    if (!q) return true;
    if (e.n && e.n.toLowerCase().indexOf(q) >= 0) return true;
    for (var i = 0; i < (e.k || []).length; i++) {
      if (e.k[i].toLowerCase().indexOf(q) >= 0) return true;
    }
    return e.c.indexOf(q) >= 0;
  };

  EmojiTab.prototype.render = function () {
    var self = this;
    var q = Eddie.ui.prettyName(this.query).toLowerCase();

    var list = EmojiData.list.filter(function (e) {
      if (self.group && e.g !== self.group) return false;
      return self.match(e, q);
    });

    this.grid.clear();
    this.grid.defineGroup('emoji', { name: '이모지' });

    if (!list.length) {
      this.grid.message('찾는 이모지가 없습니다.<br>' +
        '<span class="dim">다른 말로 찾아보세요. 예) 웃음, 하트, 불</span>');
      return;
    }

    var page = list.slice(0, this.shown);
    this.grid.add('emoji', page.map(function (e) { return self.toItem(e); }), true);
    this.grid.setCount('emoji', list.length + '개');

    this.grid.setMoreHandler('emoji', list.length > this.shown ? function () {
      self.shown += PAGE;
      self.render();
    } : null);
    if (this.grid.selected < 0) this.grid.select(0);
  };

  EmojiTab.prototype.toItem = function (e) {
    var ch = this.charOf(e);
    return {
      source: 'emoji',
      sourceName: '이모지',
      type: 'emoji',
      tile: 'sq',
      fit: 'contain',
      alpha: true,
      id: ch,
      title: e.n,
      emoji: ch,
      author: { name: '', url: '' },
      files: [{ emoji: ch, ext: 'png' }],
      ext: 'png'
    };
  };

  /** 그림을 만들어 둔다 (끌어놓기·삽입 전에) */
  EmojiTab.prototype.prepare = function (item) {
    return new Promise(function (resolve, reject) {
      try {
        if (item.__path && Eddie.download.exists(item.__path)) { resolve(item.__path); return; }
        item.__path = makePng(item.emoji, item.title);
        resolve(item.__path);
      } catch (e) { reject(e); }
    });
  };

  EmojiTab.prototype.place = function (item, mode) {
    var self = this;
    this.prepare(item).then(function (file) {
      Eddie.premiere.run({
        item: item,
        file: { localPath: file, ext: 'png' },
        query: self.query || '이모지',
        mode: mode,
        grid: self.grid,
        binName: '이모지'
      });
    }).catch(function (e) {
      Eddie.ui.toast('이모지를 만들지 못했습니다: ' + (e.message || e));
    });
  };

  EmojiTab.prototype.handleKey = function (e, name) {
    var g = this.grid;
    if (name === 'tab') { g.move(e.shiftKey ? 'left' : 'right'); e.preventDefault(); return; }
    if (name === 'left')  { g.move('left');  e.preventDefault(); return; }
    if (name === 'right') { g.move('right'); e.preventDefault(); return; }
    if (name === 'up')    { g.move('up');    e.preventDefault(); return; }
    if (name === 'down')  { g.move('down');  e.preventDefault(); return; }

    var item = g.selectedItem();
    if (!item) return;
    if (name === 'comma')  { this.place(item, 'insert'); e.preventDefault(); }
    if (name === 'period') { this.place(item, 'overwrite'); e.preventDefault(); }
  };

  EmojiTab.prototype.focusResults = function () { Eddie.ui.repin(); };

  SS.EmojiTab = EmojiTab;

})(window);
