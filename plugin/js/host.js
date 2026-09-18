/*
 * Eddie Drop - 프리미어 호출 다리 (Eddie.host)
 * ExtendScript 쪽은 전역 함수 ED_call(기능, JSON) 하나로만 통한다.
 *   Eddie.host.core('ping')  →  EddieDrop.core.ping
 */
(function (global) {
  'use strict';

  var cs = new CSInterface();

  function lit(v) { return JSON.stringify(String(v)); }

  function call(fn, args) {
    return new Promise(function (resolve, reject) {
      var script = 'ED_call(' + lit(fn) + ',' + JSON.stringify(JSON.stringify(args || {})) + ')';
      cs.evalScript(script, function (raw) {
        if (raw === 'EvalScript error.') {
          reject(new Error('프리미어 스크립트 오류 (' + fn + ')'));
          return;
        }
        var parsed;
        try { parsed = JSON.parse(raw); }
        catch (e) {
          reject(new Error('응답을 읽지 못했습니다: ' + String(raw).slice(0, 140)));
          return;
        }
        if (parsed && parsed.ok) resolve(parsed.data);
        else reject(new Error((parsed && parsed.error) || '알 수 없는 오류'));
      });
    });
  }

  global.Eddie.host = {
    cs: cs,

    core: function (fn, args) { return call(fn, args); },

    /** 확장이 설치된 폴더 */
    extensionPath: function () {
      return cs.getSystemPath(SystemPath.EXTENSION);
    },

    /** 이 패널의 확장 ID */
    extensionId: function () {
      try { return cs.getExtensionID(); } catch (e) { return ''; }
    },

    /**
     * 이 패널을 다시 활성화한다 (새로고침되지 않고 포커스만 돌아온다 — 실기기 확인함).
     * 불러오기 때문에 포커스가 프로젝트/소스 패널로 넘어갔을 때 쓴다.
     */
    activatePanel: function () {
      try { cs.requestOpenExtension(Eddie.panelId, ''); return true; }
      catch (e) { return false; }
    },

    /** 다른 에디 확장을 연다 (나중에 대시보드에서 이 패널을 열 때 쓰는 것과 같은 방식) */
    openPanel: function (extensionId, params) {
      try { cs.requestOpenExtension(extensionId, params || ''); return true; }
      catch (e) { return false; }
    },

    openUrl: function (url) { cs.openURLInDefaultBrowser(url); }
  };

})(window);
