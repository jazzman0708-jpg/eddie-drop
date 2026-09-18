/*
 * Eddie Drop - 효과음 한글 → 영어 사전
 * Freesound 는 영어 태그로 검색된다. 한글로 쳐도 찾아지게 바꿔준다.
 */
(function (global) {
  'use strict';

  // 태그 빠른 선택 칩 기본 세트 (설정에서 추가/삭제 가능)
  var DEFAULT_CHIPS = [
    { ko: '휘릭',        en: 'whoosh' },
    { ko: '뿅',          en: 'pop' },
    { ko: '띠링',        en: 'ding' },
    { ko: '알림',        en: 'notification' },
    { ko: '클릭',        en: 'click' },
    { ko: '타자',        en: 'typing' },
    { ko: '카메라 셔터', en: 'camera-shutter' },
    { ko: '박수',        en: 'applause' },
    { ko: '웃음',        en: 'laugh' },
    { ko: '성공',        en: 'success' },
    { ko: '실패',        en: 'fail' },
    { ko: '에러',        en: 'error' },
    { ko: '발소리',      en: 'footsteps' },
    { ko: '문',          en: 'door' },
    { ko: '비',          en: 'rain' },
    { ko: '바람',        en: 'wind' },
    { ko: '폭발',        en: 'explosion' },
    { ko: '글리치',      en: 'glitch' },
    { ko: '전환',        en: 'transition' },
    { ko: '레트로 게임', en: '8bit' }
  ];

  // 검색어 번역 사전 (칩 + 자주 쓰는 말)
  var DICT = {
    '휘릭': 'whoosh', '휙': 'whoosh', '스왈': 'swoosh', '스우시': 'swoosh',
    '뿅': 'pop', '팝': 'pop', '띠링': 'ding', '딩': 'ding', '종': 'bell', '벨': 'bell',
    '알림': 'notification', '알람': 'alarm', '클릭': 'click', '버튼': 'button',
    '타자': 'typing', '키보드': 'keyboard', '마우스': 'mouse click',
    '카메라': 'camera', '셔터': 'camera-shutter', '사진': 'camera-shutter',
    '박수': 'applause', '환호': 'cheer', '웃음': 'laugh', '비웃음': 'laugh',
    '성공': 'success', '실패': 'fail', '에러': 'error', '오류': 'error',
    '발소리': 'footsteps', '걷기': 'footsteps', '뛰기': 'running',
    '문': 'door', '노크': 'knock', '종이': 'paper', '유리': 'glass',
    '비': 'rain', '빗소리': 'rain', '천둥': 'thunder', '바람': 'wind',
    '파도': 'wave', '물': 'water', '불': 'fire', '폭발': 'explosion',
    '글리치': 'glitch', '노이즈': 'noise', '전환': 'transition', '스위치': 'switch',
    '레트로': '8bit', '게임': 'game', '동전': 'coin', '레벨업': 'level up',
    '심장': 'heartbeat', '숨': 'breath', '기침': 'cough', '휘파람': 'whistle',
    '차': 'car', '자동차': 'car', '엔진': 'engine', '경적': 'horn',
    '전화': 'phone', '벨소리': 'ringtone', '메시지': 'message',
    '드럼': 'drum', '기타': 'guitar', '피아노': 'piano', '바이올린': 'violin',
    '새': 'bird', '개': 'dog', '고양이': 'cat', '말': 'horse',
    '사람': 'crowd', '군중': 'crowd', '아기': 'baby',
    '시계': 'clock', '초침': 'tick', '타이머': 'timer',
    '지퍼': 'zipper', '가위': 'scissors', '칼': 'knife',
    '펀치': 'punch', '타격': 'impact', '충격': 'impact', '쿵': 'thud',
    '삐': 'beep', '경고': 'warning', '사이렌': 'siren',
    '우주': 'space', '로봇': 'robot', '기계': 'machine',
    '마법': 'magic', '반짝': 'sparkle', '빛': 'shine'
  };

  function hasKorean(s) { return /[가-힣]/.test(s); }

  /**
   * 설정에서 사용자가 만든 칩을 사전으로 쓴다.
   * 사용자가 직접 넣은 말이니 기본 사전보다 먼저 본다.
   */
  function userMap() {
    var m = {};
    try {
      chips().forEach(function (c) {
        if (c && c.ko && c.en) m[String(c.ko).trim()] = String(c.en).trim();
      });
    } catch (e) {}
    return m;
  }

  function lookup(word, mine) {
    if (mine[word]) return mine[word];     // 내가 만든 칩이 우선
    if (DICT[word]) return DICT[word];
    return null;
  }

  /**
   * 한글 검색어를 영어로 바꾼다.
   *
   * 보는 순서
   *   1. 통째로 (설정에서 만든 칩 → 기본 사전) — "카메라 셔터" 처럼 띄어쓴 말 때문
   *   2. 단어별로
   *
   * → { text, changed, untranslated }
   *   changed       : 하나라도 바뀌었는지
   *   untranslated  : 한글인데 사전에 없는 말이 남았는지
   */
  function translate(q) {
    q = String(q || '').trim();
    if (!q) return { text: '', changed: false, untranslated: false };

    var mine = userMap();

    // 1) 검색어 전체가 사전에 있으면 그것을 쓴다
    var whole = lookup(q, mine);
    if (whole) return { text: whole, changed: true, untranslated: false };

    // 2) 단어별로 바꾼다
    var parts = q.split(/\s+/);
    var changed = false, untranslated = false;

    var out = parts.map(function (w) {
      var hit = lookup(w, mine);
      if (hit) { changed = true; return hit; }
      if (hasKorean(w)) { untranslated = true; }
      return w;
    });

    return { text: out.join(' '), changed: changed, untranslated: untranslated };
  }

  /** 설정에 저장된 칩 목록 (없으면 기본 세트) */
  function chips() {
    var saved = Eddie.settings.get().sfxChips;
    if (Array.isArray(saved) && saved.length) return saved;
    return DEFAULT_CHIPS.slice();
  }

  function saveChips(list) {
    Eddie.settings.set('sfxChips', list);
  }

  function resetChips() {
    Eddie.settings.set('sfxChips', DEFAULT_CHIPS.slice());
  }

  global.SfxDictionary = {
    DEFAULT_CHIPS: DEFAULT_CHIPS,
    DICT: DICT,
    translate: translate,
    hasKorean: hasKorean,
    chips: chips,
    saveChips: saveChips,
    resetChips: resetChips
  };

})(window);
