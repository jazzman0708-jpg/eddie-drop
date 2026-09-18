/*
 * Eddie Drop - 공통 UI 부품 (Eddie.ui)
 * 토스트 · 상태바 · 자주 쓰는 DOM 만들기 · 키 이름 정리.
 */
(function (global) {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /** options: [{v, ko, disabled}] */
  function select(cls, options, onChange) {
    var s = el('select', cls);
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.v;
      op.textContent = o.ko;
      if (o.disabled) op.disabled = true;
      s.appendChild(op);
    });
    if (onChange) s.addEventListener('change', onChange);
    return s;
  }

  function button(cls, label, onClick) {
    var b = el('button', cls, label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function link(text, url) {
    var a = el('a', null, text);
    a.href = '#';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      Eddie.host.openUrl(url);
    });
    return a;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function status(msg, state) {
    var m = $('#status-msg');
    if (m) m.textContent = msg;
    var dot = $('#status-dot');
    if (dot) dot.className = 'dot' + (state ? ' ' + state : '');
  }

  // ------------------------------------------------------------------
  // 포커스 고정
  //   패널 안에 포커스를 붙잡아 두지 않으면 , 와 . 가 프리미어로 새어 나가
  //   "소스 모니터에 있던 클립" 이 대신 삽입되는 사고가 난다.
  //   그래서 결과 영역에 포커스를 고정한다.
  //   (대신 ` 같은 프리미어 패널 단축키는 잘 안 먹는다 — 설정에서 끌 수 있음)
  // ------------------------------------------------------------------
  var pinned = null;

  // 포커스 고정은 항상 켜 둔다.
  // 끄면 , 와 . 가 프리미어로 새어 소스 모니터 클립이 잘못 삽입된다.
  function pinEnabled() { return true; }

  function setFocusTarget(node) { if (node) pinned = node; }

  /** 결과 영역에 포커스를 고정한다 */
  function focusResults(node) {
    if (node) { pinned = node; watchPinned(node); }
    if (!pinEnabled() || !pinned) return false;
    try { pinned.focus({ preventScroll: true }); }
    catch (e) { try { pinned.focus(); } catch (e2) { return false; } }
    return true;
  }

  /**
   * 프리미어 쪽으로 넘어갔던 포커스를 패널로 되돌린다.
   *
   * 주의: activatePanel(requestOpenExtension) 은 패널을 활성화하지만
   * 그 과정에서 패널 안의 포커스를 <body> 로 되돌려 버린다.
   * <body> 에 포커스가 있으면 CEF 가 키를 프리미어로 넘겨서
   * , 를 눌렀을 때 소스 모니터 클립이 대신 삽입된다.
   * 그래서 패널을 깨운 "뒤에" 결과 영역을 여러 번 다시 잡아준다.
   */
  var repinTimers = [];

  function repin() {
    if (!pinEnabled()) return false;

    repinTimers.forEach(clearTimeout);
    repinTimers = [];

    try { Eddie.host.activatePanel(); } catch (e) {}

    [0, 60, 150, 300, 600, 1000, 1600, 2400].forEach(function (ms) {
      repinTimers.push(setTimeout(function () { focusResults(); }, ms));
    });
    return true;
  }

  /**
   * 상시 감시.
   * 패널이 포커스를 갖고 있는데 패널 안 포커스만 <body> 로 빠져 있으면 다시 잡는다.
   * (불러오기·패널 활성화 때문에 예고 없이 빠진다)
   * 패널 자체가 포커스를 잃은 상태(사용자가 타임라인을 보는 중)에는 건드리지 않는다.
   */
  var guardTimer = null;
  function startFocusGuard() {
    if (guardTimer) return;
    guardTimer = setInterval(function () {
      if (!pinEnabled() || !pinned) return;
      if (!pinned.offsetParent && pinned.offsetHeight === 0) return;   // 숨겨진 탭이면 건너뜀

      // 패널이 포커스를 잃었으면 손대지 않는다.
      //   실측 결과 requestOpenExtension 으로는 포커스를 되찾을 수 없었다.
      //   (9번 연속 시도 동안 hasFocus 가 계속 false 였다)
      //   괜히 계속 부르면 일만 하고 효과는 없다.
      if (!document.hasFocus()) return;
      if (document.activeElement !== document.body) return;
      focusResults();
    }, 250);
  }

  /**
   * 포커스가 <body> 로 빠지면 스스로 되돌린다.
   * 불러오기·패널 활성화 때문에 수시로 빠지는데, 그때마다 다시 잡아야
   * , 와 . 가 프리미어로 새지 않는다.
   */
  function watchPinned(node) {
    if (!node || node.__pinWatched) return;
    node.__pinWatched = true;
    node.addEventListener('blur', function () {
      [0, 120].forEach(function (ms) {
        setTimeout(function () {
          if (!pinEnabled()) return;
          if (document.activeElement === document.body && document.hasFocus()) focusResults();
        }, ms);
      });
    });
  }

  /**
   * 키 이름을 한 가지로 맞춘다.
   * CEF 버전에 따라 방향키가 'ArrowDown' 이기도 하고 'Down' 이기도 하다.
   * key 가 비어 있는 경우까지 대비해 keyCode 로도 알아본다.
   * → 'up' | 'down' | 'left' | 'right' | 'enter' | 'space' | 'comma' | 'period' | 'tab' | ''
   */
  var KEY_NAMES = {
    'ArrowUp': 'up',      'Up': 'up',
    'ArrowDown': 'down',  'Down': 'down',
    'ArrowLeft': 'left',  'Left': 'left',
    'ArrowRight': 'right','Right': 'right',
    'Enter': 'enter',     'Return': 'enter',
    ' ': 'space',         'Spacebar': 'space',  'Space': 'space',
    ',': 'comma',         'Comma': 'comma',
    '.': 'period',        'Period': 'period',
    'Tab': 'tab'
  };

  var KEY_CODES = {
    38: 'up', 40: 'down', 37: 'left', 39: 'right',
    13: 'enter', 32: 'space', 188: 'comma', 190: 'period', 9: 'tab'
  };

  function keyName(e) {
    if (e.key && KEY_NAMES[e.key]) return KEY_NAMES[e.key];
    var code = e.keyCode || e.which;
    if (code && KEY_CODES[code]) return KEY_CODES[code];
    if (e.code === 'Space') return 'space';
    if (e.code === 'Comma') return 'comma';
    if (e.code === 'Period') return 'period';
    return '';
  }

  /** CEP 선택 창이 돌려준 값을 진짜 경로로 (운영체제별 처리는 Eddie.platform) */
  function decodePath(p) { return Eddie.platform.toLocalPath(p); }

  /**
   * 맥은 파일 이름의 한글을 자모로 쪼개서(NFD) 저장한다.
   * 화면에 쓸 때는 합쳐진 형태(NFC)로 보여야 제대로 읽힌다.
   * (실제 파일을 여닫을 때는 원본 문자열을 그대로 쓴다)
   */
  function prettyName(s) {
    if (!s) return s;
    try { return String(s).normalize('NFC'); }
    catch (e) { return String(s); }
  }

  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtMB(bytes) { return (bytes / 1048576).toFixed(1) + 'MB'; }

  global.Eddie.ui = {
    $: $, $$: $$,
    el: el,
    select: select,
    button: button,
    link: link,
    toast: toast,
    status: status,
    focusResults: focusResults,
    setFocusTarget: setFocusTarget,
    repin: repin,
    startFocusGuard: startFocusGuard,
    isPinned: function () { return !!(pinned && document.activeElement === pinned); },
    keyName: keyName,
    decodePath: decodePath,
    prettyName: prettyName,
    fmtDuration: fmtDuration,
    fmtMB: fmtMB
  };

})(window);
