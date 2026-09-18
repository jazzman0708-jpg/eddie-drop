/*
 * Eddie Drop - Freesound (효과음)
 * 문서: https://freesound.org/docs/api/
 *   검색 GET https://freesound.org/apiv2/search/
 *        (구 search/text/ 는 2025-11 폐기)
 *   인증 token=<API_KEY>
 *
 * 중요
 *   - 라이선스는 CC0만 검색한다. filter 에 항상 license:"Creative Commons 0" 를 붙이고
 *     사용자가 끌 수 없게 한다. (출처 표기 없이 쓸 수 있는 소리만)
 *   - API 키(token)로는 미리듣기 파일(preview-hq-mp3)만 받을 수 있다.
 *     원본 파일은 OAuth2 로그인이 필요하다. → README 참고
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var SEARCH_URL = 'https://freesound.org/apiv2/search/';
  var FIELDS = 'id,name,tags,duration,previews,username,license,images';
  var CC0 = 'license:"Creative Commons 0"';     // 절대 빼지 않는다
  var TTL = 6 * 60 * 60 * 1000;

  var DURATION = {
    short:  'duration:[0 TO 3]',
    medium: 'duration:[3 TO 15]',
    long:   'duration:[15 TO 120]'
  };

  function explain(res) {
    var detail = res.json && (res.json.detail || res.json.message);
    if (res.status === 401 || res.status === 403) {
      return 'Freesound API 키가 맞지 않습니다. 설정 탭에서 다시 확인해 주세요.' +
             (detail ? ' (' + detail + ')' : '');
    }
    if (res.status === 429) return 'Freesound 요청 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요.';
    if (res.status === 404) return 'Freesound 검색 주소를 찾지 못했습니다.';
    if (res.status >= 500) return 'Freesound 서버 오류입니다 (' + res.status + '). 잠시 뒤 다시 시도해 주세요.';
    return 'Freesound 요청이 실패했습니다 (HTTP ' + res.status + ')' + (detail ? ' — ' + detail : '');
  }

  /**
   * p: { query, page, pageSize, tags: [], duration: ''|'short'|'medium'|'long', sort }
   */
  function search(p) {
    var filters = [CC0];

    (p.tags || []).forEach(function (t) {
      if (t) filters.push('tag:' + String(t).replace(/\s+/g, '-'));
    });
    if (p.duration && DURATION[p.duration]) filters.push(DURATION[p.duration]);

    var params = Eddie.net.qs({
      query: p.query || '',
      filter: filters.join(' '),
      fields: FIELDS,
      sort: p.sort || 'score',
      page: p.page || 1,
      page_size: Math.min(150, p.pageSize || 30),
      token: Eddie.settings.key('freesound')
    });

    var ck = 'freesound:' + params.replace(/token=[^&]*&?/, '');
    var cached = Eddie.cache.get(ck, TTL);
    if (cached) return Promise.resolve(cached);

    return Eddie.net.getJson(SEARCH_URL + '?' + params).then(function (res) {
      if (res.status < 200 || res.status >= 300) throw new Error(explain(res));
      var d = res.json || {};
      var out = {
        // 서버 필터가 혹시 새더라도 CC0 아닌 것은 여기서 한 번 더 버린다
        items: (d.results || []).map(normalize).filter(function (x) { return !!x && isCC0(x.license); }),
        total: d.count || 0,
        hasMore: !!d.next
      };
      Eddie.cache.set(ck, out);
      return out;
    });
  }

  /** CC0 인지 확인 (Freesound 는 license 를 주소로 준다) */
  function isCC0(license) {
    var t = String(license || '').toLowerCase();
    return t.indexOf('publicdomain/zero') >= 0 || t.indexOf('creative commons 0') >= 0 || t.indexOf('cc0') >= 0;
  }

  function normalize(s) {
    var pv = s.previews || {};
    var url = pv['preview-hq-mp3'] || pv['preview-lq-mp3'];
    if (!url) return null;                       // 미리듣기가 없으면 쓸 수 없다

    var img = s.images || {};

    return {
      source: 'freesound',
      sourceName: 'Freesound',
      type: 'audio',
      id: s.id,
      title: s.name || ('소리 ' + s.id),
      pageUrl: 'https://freesound.org/s/' + s.id + '/',
      author: { name: s.username || '', url: 'https://freesound.org/people/' + (s.username || '') + '/' },
      duration: s.duration || 0,
      tags: s.tags || [],
      license: s.license || '',
      waveform: img.waveform_m || img.waveform_l || '',
      preview: url,
      files: [{ url: url, ext: 'mp3' }],
      ext: 'mp3'
    };
  }

  function pickFile(item) { return (item.files || [])[0]; }

  SS.isCC0 = isCC0;

  SS.adapters.freesound = {
    id: 'freesound',
    name: 'Freesound',
    url: 'https://freesound.org',
    search: search,
    pickFile: pickFile,

    keyDef: {
      id: 'freesound',
      label: 'Freesound',
      desc: '효과음',
      issueUrl: 'https://freesound.org/apiv2/apply/',
      test: function (key) {
        return Eddie.net.getJson(SEARCH_URL + '?' + Eddie.net.qs({
          query: 'pop', page_size: 1, token: key, fields: 'id,name', filter: CC0
        })).then(function (res) {
          if (res.status >= 200 && res.status < 300) return { ok: true, message: '연결 성공' };
          return { ok: false, message: '실패: ' + explain(res) };
        });
      }
    }
  };

})(window);
