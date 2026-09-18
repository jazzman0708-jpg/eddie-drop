/*
 * Eddie Drop - 단축키 (Eddie.shortcuts)
 *
 * CEP 패널은 기본적으로 키 입력을 호스트(프리미어)에 그대로 넘긴다.
 * 그래서 패널 안에서 , 를 누르면 "패널의 삽입"과 "프리미어의 삽입"이 둘 다 도는 수가 있다.
 * registerKeyEventsInterest() 로 이 키들을 패널이 가져가겠다고 미리 알려주면
 * 패널에 포커스가 있는 동안만 프리미어로 넘어가지 않는다.
 * (타임라인에 포커스가 있을 때는 프리미어 기본 단축키가 그대로 동작한다)
 *
 * keyCode 는 OS의 가상 키코드다. JS의 event.keyCode 가 아니다.
 *   맥   : Carbon 가상 키코드
 *   윈도 : Windows Virtual-Key 코드
 */
(function (global) {
  'use strict';

  var isMac = /Mac/i.test(navigator.platform || navigator.userAgent);

  // 이름 → [맥 코드, 윈도 코드]
  var CODES = {
    comma:  [43,  188],   // ,  삽입
    period: [47,  190],   // .  덮어쓰기
    space:  [49,  32],    // 스페이스  미리듣기/미리보기
    enter:  [36,  13],    // Enter     소스 모니터에 열기
    left:   [123, 37],
    right:  [124, 39],
    down:   [125, 40],
    up:     [126, 38],
    tab:    [48,  9]      // Tab  다음 결과 (방향키를 프리미어가 안 놓아줄 때의 대체)
  };

  // Enter 만 뺀다.
  //   registerKeyEventsInterest 는 실제로 키를 막아주지 못한다(CEP 알려진 버그).
  //   그래서 , . 를 누르면 패널과 프리미어가 같이 반응한다 —
  //   소스 모니터에 열린 클립도 함께 삽입된다는 뜻이다. (알고 쓰는 것)
  //   Enter 는 프리미어의 "인/아웃 렌더" 가 같이 돌아버려서 빼 둔다.
  var WANTED = ['comma', 'period', 'space', 'left', 'right', 'down', 'up', 'tab'];
  var ARROWS = ['left', 'right', 'down', 'up'];

  var lastResult = null;

  function codeOf(name) {
    var pair = CODES[name];
    return pair ? (isMac ? pair[0] : pair[1]) : null;
  }

  /**
   * 등록할 키 목록.
   * - 수식키 항목(ctrlKey 등)을 빼먹으면 매칭이 안 되는 경우가 있어 전부 false 로 넣는다.
   * - 방향키는 프리미어가 강하게 붙잡고 있어서, 맥/윈도 코드를 둘 다 넣어 본다.
   *   (해당 없는 코드는 그냥 무시되므로 넣어도 손해가 없다)
   */
  function list() {
    var out = [];
    var seen = {};

    function add(code) {
      if (code === null || code === undefined || seen[code]) return;
      seen[code] = true;
      out.push({ keyCode: code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false });
    }

    WANTED.forEach(function (n) {
      var pair = CODES[n];
      if (!pair) return;
      add(isMac ? pair[0] : pair[1]);
      // 방향키만 반대쪽 코드도 함께 등록 (프리미어가 안 놓아주는 경우 대비)
      if (ARROWS.indexOf(n) >= 0) add(isMac ? pair[1] : pair[0]);
    });

    return out;
  }

  /**
   * 설정에 따라 키를 가져오거나 돌려준다.
   * → { ok, registered, message }
   */
  function apply() {
    var on = !!Eddie.settings.get().panelShortcuts;
    var cs = Eddie.host.cs;

    if (!cs || typeof cs.registerKeyEventsInterest !== 'function') {
      lastResult = { ok: false, registered: 0, message: '이 프리미어 버전에서는 키 가져오기를 지원하지 않습니다 (CEP 6.1 이상 필요)' };
      return lastResult;
    }

    var keys = on ? list() : [];
    try {
      cs.registerKeyEventsInterest(JSON.stringify(keys));
      lastResult = {
        ok: true,
        registered: keys.length,
        message: on
          ? '패널 단축키 ' + keys.length + '개 사용 중 (' + (isMac ? '맥' : '윈도') + ')'
          : '패널 단축키 꺼짐 — 모든 키가 프리미어로 갑니다'
      };
    } catch (e) {
      lastResult = { ok: false, registered: 0, message: '키 등록 실패: ' + (e.message || e) };
    }
    return lastResult;
  }

  function status() { return lastResult; }

  /** 설정 탭 · 도움말에 보여줄 목록 */
  var HELP = [
    { key: '클릭',      what: '고르기 (효과음은 듣기)' },
    { key: 'Tab',      what: '다음 결과' },
    { key: 'Shift+Tab', what: '이전 결과' },
    { key: 'Space',    what: '미리보기 / 미리듣기' },
    { key: '더블클릭',  what: '소스 모니터에 열기' },
    { key: ',',        what: '플레이헤드 위치에 삽입' },
    { key: '.',        what: '플레이헤드 위치에 덮어쓰기' }
  ];

  global.Eddie.shortcuts = {
    apply: apply,
    status: status,
    list: list,
    isMac: isMac,
    HELP: HELP
  };

})(window);
