/*
 * 소스 검색 모듈 - Pexels
 * 문서: https://www.pexels.com/api/documentation/
 *   이미지 GET https://api.pexels.com/v1/search
 *   영상   GET https://api.pexels.com/videos/search
 *   인증   헤더 Authorization: <API_KEY>
 *   한도   시간당 200회 / 월 20,000회
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var PHOTO_URL = 'https://api.pexels.com/v1/search';
  // 문서 표기가 갈려서 두 경로를 다 시도하고, 되는 쪽을 기억해 둔다.
  var VIDEO_URLS = ['https://api.pexels.com/videos/search', 'https://api.pexels.com/v1/videos/search'];
  var VIDEO_URL_KEY = 'eddieDrop.pexels.videoEndpoint';

  var CACHE_TTL = 6 * 60 * 60 * 1000;   // 6시간 (요청 수 절약)

  function headers() { return { Authorization: Eddie.settings.key('pexels') }; }

  function explain(res) {
    if (res.status === 401 || res.status === 403) return 'Pexels API 키가 맞지 않습니다. 설정 탭에서 확인해 주세요.';
    if (res.status === 429) {
      var reset = res.headers['x-ratelimit-reset'];
      var when = '';
      if (reset) {
        var mins = Math.max(1, Math.round((parseInt(reset, 10) * 1000 - Date.now()) / 60000));
        when = ' 약 ' + mins + '분 뒤에 풀립니다.';
      }
      return 'Pexels 요청 한도를 넘었습니다(시간당 200회).' + when;
    }
    if (res.status >= 500) return 'Pexels 서버 오류입니다 (' + res.status + '). 잠시 뒤 다시 시도해 주세요.';
    return 'Pexels 요청이 실패했습니다 (HTTP ' + res.status + ')';
  }

  function rateInfo(res) {
    var r = res.headers['x-ratelimit-remaining'];
    return (r === undefined) ? null : { remaining: parseInt(r, 10), reset: res.headers['x-ratelimit-reset'] };
  }

  // 공통 색 이름 → Pexels 값
  var COLOR = {
    red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', turquoise: 'turquoise',
    blue: 'blue', violet: 'violet', pink: 'pink', brown: 'brown', black: 'black',
    gray: 'gray', white: 'white'
  };

  // ---------------- 이미지 ----------------
  function searchPhotos(p) {
    var url = PHOTO_URL + '?' + Eddie.net.qs({
      query: p.query,
      page: p.page || 1,
      per_page: p.perPage || 30,
      orientation: p.orientation,
      size: p.size,
      color: COLOR[p.color] || '',
      locale: 'ko-KR'
    });

    var ck = 'pexels:image:' + url;
    var hit = Eddie.cache.get(ck, CACHE_TTL);
    if (hit) return Promise.resolve(hit);

    return Eddie.net.getJson(url, { headers: headers() }).then(function (res) {
      if (res.status < 200 || res.status >= 300) throw new Error(explain(res));
      var d = res.json || {};
      var out = {
        items: (d.photos || []).map(normalizePhoto),
        total: d.total_results || 0,
        hasMore: !!d.next_page,
        rate: rateInfo(res)
      };
      Eddie.cache.set(ck, out);
      return out;
    });
  }

  function normalizePhoto(p) {
    var src = p.src || {};
    return {
      source: 'pexels',
      sourceName: 'Pexels',
      type: 'image',
      id: p.id,
      title: p.alt || ('Pexels ' + p.id),
      pageUrl: p.url,
      author: { name: p.photographer, url: p.photographer_url },
      width: p.width,
      height: p.height,
      thumb: src.medium || src.small || src.tiny,
      files: [
        { label: '원본', url: src.original, width: p.width, height: p.height, ext: 'jpg' },
        { label: 'Large 2x', url: src.large2x, ext: 'jpg' },
        { label: 'Large', url: src.large, ext: 'jpg' }
      ].filter(function (f) { return !!f.url; }),
      ext: 'jpg'
    };
  }

  // ---------------- 영상 ----------------
  function searchVideos(p) {
    var params = Eddie.net.qs({
      query: p.query,
      page: p.page || 1,
      per_page: p.perPage || 24,
      orientation: p.orientation,
      size: p.size,
      locale: 'ko-KR'
    });

    var ck = 'pexels:video:' + params;
    var hit = Eddie.cache.get(ck, CACHE_TTL);
    if (hit) return Promise.resolve(hit);

    var known = localStorage.getItem(VIDEO_URL_KEY);
    var order = known ? [known].concat(VIDEO_URLS.filter(function (u) { return u !== known; })) : VIDEO_URLS.slice();

    function attempt(i) {
      return Eddie.net.getJson(order[i] + '?' + params, { headers: headers() }).then(function (res) {
        if (res.status === 404 && i + 1 < order.length) return attempt(i + 1);
        if (res.status < 200 || res.status >= 300) throw new Error(explain(res));
        localStorage.setItem(VIDEO_URL_KEY, order[i]);
        var d = res.json || {};
        var out = {
          items: (d.videos || []).map(normalizeVideo),
          total: d.total_results || 0,
          hasMore: !!d.next_page,
          rate: rateInfo(res)
        };
        Eddie.cache.set(ck, out);
        return out;
      });
    }
    return attempt(0);
  }

  function normalizeVideo(v) {
    var files = (v.video_files || [])
      .filter(function (f) { return f.link && (!f.file_type || f.file_type.indexOf('mp4') >= 0) && f.quality !== 'hls'; })
      .map(function (f) {
        return {
          label: (f.width && f.height) ? (f.width + '×' + f.height) : (f.quality || ''),
          url: f.link,
          width: f.width || 0,
          height: f.height || 0,
          fps: f.fps ? Math.round(f.fps * 100) / 100 : null,
          ext: 'mp4'
        };
      })
      .sort(function (a, b) { return b.width - a.width; });

    var top = files[0] || {};
    return {
      source: 'pexels',
      sourceName: 'Pexels',
      type: 'video',
      id: v.id,
      title: 'Pexels 영상 ' + v.id,
      pageUrl: v.url,
      author: { name: v.user ? v.user.name : '', url: v.user ? v.user.url : '' },
      width: v.width || top.width,
      height: v.height || top.height,
      duration: v.duration || 0,
      fps: top.fps,
      thumb: v.image,
      previewVideo: pickPreview(files),
      files: files,
      ext: 'mp4'
    };
  }

  function pickPreview(files) {
    if (!files.length) return null;
    var asc = files.slice().sort(function (a, b) { return a.width - b.width; });
    for (var i = 0; i < asc.length; i++) if (asc[i].width >= 640) return asc[i].url;
    return asc[0].url;
  }

  /** 설정 화질에 맞는 파일 고르기 (fps 필터가 켜져 있으면 그 fps 우선) */
  function pickFile(item, quality) {
    var files = item.files || [];
    if (!files.length) return null;
    if (item.type === 'image') return files[0];

    if (item.__wantFps) {
      var r = item.__wantFps;
      var matched = files.filter(function (f) { return f.fps && f.fps >= r.min && f.fps <= r.max; });
      if (matched.length) files = matched;
    }

    var targets = { '4k': 999999, fhd: 1920, hd: 1280 };
    var want = targets[quality] || 1920;

    var under = files.filter(function (f) { return f.width && f.width <= want; });
    if (under.length) return under[0];        // 큰 것부터 정렬돼 있음
    return files[files.length - 1];
  }

  // ---------------- 어댑터 ----------------
  SS.adapters.pexels = {
    id: 'pexels',
    name: 'Pexels',
    url: 'https://www.pexels.com',
    supports: {
      orientation: { video: true, image: true, square: true },
      size: true,
      color: true,
      fps: true,             // 응답에 fps가 있어 패널에서 걸러낼 수 있다
      category: false,
      imageType: false,
      videoType: false,
      order: false
    },
    search: function (kind, params) {
      return (kind === 'video') ? searchVideos(params) : searchPhotos(params);
    },
    pickFile: pickFile,

    keyDef: {
      id: 'pexels',
      label: 'Pexels',
      desc: '영상 · 이미지',
      issueUrl: 'https://www.pexels.com/api/',
      test: function (key) {
        return Eddie.net.getJson('https://api.pexels.com/v1/search?query=sea&per_page=1',
                                 { headers: { Authorization: key } })
          .then(function (res) {
            if (res.status >= 200 && res.status < 300) {
              var left = res.headers['x-ratelimit-remaining'];
              return { ok: true, message: '연결 성공' + (left !== undefined ? ' · 남은 요청 ' + left + '회' : '') };
            }
            return { ok: false, message: '실패: ' + explain(res) };
          });
      }
    }
  };

})(window);
