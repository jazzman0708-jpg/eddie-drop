/*
 * Eddie Drop - 전역 객체
 * 모든 파일이 이 Eddie 안에 자기 기능을 붙인다.
 *
 * 버전은 plugin.json 한 곳에서만 관리한다.
 * (로더가 읽어서 EddieBoot.meta 로 넘겨준다)
 */
window.Eddie = window.Eddie || {
  version: (window.EddieBoot && window.EddieBoot.meta && window.EddieBoot.meta.version) || '0.0.0',
  name: 'Eddie Drop',
  panelId: 'com.eddie.drop.panel',   // 다른 에디 확장이 이 ID로 패널을 연다 (고정)
  keys: [],                          // 설정 탭에 표시할 API 키 정의
  tabs: []                           // 탭 정의
};
