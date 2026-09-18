/*
 * Eddie Drop - 운영체제별 처리 (Eddie.platform)
 *
 * 맥과 윈도우는 경로 규칙이 다르다. 여기 한 곳에서만 갈라놓고,
 * 나머지 코드는 이 함수들만 쓴다.
 *
 *              맥                                   윈도우
 *   설정 폴더  ~/Library/Application Support/Eddie   %APPDATA%\Eddie
 *   기본 저장  ~/Documents/Eddie Drop                %USERPROFILE%\Documents\Eddie Drop
 *   내 파일    ~/Movies                              %USERPROFILE%\Videos
 *   폴더 열기  open                                  explorer
 *   파일 주소  file:///Users/…                       file:///C:/Users/…
 */
(function (global) {
  'use strict';

  var os   = (typeof require === 'function') ? require('os') : null;
  var path = (typeof require === 'function') ? require('path') : null;
  var cp   = (typeof require === 'function') ? require('child_process') : null;

  var isWin = /^win/i.test((os && os.platform && os.platform()) || '') ||
              /Win/i.test(navigator.platform || '');
  var isMac = !isWin;

  function home() {
    return (os && os.homedir) ? os.homedir() : '';
  }

  /** 에디 플러그인들이 함께 쓰는 설정 폴더 */
  function appSupportDir() {
    if (!path) return '';
    if (isWin) {
      var appData = (typeof process !== 'undefined' && process.env &&
                     (process.env.APPDATA || process.env.appdata));
      return path.join(appData || path.join(home(), 'AppData', 'Roaming'), 'Eddie');
    }
    return path.join(home(), 'Library', 'Application Support', 'Eddie');
  }

  /** 받은 파일을 넣어둘 기본 폴더 */
  function defaultDownloadDir() {
    if (!path) return isWin ? '%USERPROFILE%\\Documents\\Eddie Drop' : '~/Documents/Eddie Drop';
    return path.join(home(), 'Documents', 'Eddie Drop');
  }

  /** '내 파일' 탭이 처음 보여줄 폴더 */
  function defaultMediaDir() {
    if (!path) return '';
    return path.join(home(), isWin ? 'Videos' : 'Movies');
  }

  /**
   * 로컬 경로 → file:// 주소
   *   맥   /Users/eddie/a.mp4   → file:///Users/eddie/a.mp4
   *   윈도 C:\Users\eddie\a.mp4 → file:///C:/Users/eddie/a.mp4
   */
  function fileUrl(p) {
    if (!p) return '';
    var s = String(p).replace(/\\/g, '/');
    if (s.charAt(0) !== '/') s = '/' + s;          // 윈도우 드라이브 문자 앞에 / 를 붙인다
    return 'file://' + encodeURI(s);
  }

  /**
   * CEP 선택 창이 돌려준 값을 진짜 경로로 되돌린다.
   *   file:///Users/…/%EB%B0%94%EB%8B%A4 → /Users/…/바다
   *   file:///C:/Users/…                 → C:\Users\…
   */
  function toLocalPath(p) {
    if (!p) return p;
    var out = String(p).trim();
    out = out.replace(/^file:\/\/(localhost)?/i, '');
    if (out.indexOf('%') >= 0) {
      try { out = decodeURIComponent(out); } catch (e) {}
    }
    if (isWin) {
      out = out.replace(/^\/([a-zA-Z]:)/, '$1');   // /C:/… → C:/…
      out = out.replace(/\//g, '\\');
    }
    return out;
  }

  /** 탐색기 / 파인더로 폴더 열기 */
  function openFolder(p) {
    if (!p || !cp) return false;
    try {
      if (isWin) cp.exec('explorer ' + JSON.stringify(p.replace(/\//g, '\\')));
      else cp.exec('open ' + JSON.stringify(p));
      return true;
    } catch (e) { return false; }
  }

  global.Eddie.platform = {
    isWin: isWin,
    isMac: isMac,
    home: home,
    appSupportDir: appSupportDir,
    defaultDownloadDir: defaultDownloadDir,
    defaultMediaDir: defaultMediaDir,
    fileUrl: fileUrl,
    toLocalPath: toLocalPath,
    openFolder: openFolder
  };

})(window);
