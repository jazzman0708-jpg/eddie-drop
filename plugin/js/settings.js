/*
 * Eddie Drop - 설정 (Eddie.settings)
 *
 * 저장 위치 (운영체제별, Eddie.platform 이 정함)
 *   맥   ~/Library/Application Support/Eddie/shared-settings.json
 *   윈도 %APPDATA%\\Eddie\\shared-settings.json
 *   → 다른 에디 플러그인들과 API 키·다운로드 폴더를 함께 쓴다.
 *
 * 파일 구조
 *   {
 *     "version": 1,
 *     "shared": { "keys": {...}, "downloadDir": "...", "insertMode": "insert" },
 *     "apps":   { "eddie-drop": { "quality": "...", ... } }
 *   }
 *
 * 다른 플러그인이 같은 파일을 쓸 수 있으므로,
 * 저장할 때마다 파일을 다시 읽어서 내 부분만 고쳐 쓴다.
 */
(function (global) {
  'use strict';

  var fs   = (typeof require === 'function') ? require('fs') : null;
  var os   = (typeof require === 'function') ? require('os') : null;
  var path = (typeof require === 'function') ? require('path') : null;

  var APP_ID = 'eddie-drop';

  // 에디 플러그인들이 함께 쓰는 값 / 이 플러그인만 쓰는 값
  var SHARED_PROPS = ['keys', 'downloadDir', 'insertMode', 'license', 'autoUpdate'];
  var APP_PROPS    = ['quality', 'binRoot', 'prefetchOnHover', 'panelShortcuts', 'sfxChips', 'sfxAutoPlay', 'advancePlayhead', 'sfxVolume', 'sfxNormalize', 'sfxTargetDb', 'sfxStopOnLeave', 'myFolder', 'myFolders', 'lastUpdateCheck'];

  var DEFAULTS = {
    keys: {},                  // 어댑터들이 요구하는 키가 들어온다
    downloadDir: '',           // 아래에서 채움
    insertMode: 'insert',      // insert / overwrite
    license: '',               // 라이선스 키 (에디 플러그인들이 함께 씀)
    autoUpdate: true,          // 시작할 때 새 버전이 있는지 조용히 확인
    quality: 'fhd',            // 4k / fhd / hd
    binRoot: 'Eddie Drop',
    prefetchOnHover: false,
    panelShortcuts: true,
    sfxChips: null,            // null 이면 기본 세트 사용
    sfxAutoPlay: true,         // 효과음에서 방향키로 넘길 때 바로 들려주기
    advancePlayhead: true,     // 넣은 뒤 플레이헤드를 클립 끝으로 (연달아 넣기)
    sfxVolume: 80,             // 효과음 미리듣기 볼륨 (0~100)
    sfxNormalize: true,        // 효과음 넣을 때 레벨 자동 맞추기
    sfxTargetDb: -15,          // 목표 피크 레벨 (dB)
    sfxStopOnLeave: true,      // 탭을 옮기거나 패널을 벗어나면 미리듣기 정지
    myFolder: null,            // 내 파일 탭에서 마지막으로 본 폴더
    myFolders: [],             // 자주 쓰는 폴더 (최대 6개)
    lastUpdateCheck: 0         // 마지막으로 업데이트를 확인한 시각
    // 포커스 고정과 미리 불러오기는 끄면 사고가 나므로 설정으로 두지 않고 항상 켠다
  };

  function settingsDir() {
    return Eddie.platform.appSupportDir() || null;
  }

  function settingsFile() {
    var d = settingsDir();
    return d ? path.join(d, 'shared-settings.json') : null;
  }

  function defaultDownloadDir() {
    return Eddie.platform.defaultDownloadDir();
  }

  DEFAULTS.downloadDir = defaultDownloadDir();

  // ---------------- 파일 읽기 / 쓰기 ----------------
  function readFileJson() {
    var f = settingsFile();
    if (!fs || !f) return null;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { return null; }
  }

  function writeFileJson(obj) {
    var f = settingsFile();
    if (!fs || !f) return false;
    try {
      fs.mkdirSync(settingsDir(), { recursive: true });
      var tmp = f + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
      fs.renameSync(tmp, f);                 // 쓰다 말고 깨지는 일이 없게
      try { fs.chmodSync(f, 0o600); } catch (e) {}   // API 키가 들어 있으니 본인만 읽게
      return true;
    } catch (e) {
      console.warn('설정을 저장하지 못했습니다:', e.message);
      return false;
    }
  }

  /** 예전 localStorage 저장분에서 한 번만 옮겨온다 */
  function migrateFromLocalStorage() {
    var raw = null;
    try { raw = localStorage.getItem('eddieDrop.settings.v1') || localStorage.getItem('eddieSource.settings.v1'); }
    catch (e) {}
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) { return null; }
  }

  /** 잘못 저장된 file:///… 경로를 정리한다 */
  function cleanPath(p) {
    return p ? Eddie.platform.toLocalPath(p) : p;
  }

  // ---------------- 메모리 상태 ----------------
  var data = null;

  function load() {
    var s = JSON.parse(JSON.stringify(DEFAULTS));
    var file = readFileJson();

    if (file) {
      var sh = file.shared || {};
      SHARED_PROPS.forEach(function (k) {
        if (sh[k] !== undefined) s[k] = sh[k];
      });
      var app = (file.apps && file.apps[APP_ID]) || {};
      APP_PROPS.forEach(function (k) {
        if (app[k] !== undefined) s[k] = app[k];
      });
    } else {
      var old = migrateFromLocalStorage();
      if (old) {
        Object.keys(DEFAULTS).forEach(function (k) {
          if (old[k] !== undefined) s[k] = old[k];
        });
        if (/Eddie Source$/.test(s.downloadDir || '')) {
          s.downloadDir = s.downloadDir.replace(/Eddie Source$/, 'Eddie Drop');
        }
      }
    }

    if (!s.keys) s.keys = {};
    if (!s.downloadDir) s.downloadDir = defaultDownloadDir();

    // 폴더 선택 창이 돌려준 file:///… 형태가 저장돼 있으면 여기서 정리한다
    s.downloadDir = cleanPath(s.downloadDir);
    s.myFolder = s.myFolder ? cleanPath(s.myFolder) : s.myFolder;
    if (Array.isArray(s.myFolders)) s.myFolders = s.myFolders.map(cleanPath);

    return s;
  }

  function get() {
    if (!data) { data = load(); }
    return data;
  }

  function save() {
    var cur = get();
    // 다른 플러그인이 쓴 내용을 지우지 않도록 파일을 다시 읽고 내 부분만 고친다
    var file = readFileJson() || { version: 1, shared: {}, apps: {} };
    if (!file.shared) file.shared = {};
    if (!file.apps) file.apps = {};
    file.version = 1;

    SHARED_PROPS.forEach(function (k) { file.shared[k] = cur[k]; });

    var app = file.apps[APP_ID] || {};
    APP_PROPS.forEach(function (k) { app[k] = cur[k]; });
    file.apps[APP_ID] = app;

    return writeFileJson(file);
  }

  function set(prop, value) {
    get()[prop] = value;
    save();
  }

  function key(id) { return (get().keys[id] || '').trim(); }

  function setKey(id, value) {
    get().keys[id] = (value || '').trim();
    save();
  }

  function reset() {
    var file = readFileJson();
    if (file && file.apps) delete file.apps[APP_ID];
    if (file && file.shared) { file.shared.keys = {}; }
    if (file) writeFileJson(file);
    try {
      localStorage.removeItem('eddieDrop.settings.v1');
      localStorage.removeItem('eddieSource.settings.v1');
    } catch (e) {}
    data = load();
  }

  function ensureDir(dir) {
    if (!fs) return false;
    try { fs.mkdirSync(dir || get().downloadDir, { recursive: true }); return true; }
    catch (e) { return false; }
  }

  /**
   * 검색 소스가 필요한 API 키를 등록한다.
   * def: { id, label, desc, issueUrl, test(key) -> Promise<{ok, message}> }
   */
  function registerKey(def) {
    for (var i = 0; i < Eddie.keys.length; i++) {
      if (Eddie.keys[i].id === def.id) { Eddie.keys[i] = def; return; }
    }
    Eddie.keys.push(def);
    if (get().keys[def.id] === undefined) get().keys[def.id] = '';
  }

  global.Eddie.settings = {
    get: get,
    set: set,
    key: key,
    setKey: setKey,
    save: save,
    reset: reset,
    ensureDir: ensureDir,
    registerKey: registerKey,
    file: settingsFile,
    defaultDownloadDir: defaultDownloadDir
  };

})(window);
