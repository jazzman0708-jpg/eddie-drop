/*
 * 소스 검색 모듈 - GIPHY (GIF · 스티커)
 * 문서: https://developers.giphy.com/docs/api/
 *   GIF    GET https://api.giphy.com/v1/gifs/search
 *   스티커 GET https://api.giphy.com/v1/stickers/search
 *   인증   api_key 쿼리 파라미터
 *   limit  베타 키 기준 최대 50
 *
 * 약관 관련
 *   - 패널에 "Powered by GIPHY" 를 눈에 띄게 표기해야 한다
 *   - GIPHY 결과를 다른 사이트 결과와 같은 그리드에 섞지 않는다 (탭을 따로 둔 이유)
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var GIF_URL     = 'https://api.giphy.com/v1/gifs/search';
  var STICKER_URL = 'https://api.giphy.com/v1/stickers/search';
  var TTL = 6 * 60 * 60 * 1000;

  function explain(res) {
    var msg = res.json && res.json.meta && res.json.meta.msg;
    if (res.status === 401 || res.status === 403) return 'GIPHY API 키가 맞지 않습니다. 설정 탭에서 확인해 주세요.';
    if (res.status === 429) return 'GIPHY 요청 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요.';
    if (res.status === 400) return 'GIPHY 요청이 거절됐습니다' + (msg ? ' (' + msg + ')' : '') + '.';
    if (res.status >= 500) return 'GIPHY 서버 오류입니다 (' + res.status + '). 잠시 뒤 다시 시도해 주세요.';
    return 'GIPHY 요청이 실패했습니다 (HTTP ' + res.status + ')';
  }

  function num(v) { return parseInt(v, 10) || 0; }

  /**
   * kind: 'gif' | 'sticker'
   * p: { query, offset, limit, rating }
   */
  function search(kind, p) {
    var isSticker = (kind === 'sticker');
    var params = Eddie.net.qs({
      api_key: Eddie.settings.key('giphy'),
      q: p.query,
      limit: Math.min(50, p.limit || 30),
      offset: p.offset || 0,
      rating: p.rating || 'g',
      lang: 'ko',
      bundle: 'messaging_non_clips'
    });

    var ck = 'giphy:' + kind + ':' + params.replace(/api_key=[^&]*&?/, '');
    var cached = Eddie.cache.get(ck, TTL);
    if (cached) return Promise.resolve(cached);

    return Eddie.net.getJson((isSticker ? STICKER_URL : GIF_URL) + '?' + params).then(function (res) {
      if (res.status < 200 || res.status >= 300) throw new Error(explain(res));
      var d = res.json || {};
      var pag = d.pagination || {};
      var out = {
        items: (d.data || []).map(function (g) { return normalize(g, isSticker); })
                             .filter(function (x) { return !!x; }),
        total: pag.total_count || 0,
        hasMore: (num(pag.offset) + num(pag.count)) < num(pag.total_count),
        nextOffset: num(pag.offset) + num(pag.count)
      };
      Eddie.cache.set(ck, out);
      return out;
    });
  }

  function normalize(g, isSticker) {
    var im = g.images || {};
    var orig = im.original || {};

    // 화면에 보여줄 움직이는 미리보기 (가벼운 것부터)
    var fw = im.fixed_width || im.fixed_height || orig;
    var preview = fw.webp || fw.url || orig.url;
    if (!preview) return null;

    // 받을 파일
    //  - GIF 탭     : mp4 가 프리미어에서 훨씬 가볍다
    //  - 스티커 탭  : 투명 배경이 필요하므로 GIF 원본
    var file;
    if (isSticker) {
      if (!orig.url) return null;
      file = { url: orig.url, ext: 'gif', width: num(orig.width), height: num(orig.height) };
    } else if (orig.mp4) {
      file = { url: orig.mp4, ext: 'mp4', width: num(orig.width), height: num(orig.height) };
    } else if (orig.url) {
      file = { url: orig.url, ext: 'gif', width: num(orig.width), height: num(orig.height) };
    } else {
      return null;
    }

    var author = g.username || (g.user && (g.user.display_name || g.user.username)) || '';

    return {
      source: 'giphy',
      sourceName: 'GIPHY',
      type: isSticker ? 'sticker' : 'gif',
      tile: isSticker ? 'sq' : 'wide',
      fit: isSticker ? 'contain' : 'cover',
      alpha: isSticker,               // 투명 배경 → 체크무늬로 보여준다
      id: g.id,
      title: g.title || g.alt_text || (isSticker ? '스티커' : 'GIF'),
      pageUrl: g.url,
      author: { name: author, url: (g.user && g.user.profile_url) || 'https://giphy.com' },
      width: num(orig.width),
      height: num(orig.height),
      badge: (file.ext === 'mp4') ? 'MP4' : 'GIF',
      thumb: preview,
      animated: true,
      files: [file],
      ext: file.ext
    };
  }

  function pickFile(item) {
    return (item.files || [])[0];
  }

  SS.adapters.giphy = {
    id: 'giphy',
    name: 'GIPHY',
    url: 'https://giphy.com',
    search: search,
    pickFile: pickFile,

    keyDef: {
      id: 'giphy',
      label: 'GIPHY',
      desc: 'GIF · 스티커',
      issueUrl: 'https://developers.giphy.com/dashboard/',
      test: function (key) {
        return Eddie.net.getJson(GIF_URL + '?' + Eddie.net.qs({ api_key: key, q: 'hi', limit: 1 }))
          .then(function (res) {
            if (res.status >= 200 && res.status < 300) return { ok: true, message: '연결 성공' };
            return { ok: false, message: '실패: ' + explain(res) };
          });
      }
    }
  };

})(window);
