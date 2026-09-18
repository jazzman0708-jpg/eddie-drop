/*
 * Eddie Drop - 검색 결과 캐시 (Eddie.cache)
 * Pixabay는 "응답을 24시간 캐시해야 한다"는 규정이 있어서 반드시 필요하다.
 * (Pexels도 같은 방식으로 캐시해서 요청 수를 아낀다)
 */
(function (global) {
  'use strict';

  var STORE = 'eddieDrop.cache.v1';
  var MAX_ENTRIES = 40;          // localStorage 용량을 넘지 않게
  var DAY = 24 * 60 * 60 * 1000;

  function read() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); }
    catch (e) { return {}; }
  }

  function write(map) {
    try { localStorage.setItem(STORE, JSON.stringify(map)); }
    catch (e) {
      // 용량이 꽉 찼으면 절반을 버리고 다시 시도
      try {
        var keys = Object.keys(map).sort(function (a, b) { return map[a].t - map[b].t; });
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(function (k) { delete map[k]; });
        localStorage.setItem(STORE, JSON.stringify(map));
      } catch (e2) {
        try { localStorage.removeItem(STORE); } catch (e3) {}
      }
    }
  }

  /** 살아 있는 캐시면 값을, 아니면 null */
  function get(key, ttl) {
    var map = read();
    var hit = map[key];
    if (!hit) return null;
    if (Date.now() - hit.t > (ttl || DAY)) {
      delete map[key];
      write(map);
      return null;
    }
    return hit.v;
  }

  function set(key, value) {
    var map = read();
    map[key] = { t: Date.now(), v: value };

    var keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
      keys.sort(function (a, b) { return map[a].t - map[b].t; })
          .slice(0, keys.length - MAX_ENTRIES)
          .forEach(function (k) { delete map[k]; });
    }
    write(map);
  }

  function clear() {
    try { localStorage.removeItem(STORE); } catch (e) {}
  }

  function count() {
    return Object.keys(read()).length;
  }

  global.Eddie.cache = { get: get, set: set, clear: clear, count: count, DAY: DAY };

})(window);
