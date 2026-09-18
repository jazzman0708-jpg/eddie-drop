/*
 * 소스 검색 모듈 - Pixabay
 * 문서: https://pixabay.com/api/docs/
 *   이미지 GET https://pixabay.com/api/
 *   영상   GET https://pixabay.com/api/videos/
 *   인증   key 쿼리 파라미터
 *   한도   60초당 100회
 *   규정   ① 응답은 24시간 캐시해야 한다
 *          ② 이미지 핫링크 금지 → 썸네일도 로컬에 받아서 쓴다
 */
(function (global) {
  'use strict';

  var SS = global.Sources = global.Sources || { adapters: {} };

  var IMAGE_URL = 'https://pixabay.com/api/';
  var VIDEO_URL = 'https://pixabay.com/api/videos/';
  var TTL = 24 * 60 * 60 * 1000;          // 규정상 24시간

  function explain(res) {
    if (res.status === 400) {
      var t = (res.text || '').slice(0, 100);
      if (/invalid api key/i.test(t)) return 'Pixabay API 키가 맞지 않습니다. 설정 탭에서 확인해 주세요.';
      return 'Pixabay 요청이 거절됐습니다' + (t ? ' (' + t + ')' : '') + '.';
    }
    if (res.status === 401 || res.status === 403) return 'Pixabay API 키가 맞지 않습니다. 설정 탭에서 확인해 주세요.';
    if (res.status === 429) return 'Pixabay 요청 한도를 넘었습니다(60초당 100회). 잠시 뒤 다시 시도해 주세요.';
    if (res.status >= 500) return 'Pixabay 서버 오류입니다 (' + res.status + '). 잠시 뒤 다시 시도해 주세요.';
    return 'Pixabay 요청이 실패했습니다 (HTTP ' + res.status + ')';
  }

  function rateInfo(res) {
    var r = res.headers['x-ratelimit-remaining'];
    return (r === undefined) ? null : { remaining: parseInt(r, 10), reset: res.headers['x-ratelimit-reset'] };
  }

  // 공통 값 → Pixabay 값
  var ORIENT = { landscape: 'horizontal', portrait: 'vertical', square: '' };   // 정사각은 없음
  var MINWIDTH = { large: 3840, medium: 1920, small: 1280 };
  var COLOR = {
    red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', turquoise: 'turquoise',
    blue: 'blue', violet: 'lilac', pink: 'pink', brown: 'brown', black: 'black',
    gray: 'gray', white: 'white', transparent: 'transparent', grayscale: 'grayscale'
  };

  function userUrl(hit) {
    return hit.user_id ? ('https://pixabay.com/users/' + hit.user + '-' + hit.user_id + '/') : 'https://pixabay.com/';
  }

  // ---------------- 이미지 ----------------
  function searchImages(p) {
    var params = Eddie.net.qs({
      key: Eddie.settings.key('pixabay'),
      q: p.query,
      lang: 'ko',
      image_type: p.imageType || 'all',
      orientation: ORIENT[p.orientation] || 'all',
      category: p.category,
      colors: COLOR[p.color] || '',
      min_width: MINWIDTH[p.size] || 0,
      order: p.order || 'popular',
      editors_choice: p.editorsChoice ? 'true' : '',
      safesearch: p.safesearch === false ? '' : 'true',
      page: p.page || 1,
      per_page: Math.max(3, p.perPage || 30)
    });

    var ck = 'pixabay:image:' + params.replace(/key=[^&]*&?/, '');
    var cached = Eddie.cache.get(ck, TTL);
    if (cached) return Promise.resolve(cached);

    return Eddie.net.getJson(IMAGE_URL + '?' + params).then(function (res) {
      if (res.status < 200 || res.status >= 300) throw new Error(explain(res));
      var d = res.json || {};
      var perPage = Math.max(3, p.perPage || 30);
      var out = {
        items: (d.hits || []).map(normalizeImage),
        total: d.totalHits || 0,
        hasMore: (d.hits || []).length >= perPage,
        rate: rateInfo(res)
      };
      Eddie.cache.set(ck, out);
      return out;
    });
  }

  function normalizeImage(h) {
    return {
      source: 'pixabay',
      sourceName: 'Pixabay',
      type: 'image',
      id: h.id,
      title: h.tags || ('Pixabay ' + h.id),
      pageUrl: h.pageURL,
      author: { name: h.user, url: userUrl(h) },
      width: h.imageWidth,
      height: h.imageHeight,
      tags: h.tags,
      thumb: h.webformatURL,
      thumbNeedsCache: true,              // 핫링크 금지 → 로컬에 받아서 표시
      files: [
        { label: '원본', url: h.imageURL || h.fullHDURL || h.largeImageURL, width: h.imageWidth, height: h.imageHeight, ext: 'jpg' },
        { label: 'Large', url: h.largeImageURL, width: 1280, ext: 'jpg' },
        { label: 'Web', url: h.webformatURL, width: h.webformatWidth, ext: 'jpg' }
      ].filter(function (f) { return !!f.url; }),
      ext: 'jpg'
    };
  }

  // ---------------- 영상 ----------------
  function searchVideos(p) {
    var params = Eddie.net.qs({
      key: Eddie.settings.key('pixabay'),
      q: p.query,
      lang: 'ko',
      video_type: p.videoType || 'all',
      category: p.category,
      min_width: MINWIDTH[p.size] || 0,
      order: p.order || 'popular',
      editors_choice: p.editorsChoice ? 'true' : '',
      safesearch: p.safesearch === false ? '' : 'true',
      page: p.page || 1,
      per_page: Math.max(3, p.perPage || 24)
    });

    var ck = 'pixabay:video:' + params.replace(/key=[^&]*&?/, '');
    var cached = Eddie.cache.get(ck, TTL);
    if (cached) return Promise.resolve(cached);

    return Eddie.net.getJson(VIDEO_URL + '?' + params).then(function (res) {
      if (res.status < 200 || res.status >= 300) throw new Error(explain(res));
      var d = res.json || {};
      var perPage = Math.max(3, p.perPage || 24);
      var out = {
        items: (d.hits || []).map(normalizeVideo).filter(function (x) { return !!x; }),
        total: d.totalHits || 0,
        hasMore: (d.hits || []).length >= perPage,
        rate: rateInfo(res)
      };
      Eddie.cache.set(ck, out);
      return out;
    });
  }

  var SIZE_ORDER = ['large', 'medium', 'small', 'tiny'];

  function normalizeVideo(h) {
    var v = h.videos || {};
    var files = [];
    var thumb = '';

    SIZE_ORDER.forEach(function (name) {
      var f = v[name];
      if (!f || !f.url) return;
      files.push({
        label: (f.width && f.height) ? (f.width + '×' + f.height) : name,
        url: f.url,
        width: f.width || 0,
        height: f.height || 0,
        size: f.size || 0,
        fps: null,                       // Pixabay는 fps 정보를 주지 않는다
        ext: 'mp4'
      });
      if (!thumb && f.thumbnail) thumb = f.thumbnail;
    });

    if (!files.length) return null;
    files.sort(function (a, b) { return b.width - a.width; });

    var preview = files[files.length - 1];   // 가장 작은 것으로 미리보기

    return {
      source: 'pixabay',
      sourceName: 'Pixabay',
      type: 'video',
      id: h.id,
      title: h.tags || ('Pixabay 영상 ' + h.id),
      pageUrl: h.pageURL,
      author: { name: h.user, url: userUrl(h) },
      width: files[0].width,
      height: files[0].height,
      duration: h.duration || 0,
      fps: null,
      tags: h.tags,
      thumb: thumb,
      thumbNeedsCache: !!thumb,
      previewVideo: preview ? preview.url : null,
      files: files,
      ext: 'mp4'
    };
  }

  function pickFile(item, quality) {
    var files = item.files || [];
    if (!files.length) return null;
    if (item.type === 'image') return files[0];

    var targets = { '4k': 999999, fhd: 1920, hd: 1280 };
    var want = targets[quality] || 1920;

    var under = files.filter(function (f) { return f.width && f.width <= want; });
    if (under.length) return under[0];
    return files[files.length - 1];
  }

  // ---------------- 어댑터 ----------------
  SS.adapters.pixabay = {
    id: 'pixabay',
    name: 'Pixabay',
    url: 'https://pixabay.com',
    supports: {
      orientation: { video: false, image: true, square: false },   // 영상은 방향 파라미터가 없다
      size: true,                                                  // min_width 로 대신
      color: true,
      fps: false,                                                  // 응답에 fps가 없다
      category: true,
      imageType: true,
      videoType: true,
      order: true
    },
    search: function (kind, params) {
      return (kind === 'video') ? searchVideos(params) : searchImages(params);
    },
    pickFile: pickFile,

    keyDef: {
      id: 'pixabay',
      label: 'Pixabay',
      desc: '영상 · 이미지',
      issueUrl: 'https://pixabay.com/api/docs/',
      test: function (key) {
        return Eddie.net.getJson(IMAGE_URL + '?' + Eddie.net.qs({ key: key, q: 'sea', per_page: 3 }))
          .then(function (res) {
            if (res.status >= 200 && res.status < 300 && res.json) return { ok: true, message: '연결 성공' };
            return { ok: false, message: '실패: ' + explain(res) };
          });
      }
    }
  };

})(window);
