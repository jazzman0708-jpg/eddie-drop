/*
 * Eddie Drop - 오디오 레벨 맞추기 (Eddie.audioLevel)
 *
 * 받아온 효과음 파일을 열어 가장 큰 소리(피크)가 몇 dB인지 재고,
 * 목표치(-15dB 기본)에 맞추려면 클립 볼륨을 얼마나 올리거나 내려야 하는지 계산한다.
 *
 * 프리미어의 클립 볼륨(Level)은 0~1 실수로 저장되고 1.0 이 +15dB 다.
 *   level = 10 ^ ((dB - 15) / 20)
 */
(function (global) {
  'use strict';

  var fs = (typeof require === 'function') ? require('fs') : null;

  var ctx = null;
  var cache = {};              // 파일경로 → 피크 dB (같은 파일을 두 번 재지 않게)
  var MAX_SECONDS = 120;       // 너무 긴 파일은 앞부분만 본다

  function audioCtx() {
    if (ctx) return ctx;
    var C = global.AudioContext || global.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    return ctx;
  }

  function toArrayBuffer(buf) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  /** 파일의 피크를 dBFS 로 잰다 → Promise<number> (소리가 없으면 -Infinity) */
  function peakDb(path) {
    if (cache[path] !== undefined) return Promise.resolve(cache[path]);

    return new Promise(function (resolve, reject) {
      if (!fs) { reject(new Error('Node.js 를 쓸 수 없습니다.')); return; }
      var C = audioCtx();
      if (!C) { reject(new Error('이 환경에서는 소리를 분석할 수 없습니다.')); return; }

      var raw;
      try { raw = toArrayBuffer(fs.readFileSync(path)); }
      catch (e) { reject(new Error('파일을 읽지 못했습니다: ' + e.message)); return; }

      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error('소리 분석이 너무 오래 걸립니다.')); }
      }, 20000);

      C.decodeAudioData(raw, function (buf) {
        if (done) return;
        done = true;
        clearTimeout(timer);

        var limit = Math.min(buf.length, Math.floor(buf.sampleRate * MAX_SECONDS));
        var peak = 0;

        for (var ch = 0; ch < buf.numberOfChannels; ch++) {
          var data = buf.getChannelData(ch);
          for (var i = 0; i < limit; i++) {
            var v = data[i];
            if (v < 0) v = -v;
            if (v > peak) peak = v;
          }
        }

        var db = (peak > 0) ? (20 * Math.log(peak) * Math.LOG10E) : -Infinity;
        cache[path] = db;
        resolve(db);

      }, function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('소리 형식을 읽지 못했습니다.'));
      });
    });
  }

  /**
   * 목표 dB 에 맞추기 위해 클립 볼륨을 몇 dB 로 둘지 계산한다.
   * → Promise<{ gainDb, peakDb }>
   *   gainDb : 클립 볼륨에 넣을 값 (+올리기 / -내리기)
   */
  function gainFor(path, targetDb) {
    var target = (targetDb === undefined || targetDb === null) ? -15 : targetDb;

    return peakDb(path).then(function (peak) {
      if (!isFinite(peak)) return { gainDb: 0, peakDb: peak, silent: true };

      var gain = target - peak;

      // 프리미어 클립 볼륨은 최대 +15dB 다. 그 아래로도 너무 내리지 않는다.
      if (gain > 15) gain = 15;
      if (gain < -60) gain = -60;

      return { gainDb: Math.round(gain * 10) / 10, peakDb: Math.round(peak * 10) / 10, silent: false };
    });
  }

  /** dB → 프리미어 Level 값 (참고용, 실제 변환은 jsx 에서 한다) */
  function dbToLevel(db) { return Math.pow(10, (db - 15) / 20); }

  global.Eddie.audioLevel = {
    peakDb: peakDb,
    gainFor: gainFor,
    dbToLevel: dbToLevel
  };

})(window);
