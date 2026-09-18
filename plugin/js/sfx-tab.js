/*
 * Eddie Drop - 효과음 탭 (Freesound)
 * 리스트형: 이름 · 길이 · 태그 · 파형/재생 버튼
 * CC0 라이선스만 검색된다 (끌 수 없음).
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var DURATION = [
    { v: '',       ko: '길이 전체' },
    { v: 'short',  ko: '짧게 (0~3초)' },
    { v: 'medium', ko: '보통 (3~15초)' },
    { v: 'long',   ko: '길게 (15초~)' }
  ];

  var SORT = [
    { v: 'score',          ko: '관련도순' },
    { v: 'downloads_desc', ko: '많이 받은 순' },
    { v: 'rating_desc',    ko: '별점 높은 순' },
    { v: 'duration_asc',   ko: '짧은 순' }
  ];

  // 한 번에 하나만 재생한다
  var player = null;
  var playingRow = null;

  function stopAll() {
    if (player) { try { player.pause(); } catch (e) {} }
    if (playingRow) { playingRow.classList.remove('playing'); playingRow = null; }
  }

  /** 0 ~ 100 */
  function volume() {
    var v = Eddie.settings.get().sfxVolume;
    return (v === undefined || v === null) ? 80 : v;
  }

  function applyVolume() {
    if (player) {
      try { player.volume = Math.max(0, Math.min(100, volume())) / 100; }
      catch (e) {}
    }
  }

  // ==================================================================
  function SfxTab() {
    this.query = '';
    this.page = 1;
    this.tags = [];
    this.duration = '';
    this.sort = 'score';
    this.timer = null;
    this.busy = false;
    this.items = [];
    this.selected = -1;
    this.recentKey = 'eddieDrop.sfx.recent';
  }

  SfxTab.prototype.mount = function (view) {
    var self = this;
    var ui = Eddie.ui;
    var el = ui.el;

    view.classList.add('media-view');
    view.innerHTML = '';

    var bar = el('div', 'searchbar');

    // --- 검색창 ---
    var row = el('div', 'row');
    this.input = el('input', 'grow');
    this.input.type = 'text';
    this.input.spellcheck = false;
    this.input.placeholder = '효과음 검색 (예: 휘릭, whoosh)';
    this.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        clearTimeout(self.timer);
        self.search(true);
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

    this.transNote = el('p', 'hint trans-note');
    this.transNote.style.display = 'none';
    bar.appendChild(this.transNote);

    // --- 최근 검색어 ---
    this.recentBox = el('div', 'chips recent');
    bar.appendChild(this.recentBox);

    // --- 태그 칩 ---
    this.chipBox = el('div', 'chips');
    bar.appendChild(this.chipBox);
    bar.appendChild(el('p', 'hint', '태그를 여러 개 고르면 모두 들어간 소리만 찾습니다. (칩 목록은 설정 탭에서 바꿀 수 있어요)'));

    // --- 길이 / 정렬 ---
    var f = el('div', 'filters');
    var dSel = ui.select('', DURATION, function () { self.duration = dSel.value; self.search(true); });
    var sSel = ui.select('', SORT, function () { self.sort = sSel.value; self.search(true); });
    f.appendChild(dSel);
    f.appendChild(sSel);
    bar.appendChild(f);

    // --- 미리듣기 볼륨 ---
    var vrow = el('div', 'row vol-row');
    var vmute = ui.button('btn small vol-btn', '', function () {
        var cur = volume();
        Eddie.settings.set('sfxVolume', cur > 0 ? 0 : (self.lastVolume || 80));
        if (cur > 0) self.lastVolume = cur;
        vslider.value = volume();
        paintVol();
        applyVolume();
    });
    var vslider = el('input', 'grow');
    vslider.type = 'range'; vslider.min = 0; vslider.max = 100; vslider.step = 5;
    vslider.value = volume();
    vslider.title = '미리듣기 볼륨';
    vslider.addEventListener('input', function () {
      Eddie.settings.set('sfxVolume', parseInt(vslider.value, 10));
      paintVol();
      applyVolume();
    });
    var vnum = el('span', 'hint vol-num');

    function paintVol() {
      var v = volume();
      vmute.textContent = v === 0 ? '🔇' : (v < 40 ? '🔈' : '🔊');
      vmute.title = v === 0 ? '소리 켜기' : '소리 끄기';
      vnum.textContent = v + '%';
      vslider.value = v;
    }
    paintVol();

    vrow.appendChild(vmute);
    vrow.appendChild(vslider);
    vrow.appendChild(vnum);
    bar.appendChild(vrow);

    bar.appendChild(el('p', 'hint howto',
      '클릭 = 듣기 · <b>Tab</b> 다음 · <b>Shift+Tab</b> 이전 · <b>Space</b> 재생/정지 · <b>,</b> 삽입 · <b>.</b> 덮어쓰기'));

    view.appendChild(bar);

    // --- 결과 리스트 ---
    this.list = el('div', 'sfx-list');
    this.list.tabIndex = -1;              // 포커스를 받아야 , 와 . 가 안 샌다
    this.list.style.outline = 'none';
    view.appendChild(this.list);

    // --- 하단 고정 문구 ---
    var foot = el('div', 'sfx-foot');
    foot.appendChild(el('span', null, '🔓 CC0 라이선스만 검색됩니다 (출처 표기 없이 사용 가능)'));
    view.appendChild(foot);

    this.renderChips();
    this.renderRecent();
    this.message('검색어를 입력하거나 위 태그를 눌러보세요.<br><span class="dim">한글로 쳐도 아는 단어는 영어로 바꿔서 찾습니다</span>');
  };

  SfxTab.prototype.focus = function () { Eddie.ui.focusResults(this.list); };
  SfxTab.prototype.focusResults = function () { this.focus(); };

  SfxTab.prototype.message = function (html, cls) {
    this.list.innerHTML = '';
    this.list.appendChild(Eddie.ui.el('div', 'grid-msg ' + (cls || ''), html));
    this.items = [];
    this.selected = -1;
  };

  // ---------------- 칩 / 최근 검색어 ----------------
  SfxTab.prototype.renderChips = function () {
    var self = this;
    var el = Eddie.ui.el;
    this.chipBox.innerHTML = '';
    SfxDictionary.chips().forEach(function (c) {
      var b = el('button', 'chip' + (self.tags.indexOf(c.en) >= 0 ? ' on' : ''), c.ko);
      b.title = '태그: ' + c.en;
      b.addEventListener('click', function () {
        var i = self.tags.indexOf(c.en);
        if (i >= 0) { self.tags.splice(i, 1); b.classList.remove('on'); }
        else { self.tags.push(c.en); b.classList.add('on'); }
        self.search(true);
      });
      self.chipBox.appendChild(b);
    });
  };

  SfxTab.prototype.recent = function () {
    try { return JSON.parse(localStorage.getItem(this.recentKey) || '[]'); }
    catch (e) { return []; }
  };

  SfxTab.prototype.pushRecent = function (q) {
    if (!q) return;
    var list = this.recent().filter(function (x) { return x !== q; });
    list.unshift(q);
    localStorage.setItem(this.recentKey, JSON.stringify(list.slice(0, 5)));
    this.renderRecent();
  };

  SfxTab.prototype.renderRecent = function () {
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
  SfxTab.prototype.search = function (reset) {
    var self = this;
    var raw = this.input.value.trim();

    if (!raw && !this.tags.length) {
      this.message('검색어를 입력하거나 위 태그를 눌러보세요.');
      this.transNote.style.display = 'none';
      return;
    }
    if (!Eddie.settings.key('freesound')) {
      this.message('설정 탭에서 Freesound API 키를 넣어주세요.', 'need-key');
      return;
    }
    if (this.busy) return;

    // 한글 → 영어
    var t = SfxDictionary.translate(raw);
    if (t.changed) {
      this.transNote.innerHTML = '“' + raw + '” → <b>' + t.text + '</b> 로 찾는 중';
      this.transNote.style.display = '';
    } else if (t.untranslated) {
      this.transNote.textContent = '영어로 검색하면 결과가 훨씬 많아요.';
      this.transNote.style.display = '';
    } else {
      this.transNote.style.display = 'none';
    }

    if (reset) {
      this.page = 1;
      this.query = t.text;
      this.items = [];
      this.selected = -1;
      this.list.innerHTML = '';
      this.message('찾는 중…');
      if (raw) this.pushRecent(raw);
    }

    this.busy = true;
    Eddie.ui.status('효과음 검색 중…');

    SS.adapters.freesound.search({
      query: this.query,
      page: this.page,
      pageSize: 30,
      tags: this.tags,
      duration: this.duration,
      sort: this.sort
    }).then(function (res) {
      self.busy = false;

      if (reset) self.list.innerHTML = '';

      if (!res.items.length && !self.items.length) {
        self.message('결과가 없습니다.<br><span class="dim">태그를 줄이거나 영어로 검색해 보세요.</span>');
        Eddie.ui.status('결과 없음', 'err');
        return;
      }

      res.items.forEach(function (item) {
        self.items.push(item);
        self.list.appendChild(self.row(item));
      });

      if (self.selected < 0 && self.items.length) self.select(0);

      // 더 보기
      var old = self.list.querySelector('.more');
      if (old) old.parentNode.removeChild(old);
      if (res.hasMore) {
        self.list.appendChild(Eddie.ui.button('btn more', '더 보기', function () {
          self.page++;
          self.search(false);
        }));
      }

      Eddie.ui.status('효과음 ' + self.items.length + '개 (전체 ' + res.total.toLocaleString() + '개)', 'ok');

    }).catch(function (e) {
      self.busy = false;
      self.message('<span class="err-msg">' + (e.message || e) + '</span>');
      Eddie.ui.status(e.message || String(e), 'err');
    });
  };

  // ---------------- 한 줄 ----------------
  SfxTab.prototype.row = function (item) {
    var self = this;
    var ui = Eddie.ui;
    var el = ui.el;

    var row = el('div', 'sfx-row');
    row.__item = item;
    item.__row = row;

    // 재생 버튼
    var play = el('button', 'sfx-play', '▶');
    play.title = '미리듣기 (스페이스)';
    play.addEventListener('mousedown', function (e) { e.preventDefault(); });
    play.addEventListener('click', function (e) { e.stopPropagation(); self.togglePlay(item); });
    row.appendChild(play);

    // 가운데
    var mid = el('div', 'sfx-mid');
    var top = el('div', 'sfx-top');
    top.appendChild(el('span', 'sfx-name', '')).textContent = item.title;
    var lic = el('span', 'sfx-lic', 'CC0');
    lic.title = '출처 표기 없이 자유롭게 쓸 수 있는 소리입니다 (' + (item.license || 'CC0') + ')';
    top.appendChild(lic);
    top.appendChild(el('span', 'sfx-dur', ui.fmtDuration(item.duration)));
    mid.appendChild(top);

    if (item.waveform) {
      var wave = el('div', 'sfx-wave');
      wave.style.backgroundImage = 'url("' + item.waveform + '")';
      mid.appendChild(wave);
    }

    var tags = el('div', 'sfx-tags');
    tags.textContent = (item.tags || []).slice(0, 6).join(' · ');
    mid.appendChild(tags);

    var prog = el('div', 'prog', '<i></i><b></b>');
    mid.appendChild(prog);
    row.__prog = prog;

    row.appendChild(mid);

    // 오른쪽 버튼
    var acts = el('div', 'sfx-acts');
    acts.appendChild(ui.button('btn small', '삽입', function (e) {
      e.stopPropagation(); self.place(item, 'insert');
    })).title = '플레이헤드 위치에 삽입 (,)';
    acts.appendChild(ui.button('btn small', '덮어쓰기', function (e) {
      e.stopPropagation(); self.place(item, 'overwrite');
    })).title = '플레이헤드 위치에 덮어쓰기 (.)';
    row.appendChild(acts);

    // 한 번 클릭 = 고르기 + 미리듣기 (패널 안에서 재생 — 포커스를 뺏기지 않는다)
    row.addEventListener('click', function () {
      self.focus();                        // 포커스를 패널에 붙잡아 둔다
      setTimeout(function () { self.focus(); }, 0);   // 브라우저 기본 동작보다 뒤에 한 번 더
      self.select(self.items.indexOf(item));
      self.togglePlay(item);
      // 미리 받아서 프로젝트에 넣어둔다 → , 를 눌렀을 때 포커스가 안 흔들린다
      Eddie.premiere.preload({
        item: item,
        file: Sources.adapters.freesound.pickFile(item),
        query: self.query,
        grid: self.progressAdapter(),
        binName: 'Freesound'
      });
    });

    // 더블클릭 = 소스 모니터에 열기 (이때는 포커스가 프리미어로 넘어간다)
    row.addEventListener('dblclick', function (e) {
      e.preventDefault();
      stopAll();
      self.place(item, 'none');
    });

    // 드래그앤드롭 (패널 → 프리미어)
    row.draggable = true;
    if (item.__path && Eddie.download.exists(item.__path)) row.classList.add('ready');

    row.addEventListener('dragstart', function (e) {
      var p = item.__path;
      if (!p || !Eddie.download.exists(p)) {
        e.preventDefault();
        self.prepare(item, false);
        return;
      }
      try {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('com.adobe.cep.dnd.file.0', p);
        e.dataTransfer.setData('com.adobe.cep.dnd.file.count', '1');
        e.dataTransfer.setData('text/uri-list', Eddie.platform.fileUrl(p));
        e.dataTransfer.setData('text/plain', p);
      } catch (err) {}
      row.classList.add('dragging');
      Eddie.premiere.afterDrop(item);   // 드롭 뒤 크기·레벨 맞추기 (dragend 가 안 올 수 있어 여기서 시작)
      Eddie.ui.status('끌어놓는 중 — 오디오 트랙에 놓으세요');
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('dragging');
      // 드롭은 프리미어가 처리하므로, 들어온 클립을 찾아 레벨을 맞춘다
      Eddie.premiere.afterDrop(item);
    });
    row.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (item.__path && Eddie.download.exists(item.__path)) return;
      self.prepare(item, true);
    });

    return row;
  };

  // ---------------- 미리듣기 ----------------
  SfxTab.prototype.togglePlay = function (item) {
    var row = item.__row;
    if (playingRow === row && player && !player.paused) { stopAll(); return; }

    stopAll();
    if (!player) player = new Audio();
    player.src = item.preview;
    player.currentTime = 0;
    applyVolume();
    player.play().catch(function (e) {
      Eddie.ui.toast('미리듣기를 재생하지 못했습니다: ' + (e.message || e));
    });
    row.classList.add('playing');
    playingRow = row;
    player.onended = function () { stopAll(); };
  };

  // ---------------- 넣기 ----------------
  SfxTab.prototype.prepare = function (item, silent) {
    if (!silent) Eddie.ui.toast('파일을 받는 중이에요 — 다 받으면 끌어놓을 수 있어요');
    return Eddie.premiere.fetchOnly({
      item: item,
      file: SS.adapters.freesound.pickFile(item),
      query: this.query,
      grid: this.progressAdapter()
    }).then(function () {
      if (item.__row) item.__row.classList.add('ready');
      if (!silent) Eddie.ui.toast('준비 완료 — 이제 끌어놓으세요');
    }).catch(function () {});
  };

  SfxTab.prototype.place = function (item, mode) {
    Eddie.premiere.run({
      item: item,
      file: SS.adapters.freesound.pickFile(item),
      query: this.query,
      mode: mode,
      grid: this.progressAdapter(),
      binName: 'Freesound'
    });
  };

  /** Eddie.premiere 가 기대하는 진행률 표시 방식을 리스트에 맞춰 흉내낸다 */
  SfxTab.prototype.progressAdapter = function () {
    return {
      progress: function (item, ratio, label) {
        var r = item.__row;
        if (!r) return;
        r.classList.add('working');
        r.classList.remove('failed');
        r.__prog.querySelector('i').style.width = Math.round((ratio || 0) * 100) + '%';
        r.__prog.querySelector('b').textContent = label || '';
      },
      progressDone: function (item) {
        var r = item.__row;
        if (!r) return;
        r.classList.remove('working');
        r.__prog.querySelector('i').style.width = '0%';
        r.__prog.querySelector('b').textContent = '';
      },
      progressError: function (item, msg, retry) {
        var r = item.__row;
        if (!r) return;
        r.classList.remove('working');
        r.classList.add('failed');
        var b = r.__prog.querySelector('b');
        r.__prog.querySelector('i').style.width = '0%';
        b.textContent = msg + ' ';
        b.appendChild(Eddie.ui.button('btn small', '다시 시도', function (e) {
          e.stopPropagation();
          r.classList.remove('failed');
          b.textContent = '';
          retry && retry();
        }));
      },
      markDraggable: function (item) {
        if (item.__row) item.__row.classList.add('ready');
      }
    };
  };

  // ---------------- 선택 / 키보드 ----------------
  SfxTab.prototype.select = function (idx) {
    if (idx < 0 || idx >= this.items.length) return;
    var prev = this.items[this.selected];
    if (prev && prev.__row) prev.__row.classList.remove('sel');
    this.selected = idx;
    var r = this.items[idx].__row;
    if (r) { r.classList.add('sel'); r.scrollIntoView({ block: 'nearest' }); }
  };

  SfxTab.prototype.handleKey = function (e, name) {
    name = name || Eddie.ui.keyName(e);

    // Tab 은 방향키 대체 (프리미어가 방향키를 안 놓아줄 때)
    if (name === 'tab') name = e.shiftKey ? 'up' : 'down';

    // 방향키로 넘기면 바로 들려준다 (소리를 고르는 탭이라 이게 편하다)
    if (name === 'down' || name === 'up') {
      var was = this.selected;
      this.select(this.selected + (name === 'down' ? 1 : -1));
      if (this.selected !== was) {
        var it = this.items[this.selected];
        if (it && Eddie.settings.get().sfxAutoPlay !== false) {
          stopAll();
          this.togglePlay(it);
        }
      }
      e.preventDefault();
      return;
    }

    var item = this.items[this.selected];
    if (!item) return;

    // Enter 는 쓰지 않는다 (프리미어 인/아웃 렌더가 같이 돈다) — 소스 모니터는 더블클릭
    if (name === 'space')       { this.togglePlay(item);         e.preventDefault(); }
    else if (name === 'comma')  { this.place(item, 'insert');    e.preventDefault(); }
    else if (name === 'period') { this.place(item, 'overwrite'); e.preventDefault(); }
  };

  /** 탭을 벗어나면 소리를 멈춘다 (설정에서 끌 수 있음) */
  SfxTab.prototype.onHide = function () {
    if (Eddie.settings.get().sfxStopOnLeave !== false) stopAll();
  };

  // 패널 밖(다른 프리미어 패널)으로 나가도 멈춘다
  if (!global.__sfxBlurHooked) {
    global.__sfxBlurHooked = true;
    window.addEventListener('blur', function () {
      if (Eddie.settings.get().sfxStopOnLeave !== false) stopAll();
    });
  }

  SS.SfxTab = SfxTab;

})(window);
