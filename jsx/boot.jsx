/*
 * Eddie Drop - 프리미어 쪽 시작 파일 (확장 껍데기)
 *
 * 하는 일은 하나다: 사용자 폴더에 있는 host.jsx 를 불러오는 것.
 *
 * 주의 —
 *   $.evalFile 은 "불린 자리의 범위"에서 실행된다.
 *   함수 안에서 부르면 host.jsx 안의 함수들이 그 함수 안에만 생기고 밖에서는 안 보인다.
 *   그래서 로더는 $.evalFile 을 최상위(전역)에서 직접 부르고,
 *   여기 있는 함수들은 확인·보고만 맡는다.
 */

/** 패널이 프리미어와 이야기할 수 있는지 확인용 */
function ED_bootPing() {
    return '{"ok":true,"boot":true}';
}

/** 파일이 있는지 미리 확인 (없으면 evalFile 을 부르지 않는다) */
function ED_fileExists(path) {
    try { return (new File(path)).exists ? '1' : '0'; }
    catch (e) { return '0'; }
}

/**
 * 불러오기가 끝난 뒤 결과를 알려준다.
 * err 가 비어 있고 ED_call 이 전역에 생겼으면 성공이다.
 */
function ED_bootResult(err) {
    function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
    if (err) return '{"ok":false,"error":"' + esc(err) + '"}';
    if (typeof ED_call !== 'function') {
        return '{"ok":false,"error":"기능 파일을 읽었지만 ED_call 이 없습니다."}';
    }
    return '{"ok":true}';
}
