/*
 * Eddie Drop - 결과 그리드 (Eddie.Grid)
 * 소스별로 구분해서 카드를 그리고, 미리보기 · 선택 · 삽입 버튼 · 드래그를 담당한다.
 * 어떤 사이트인지는 모른다 — 모듈이 defineGroup 으로 알려준다.
 */
(function (global) {
  'use strict';

  var el, fmtDuration;
  function boot() {
    el = Eddie.ui.el;
    fmtDuration = Eddie.ui.fmtDuration;
  }

  /**
   * opts: { onSelect(item), onActivate(item), onPlace(item, mode), onDragPrepare(item, silent), thumbSize }
   *   onSelect   : 한 번 클릭 (고르기만)
   *   onActivate : 더블클릭 / Enter (소스 모니터에 열기)
   */
  function Grid(container, opts) {
    boot();
    this.root = container;
    this.opts = opts || {};
    this.groups = {};
    this.flat = [];
    this.selected = -1;
    this.thumbSize = this.opts.thumbSize || 160;
    this.root.classList.add('results');
    this.root.style.setProperty('--card', this.thumbSize + 'px');
    // 포커스를 받을 수 있어야 , 와 . 가 프리미어로 새지 않는다
    this.root.tabIndex = -1;
    this.root.style.outline = 'none';
  }

  Grid.prototype.focus = function () {
    Eddie.ui.focusResults(this.root);
  };

  Grid.prototype.setThumbSize = function (px) {
    this.thumbSize = px;
    this.root.style.setProperty('--card', px + 'px');
  };

  Grid.prototype.clear = function () {
    this.root.innerHTML = '';
    this.groups = {};
    this.flat = [];
    this.selected = -1;
  };

  Grid.prototype.message = function (html, cls) {
    this.clear();
    this.root.appendChild(el('div', 'grid-msg ' + (cls || ''), html));
  };

  /** 소스 구역 정보 미리 알려주기. info: { name, url } */
  Grid.prototype.defineGroup = function (key, info) {
    this._info = this._info || {};
    this._info[key] = info;
  };

  Grid.prototype.group = function (key) {
    if (this.groups[key]) return this.groups[key];
    var info = (this._info && this._info[key]) || { name: key, url: null };

    var wrap = el('section', 'src-group');
    var head = el('div', 'src-head');
    head.appendChild(el('span', 'src-name', info.name));
    head.appendChild(el('span', 'src-count'));
    if (info.url) head.appendChild(Eddie.ui.link(info.name + '에서 보기 ↗', info.url)).className = 'src-link';

    var grid = el('div', 'grid');
    var more = el('button', 'btn more', '더 보기');
    more.style.display = 'none';

    wrap.appendChild(head);
    wrap.appendChild(grid);
    wrap.appendChild(more);
    this.root.appendChild(wrap);

    var g = { items: [], wrap: wrap, grid: grid, head: head, more: more, info: info };
    this.groups[key] = g;
    return g;
  };

  Grid.prototype.setMoreHandler = function (key, fn) {
    var g = this.group(key);
    g.more.style.display = fn ? '' : 'none';
    g.more.onclick = fn || null;
  };

  /** 소스 구역 아래에 안내 한 줄 */
  Grid.prototype.setNote = function (key, html, cls) {
    var g = this.group(key);
    if (!g.note) {
      g.note = el('div', 'src-note');
      g.wrap.insertBefore(g.note, g.grid);
    }
    g.note.innerHTML = html || '';
    g.note.className = 'src-note' + (cls ? ' ' + cls : '');
    g.note.style.display = html ? '' : 'none';
  };

  Grid.prototype.setCount = function (key, text) {
    this.group(key).head.querySelector('.src-count').textContent = text || '';
  };

  Grid.prototype.countOf = function (key) {
    return this.groups[key] ? this.groups[key].items.length : 0;
  };

  Grid.prototype.add = function (key, items, replace) {
    var self = this;
    var g = this.group(key);
    if (replace) { g.grid.innerHTML = ''; g.items = []; }
    items.forEach(function (item) {
      g.items.push(item);
      g.grid.appendChild(self.card(item, g));
    });
    this.reindex();
  };

  Grid.prototype.reindex = function () {
    this.flat = Array.prototype.slice.call(this.root.querySelectorAll('.card'));
    this.flat.forEach(function (c, i) { c.dataset.idx = i; });
    if (this.selected >= this.flat.length) this.selected = this.flat.length - 1;
  };

  // ---------------- 카드 ----------------
  Grid.prototype.card = function (item, g) {
    var self = this;
    var card = el('article', 'card');
    card.__item = item;
    item.__card = card;

    // 타일 비율 고정 (세로/가로가 섞여도 그리드가 가지런하게)
    var tile = item.tile || (item.type === 'image' ? 'sq' : 'wide');
    var extra = '';
    if (item.type === 'folder') extra = ' folder-tile';
    else if (item.type === 'audio') extra = ' audio-tile';
    var thumb = el('div', 'thumb ' + tile + (item.alpha ? ' alpha' : '') + extra +
                  ' type-' + (item.type || 'file'));

    var img = el('img');
    img.draggable = false;
    if (item.fit) img.style.objectFit = item.fit;
    img.loading = 'lazy';
    img.alt = '';
    thumb.appendChild(img);

    // 미리보기를 못 만드는 형식(ProRes .mov, .heic 등)은
    // 검은 칸 대신 확장자를 크게 보여준다
    function noPreview() {
      if (thumb.classList.contains('no-preview')) return;
      thumb.classList.add('no-preview');
      var tag = el('span', 'nopre-tag', String(item.ext || '').toUpperCase() || '파일');
      thumb.appendChild(tag);
    }
    if (item.thumb) img.addEventListener('error', noPreview);

    // 핫링크가 금지된 소스(Pixabay)는 썸네일을 먼저 로컬에 받아 쓴다
    if (item.thumbNeedsCache) {
      Eddie.download.cacheThumb(item.source, item.id, item.thumb)
        .then(function (p) { img.src = Eddie.platform.fileUrl(p); })
        .catch(function () { img.src = item.thumb; });
    } else if (item.thumb) {
      img.src = item.thumb;
    } else {
      // 보여줄 그림이 없으면 아예 두지 않는다 (빈 src 는 "깨진 이미지" 로 보인다)
      img.style.display = 'none';
      if (item.type !== 'folder' && !item.previewVideo) noPreview();
    }

    // 영상: 마우스 올리면 저화질로 미리보기
    if (item.previewVideo) {
      var vid = el('video');
      vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'none';
      vid.draggable = false;
      thumb.appendChild(vid);

      // 내 컴퓨터 파일은 미리보기 그림이 없으니 첫 프레임을 썸네일로 쓴다
      if (item.posterFromVideo) {
        setTimeout(function () {                       // 일정 시간 안에 못 읽으면 포기
          if (!vid.videoWidth) noPreview();
        }, 4000);
        vid.preload = 'metadata';
        vid.src = item.previewVideo;
        vid.classList.add('on');
        vid.addEventListener('error', function () { vid.style.display = 'none'; noPreview(); });
        vid.addEventListener('loadedmetadata', function () {
          try { vid.currentTime = Math.min(0.5, (vid.duration || 1) / 3); } catch (e) {}
          if (!item.duration && vid.duration) {
            item.duration = vid.duration;
            var b = thumb.querySelector('.badge');
            if (b) b.textContent = fmtDuration(vid.duration);
          }
        });
      }
      card.addEventListener('mouseenter', function () {
        if (!vid.src) vid.src = item.previewVideo;
        vid.classList.add('on');
        var p = vid.play();
        if (p && p.catch) p.catch(function () {});
      });
      card.addEventListener('mouseleave', function () {
        vid.classList.remove('on');
        try { vid.pause(); vid.currentTime = 0; } catch (e) {}
      });
      card.__video = vid;
    }

    // 배지
    var badges = el('div', 'badges');
    if (item.duration) badges.appendChild(el('span', 'badge', fmtDuration(item.duration)));
    if (item.width && item.height) {
      badges.appendChild(el('span', 'badge dim',
        item.width + '×' + item.height + (item.fps ? ' · ' + item.fps + 'fps' : '')));
    }
    if (item.badge) badges.appendChild(el('span', 'badge dim', item.badge));
    thumb.appendChild(badges);

    // 폴더처럼 그림이 없는 카드는 이름을 타일 위에 크게 보여준다
    if (item.overlayName) {
      var nameTag = el('span', 'tile-name', '');
      nameTag.textContent = item.overlayName;
      nameTag.title = item.overlayName;
      thumb.appendChild(nameTag);
    }

    // 드래그 가능 표시 (폴더는 끌 수 없으니 달지 않는다)
    if (item.type !== 'folder') {
      var dragHint = el('span', 'drag-hint', '⠿');
      dragHint.title = '타임라인/프로젝트 패널로 끌어놓을 수 있어요';
      thumb.appendChild(dragHint);
    }

    // 카드 버튼 (폴더는 "불러오기" 하나만)
    var acts = el('div', 'acts');
    if (item.type === 'folder') {
      acts.appendChild(Eddie.ui.button('btn small', '불러오기', function (e) {
        e.stopPropagation(); self.opts.onPlace && self.opts.onPlace(item, 'import');
      })).title = '이 폴더의 파일을 프로젝트로 한 번에 불러옵니다';
    } else {
      acts.appendChild(Eddie.ui.button('btn small', '삽입', function (e) {
        e.stopPropagation(); self.opts.onPlace && self.opts.onPlace(item, 'insert');
      })).title = '플레이헤드 위치에 삽입 (,)';
      acts.appendChild(Eddie.ui.button('btn small', '덮어쓰기', function (e) {
        e.stopPropagation(); self.opts.onPlace && self.opts.onPlace(item, 'overwrite');
      })).title = '플레이헤드 위치에 덮어쓰기 (.)';
    }
    thumb.appendChild(acts);

    // 진행률
    var prog = el('div', 'prog', '<i></i><b></b>');
    thumb.appendChild(prog);
    card.__prog = prog;

    card.appendChild(thumb);

    // 출처
    var meta = el('div', 'meta');
    var srcName = item.sourceName || (g && g.info && g.info.name) || item.source;
    meta.innerHTML = '<span class="who"></span><span class="via"></span>';
    meta.querySelector('.who').textContent = (item.author && item.author.name) ? item.author.name : (item.title || '');
    meta.querySelector('.via').textContent = item.sub || srcName;      // 목록 보기에서는 크기·날짜
    meta.title = (item.author && item.author.name ? item.author.name + ' · ' : '') + srcName +
                 ' — 클릭하면 원본 페이지가 열립니다';
    meta.addEventListener('click', function (e) {
      e.stopPropagation();
      if (item.pageUrl) Eddie.host.openUrl(item.pageUrl);
    });
    card.appendChild(meta);

    // 한 번 클릭 = 고르기만 (소스 모니터를 열면 포커스가 프리미어로 넘어가
    // 방향키 · , · . 가 안 먹기 때문에, 열기는 더블클릭/Enter 로만 한다)
    card.addEventListener('click', function () {
      self.focus();                       // 포커스를 패널에 붙잡아 둔다
      setTimeout(function () { self.focus(); }, 0);
      self.select(parseInt(card.dataset.idx, 10));
      self.opts.onSelect && self.opts.onSelect(item);
    });

    // 더블클릭 = 소스 모니터에 열기
    card.addEventListener('dblclick', function (e) {
      e.preventDefault();
      self.opts.onActivate && self.opts.onActivate(item);
    });

    // ---- 드래그앤드롭 (패널 → 프리미어) ----
    // Adobe 공식 방식: dataTransfer 에 'com.adobe.cep.dnd.file.0' 로 로컬 파일 경로를 넘긴다.
    card.draggable = (item.type !== 'folder');
    if (item.__path && Eddie.download.exists(item.__path)) card.classList.add('ready');

    card.addEventListener('dragstart', function (e) {
      var p = item.__path;
      if (!p || !Eddie.download.exists(p)) {
        e.preventDefault();
        self.opts.onDragPrepare && self.opts.onDragPrepare(item, false);
        return;
      }
      try {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('com.adobe.cep.dnd.file.0', p);
        e.dataTransfer.setData('com.adobe.cep.dnd.file.count', '1');
        e.dataTransfer.setData('text/uri-list', Eddie.platform.fileUrl(p));
        e.dataTransfer.setData('text/plain', p);
        if (img.complete && img.naturalWidth) e.dataTransfer.setDragImage(img, 40, 24);
      } catch (err) {}
      card.classList.add('dragging');
      Eddie.ui.status('끌어놓는 중 — 타임라인이나 프로젝트 패널에 놓으세요');

      // 놓은 뒤 처리(빈으로 정리 등)를 여기서 시작한다.
      // 프리미어 위에 놓으면 dragend 가 안 오는 경우가 있어 시작할 때 건다.
      self.opts.onDragged && self.opts.onDragged(item);
    });

    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
      self.opts.onDragged && self.opts.onDragged(item);   // 중복 호출은 afterDrop 이 막는다
    });

    // 드래그를 한 번에 되게 하려고 미리 받아둔다
    function prefetch() {
      if (item.__path && Eddie.download.exists(item.__path)) return;
      self.opts.onDragPrepare && self.opts.onDragPrepare(item, true);
    }
    card.addEventListener('mousedown', function (e) { if (e.button === 0) prefetch(); });
    card.addEventListener('mouseenter', function () {
      if (Eddie.settings.get().prefetchOnHover) {
        clearTimeout(card.__pf);
        card.__pf = setTimeout(prefetch, 400);
      }
    });
    card.addEventListener('mouseleave', function () { clearTimeout(card.__pf); });

    return card;
  };

  // ---------------- 선택 / 키보드 ----------------
  Grid.prototype.select = function (idx) {
    if (idx < 0 || idx >= this.flat.length) return;
    if (this.flat[this.selected]) this.flat[this.selected].classList.remove('sel');
    this.selected = idx;
    var c = this.flat[idx];
    c.classList.add('sel');
    c.scrollIntoView({ block: 'nearest' });
  };

  Grid.prototype.selectedItem = function () {
    var c = this.flat[this.selected];
    return c ? c.__item : null;
  };

  Grid.prototype.columns = function () {
    if (!this.flat.length) return 1;
    var top = this.flat[0].getBoundingClientRect().top, n = 0;
    for (var i = 0; i < this.flat.length; i++) {
      if (Math.abs(this.flat[i].getBoundingClientRect().top - top) < 4) n++;
      else break;
    }
    return Math.max(1, n);
  };

  /** 다음/이전 항목으로 (줄이 바뀌어도 이어서 이동) */
  Grid.prototype.step = function (delta) {
    if (!this.flat.length) return;
    var next = (this.selected < 0) ? 0 : this.selected + delta;
    if (next < 0 || next >= this.flat.length) return;
    this.select(next);
  };

  Grid.prototype.move = function (dir) {
    if (!this.flat.length) return;
    if (this.selected < 0) { this.select(0); return; }
    var cols = this.columns(), next = this.selected;
    if (dir === 'left') next--;
    else if (dir === 'right') next++;
    else if (dir === 'up') next -= cols;
    else if (dir === 'down') next += cols;
    if (next < 0 || next >= this.flat.length) return;
    this.select(next);
  };

  Grid.prototype.togglePreview = function () {
    var c = this.flat[this.selected];
    if (!c || !c.__video) return;
    var v = c.__video;
    if (!v.src) v.src = c.__item.previewVideo;
    if (v.paused) { v.classList.add('on'); v.play().catch(function () {}); }
    else { v.pause(); v.classList.remove('on'); }
  };

  // ---------------- 진행률 ----------------
  Grid.prototype.progress = function (item, ratio, label) {
    var card = item.__card;
    if (!card) return;
    card.classList.add('working');
    card.classList.remove('failed');
    card.__prog.querySelector('i').style.width = Math.round((ratio || 0) * 100) + '%';
    card.__prog.querySelector('b').textContent = label || '';
  };

  Grid.prototype.progressDone = function (item) {
    var card = item.__card;
    if (!card) return;
    card.classList.remove('working');
    card.__prog.querySelector('i').style.width = '0%';
    card.__prog.querySelector('b').textContent = '';
  };

  Grid.prototype.progressError = function (item, msg, retry) {
    var card = item.__card;
    if (!card) return;
    card.classList.remove('working');
    card.classList.add('failed');
    var b = card.__prog.querySelector('b');
    card.__prog.querySelector('i').style.width = '0%';
    b.textContent = msg + ' ';
    b.appendChild(Eddie.ui.button('btn small', '다시 시도', function (e) {
      e.stopPropagation();
      card.classList.remove('failed');
      b.textContent = '';
      retry && retry();
    }));
  };

  Grid.prototype.markDraggable = function (item) {
    if (item.__card) item.__card.classList.add('ready');
  };

  global.Eddie.Grid = Grid;

})(window);
