/*
 * Eddie Drop - 메인
 * 탭 만들기 · 설정 화면 · 단축키 · 시작.
 */
(function (global) {
  'use strict';

  var ui, $, el;
  var current = null;          // 지금 보이는 탭

  // 탭 목록 (검색 소스가 늘어나면 여기에 추가)
  var TABS = [
    { id: 'video',   label: '영상',   make: function () { return new Sources.MediaTab('video'); } },
    { id: 'image',   label: '이미지', make: function () { return new Sources.MediaTab('image'); } },
    { id: 'gif',     label: 'GIF',    make: function () { return new Sources.GiphyTab('gif'); } },
    { id: 'sticker', label: '스티커', make: function () { return new Sources.GiphyTab('sticker'); } },
    { id: 'sfx',     label: '효과음', make: function () { return new Sources.SfxTab(); } },
    { id: 'files',   label: '내 파일', make: function () { return new Sources.FilesTab(); } }
  ];

  // ==================================================================
  // 탭
  // ==================================================================
  function buildTabs() {
    var bar = $('#tabbar');
    var views = $('#views');
    bar.innerHTML = '';
    views.innerHTML = '';

    Eddie.tabs = TABS.map(function (def) {
      var btn = el('button', 'tab', def.label);
      btn.dataset.key = def.id;
      btn.addEventListener('click', function () { show(def.id); });
      bar.appendChild(btn);

      var view = el('section', 'view');
      view.id = 'view-' + def.id;
      view.dataset.key = def.id;
      views.appendChild(view);

      return { id: def.id, label: def.label, make: def.make, view: view, tab: null };
    });

    // 설정 탭은 항상 마지막
    var sBtn = el('button', 'tab settings', '설정');
    sBtn.dataset.key = 'settings';
    sBtn.addEventListener('click', function () { show('settings'); });
    bar.appendChild(sBtn);

    var sView = el('section', 'view');
    sView.id = 'view-settings';
    sView.dataset.key = 'settings';
    views.appendChild(sView);
    buildSettings(sView);

    var last = localStorage.getItem('eddieDrop.lastTab');
    var keys = TABS.map(function (t) { return t.id; }).concat(['settings']);
    show(keys.indexOf(last) >= 0 ? last : 'video');
  }

  function show(key) {
    ui.$$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.key === key); });
    ui.$$('.view').forEach(function (v) { v.classList.toggle('active', v.dataset.key === key); });
    localStorage.setItem('eddieDrop.lastTab', key);

    // 탭을 벗어날 때 정리할 게 있으면 (효과음 미리듣기 정지 등)
    if (current && current.tab && current.tab.onHide) {
      try { current.tab.onHide(); } catch (e) {}
    }

    current = null;
    Eddie.tabs.forEach(function (entry) {
      if (entry.id !== key) return;
      current = entry;
      if (!entry.tab) {
        try {
          entry.tab = entry.make();
          entry.tab.mount(entry.view);
        } catch (e) {
          console.error(e);
          entry.view.innerHTML = '<div class="grid-msg"><span class="err-msg">이 탭을 여는 중 오류가 났습니다: ' +
                                 (e.message || e) + '</span></div>';
        }
      }
    });
  }

  // ==================================================================
  // 설정 화면
  // ==================================================================
  function buildSettings(root) {
    root.innerHTML = '';

    // ---- API 키 ----
    var sec = el('div', 'section');
    sec.appendChild(el('h2', null, 'API 키'));
    sec.appendChild(el('p', 'hint',
      '키는 이 컴퓨터에만 저장됩니다. 입력하면 바로 저장돼요.<br>' +
      '다른 에디 플러그인과 같은 파일을 쓰기 때문에, 한 번만 넣으면 됩니다.'));
    Eddie.keys.forEach(function (def) { sec.appendChild(keyCard(def)); });
    root.appendChild(sec);

    // ---- 다운로드 ----
    sec = el('div', 'section');
    sec.appendChild(el('h2', null, '다운로드'));

    var f = el('div', 'field');
    f.appendChild(el('label', null, '<span class="name">저장 폴더</span>'));
    var row = el('div', 'row');
    var dirInput = el('input', 'grow');
    dirInput.type = 'text';
    dirInput.spellcheck = false;
    dirInput.value = Eddie.settings.get().downloadDir;
    dirInput.addEventListener('change', function () {
      Eddie.settings.set('downloadDir', dirInput.value.trim());
      Eddie.settings.ensureDir();
    });
    row.appendChild(dirInput);
    row.appendChild(ui.button('btn', '선택', function () {
      var r = window.cep.fs.showOpenDialog(false, true, '다운로드 폴더 선택', Eddie.settings.get().downloadDir, []);
      if (r && r.data && r.data.length) {
        var picked = ui.decodePath(r.data[0]);      // CEP 가 URL 인코딩해서 돌려준다
        Eddie.settings.set('downloadDir', picked);
        dirInput.value = picked;
        Eddie.settings.ensureDir();
        ui.toast('저장 폴더를 바꿨습니다.');
      }
    }));
    row.appendChild(ui.button('btn', '열기', function () { openFolder(Eddie.settings.get().downloadDir); }));
    f.appendChild(row);
    f.appendChild(el('p', 'hint', '소스별 하위 폴더(Pexels, Pixabay, GIPHY, Freesound)가 자동으로 만들어집니다.'));
    sec.appendChild(f);

    var cacheRow = el('div', 'row');
    cacheRow.appendChild(ui.button('btn small', '검색 결과 캐시 비우기', function () {
      Eddie.cache.clear();
      ui.toast('검색 캐시를 비웠습니다.');
    }));
    cacheRow.appendChild(ui.button('btn small', '썸네일 캐시 비우기', function () {
      ui.toast(Eddie.download.clearThumbs() + '개를 지웠습니다.');
    }));
    sec.appendChild(cacheRow);
    root.appendChild(sec);

    // ---- 기본 동작 ----
    sec = el('div', 'section');
    sec.appendChild(el('h2', null, '기본 동작'));

    sec.appendChild(selectField('영상 기본 화질', 'quality', [
      { v: '4k',  ko: '4K (가능하면 최대 화질)' },
      { v: 'fhd', ko: 'FHD 1080p' },
      { v: 'hd',  ko: 'HD 720p' }
    ]));

    sec.appendChild(selectField('기본 삽입 방식', 'insertMode', [
      { v: 'insert',    ko: '삽입 (,) — 뒤 클립을 밀어냄' },
      { v: 'overwrite', ko: '덮어쓰기 (.) — 위에 덮어씀' }
    ]));

    sec.appendChild(checkField('마우스를 올리면 파일을 미리 받아두기', 'prefetchOnHover',
      '켜면 드래그앤드롭이 한 번에 됩니다. 대신 구경만 한 파일도 저장 폴더에 쌓입니다.'));

    sec.appendChild(checkField('패널에서 단축키 쓰기', 'panelShortcuts',
      '패널에서 <b>,</b> 삽입 · <b>.</b> 덮어쓰기 · Tab 이동 · Space 미리듣기를 씁니다.<br>' +
      '⚠ <b>, 와 . 는 프리미어에서도 같이 동작합니다.</b> 소스 모니터에 클립이 열려 있으면 그것도 함께 들어갑니다.<br>' +
      '깔끔하게 넣으려면 카드의 [삽입] 버튼이나 끌어놓기를 쓰세요.',
      function () { Eddie.shortcuts.apply(); }));

    sec.appendChild(checkField('넣은 뒤 플레이헤드를 클립 끝으로 옮기기', 'advancePlayhead',
      '프리미어 기본 삽입과 같은 동작입니다. , 를 연달아 눌러 뒤로 계속 붙일 수 있어요.<br>' +
      '끄면 항상 같은 자리에 넣습니다.'));

    sec.appendChild(checkField('효과음은 Tab 으로 넘길 때 바로 들려주기', 'sfxAutoPlay'));

    sec.appendChild(checkField('다른 탭·패널로 가면 미리듣기 멈추기', 'sfxStopOnLeave',
      '효과음 탭을 벗어나거나 프리미어의 다른 패널을 클릭하면 듣고 있던 소리를 멈춥니다.'));

    sec.appendChild(checkField('효과음 넣을 때 소리 크기 자동 맞추기', 'sfxNormalize',
      '받은 파일의 가장 큰 소리를 재서, 클립 볼륨을 목표치에 맞춰 넣습니다. 효과음마다 볼륨이 들쭉날쭉하지 않아요.'));

    sec.appendChild(sliderField('효과음 목표 레벨', 'sfxTargetDb', {
      min: -30, max: 0, step: 0.5, unit: ' dB', reset: -15,
      marks: ['-30', '-20', '-15', '-10', '0'],
      hint: '오디오 미터가 이 근처에 오도록 클립 볼륨을 맞춥니다. 보통 -15 dB 면 무난해요.'
    }));

    var help = el('div', 'shortcut-help');
    Eddie.shortcuts.HELP.forEach(function (h) {
      var r = el('div', 'sc-row');
      r.appendChild(el('kbd', null, h.key));
      r.appendChild(el('span', null, h.what));
      help.appendChild(r);
    });
    sec.appendChild(help);

    var bf = el('div', 'field');
    bf.appendChild(el('label', null, '<span class="name">프로젝트 빈 이름</span>'));
    var binInput = el('input');
    binInput.type = 'text';
    binInput.spellcheck = false;
    binInput.value = Eddie.settings.get().binRoot;
    binInput.addEventListener('change', function () { Eddie.settings.set('binRoot', binInput.value.trim()); });
    bf.appendChild(binInput);
    bf.appendChild(el('p', 'hint', '예) <code>Eddie Drop</code> → 프로젝트 안에 <code>Eddie Drop / Pexels</code> 빈이 생깁니다.'));
    sec.appendChild(bf);
    root.appendChild(sec);

    // ---- 효과음 태그 칩 ----
    sec = el('div', 'section');
    sec.appendChild(el('h2', null, '효과음 태그 칩'));
    sec.appendChild(el('p', 'hint', '효과음 탭에서 한 번에 누를 수 있는 태그입니다. 한글 라벨과 영어 태그를 짝지어 넣으세요.'));
    var chipList = el('div', 'chipedit');
    sec.appendChild(chipList);

    function refreshChipList() {
      chipList.innerHTML = '';
      var list = SfxDictionary.chips();
      list.forEach(function (c, i) {
        var r = el('div', 'chipedit-row');
        r.appendChild(el('span', 'ce-ko', '')).textContent = c.ko;
        r.appendChild(el('span', 'ce-en', '')).textContent = c.en;
        r.appendChild(ui.button('btn small', '삭제', function () {
          var next = SfxDictionary.chips();
          next.splice(i, 1);
          SfxDictionary.saveChips(next);
          refreshChipList();
          refreshSfxTab();
        }));
        chipList.appendChild(r);
      });
    }

    var addRow = el('div', 'row');
    var koIn = el('input', 'grow'); koIn.type = 'text'; koIn.placeholder = '한글 라벨 (예: 휘릭)';
    var enIn = el('input', 'grow'); enIn.type = 'text'; enIn.placeholder = '영어 태그 (예: whoosh)'; enIn.spellcheck = false;
    addRow.appendChild(koIn);
    addRow.appendChild(enIn);
    addRow.appendChild(ui.button('btn', '추가', function () {
      var ko = koIn.value.trim(), en = enIn.value.trim();
      if (!ko || !en) { ui.toast('한글 라벨과 영어 태그를 모두 넣어주세요.'); return; }
      var next = SfxDictionary.chips();
      next.push({ ko: ko, en: en });
      SfxDictionary.saveChips(next);
      koIn.value = ''; enIn.value = '';
      refreshChipList();
      refreshSfxTab();
    }));
    sec.appendChild(addRow);

    sec.appendChild(ui.button('btn small', '기본값으로 되돌리기', function () {
      SfxDictionary.resetChips();
      refreshChipList();
      refreshSfxTab();
      ui.toast('기본 태그로 되돌렸습니다.');
    }));
    refreshChipList();
    root.appendChild(sec);

    // ---- 업데이트 ----
    root.appendChild(updateSection());

    // ---- 진단 ----
    sec = el('div', 'section');
    sec.appendChild(el('h2', null, '진단'));
    var drow = el('div', 'row');
    var dstat = el('div', 'status');
    drow.appendChild(ui.button('btn', '프리미어 연결 확인', function () { diagnose(dstat); }));
    drow.appendChild(ui.button('btn', '설정 파일 열기', function () { openFolder(settingsFolder()); }));
    drow.appendChild(ui.button('btn', '설정 초기화', function () {
      if (!confirm('설정을 모두 초기화할까요? (API 키도 지워집니다)')) return;
      Eddie.settings.reset();
      ui.toast('초기화했습니다. 패널을 다시 열어주세요.');
    }));
    sec.appendChild(drow);
    sec.appendChild(dstat);
    sec.appendChild(el('p', 'hint',
      '설정 파일: <code>' + (Eddie.settings.file() || '-') + '</code><br>' +
      '패널 ID: <code>' + Eddie.panelId + '</code> (다른 에디 확장이 이 ID로 패널을 엽니다)'));
    root.appendChild(sec);
  }

  /** 효과음 탭이 열려 있으면 칩을 다시 그린다 */
  function refreshSfxTab() {
    Eddie.tabs.forEach(function (e) {
      if (e.id === 'sfx' && e.tab && e.tab.renderChips) e.tab.renderChips();
    });
  }

  function settingsFolder() {
    var f = Eddie.settings.file() || '';
    return f.replace(/\/[^\/]+$/, '');
  }

  function openFolder(p) {
    if (!p) return;
    if (!Eddie.platform.openFolder(p)) Eddie.host.openUrl(Eddie.platform.fileUrl(p));
  }

  function selectField(label, prop, options) {
    var f = el('div', 'field');
    f.appendChild(el('label', null, '<span class="name">' + label + '</span>'));
    var numeric = options.length && typeof options[0].v === 'number';
    var s = ui.select('', options, function () {
      Eddie.settings.set(prop, numeric ? parseFloat(s.value) : s.value);
    });
    s.value = Eddie.settings.get()[prop];
    f.appendChild(s);
    return f;
  }

  /** 페이더(슬라이더)로 숫자 값을 조절하는 설정 */
  function sliderField(label, prop, opt) {
    var f = el('div', 'field');

    var head = el('label');
    head.innerHTML = '<span class="name">' + label + '</span>';
    var val = el('span', 'fader-val');
    head.appendChild(val);
    f.appendChild(head);

    var row = el('div', 'row fader-row');
    var sl = el('input', 'grow');
    sl.type = 'range';
    sl.min = opt.min; sl.max = opt.max; sl.step = opt.step;
    sl.value = Eddie.settings.get()[prop];

    function paint() {
      var v = parseFloat(sl.value);
      val.textContent = (v > 0 ? '+' : '') + v + (opt.unit || '');
    }
    sl.addEventListener('input', function () {
      Eddie.settings.set(prop, parseFloat(sl.value));
      paint();
    });

    row.appendChild(sl);
    if (opt.reset !== undefined) {
      row.appendChild(ui.button('btn small', '기본값', function () {
        sl.value = opt.reset;
        Eddie.settings.set(prop, opt.reset);
        paint();
      }));
    }
    f.appendChild(row);

    if (opt.marks) {
      var m = el('div', 'fader-marks');
      opt.marks.forEach(function (t) { m.appendChild(el('span', null, t)); });
      f.appendChild(m);
    }
    if (opt.hint) f.appendChild(el('p', 'hint', opt.hint));

    paint();
    return f;
  }

  // ==================================================================
  // 업데이트
  // ==================================================================
  function whenText(ts) {
    if (!ts) return '아직 확인한 적 없음';
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function updateSection() {
    var up = Eddie.updater;
    var sec = el('div', 'section');
    sec.appendChild(el('h2', null, '업데이트'));

    var head = el('div', 'update-head');
    head.appendChild(el('span', 'ver', 'Eddie Drop v' + up.currentVersion()));
    var when = el('span', 'when', whenText(Eddie.settings.get().lastUpdateCheck));
    head.appendChild(when);
    sec.appendChild(head);

    var stat = el('div', 'status');
    var notes = el('div', 'changelog');
    notes.style.display = 'none';

    var row = el('div', 'row');
    var btn = ui.button('btn', '업데이트 확인', function () { doCheck(); });
    row.appendChild(btn);

    var goBtn = ui.button('btn primary', '업데이트', function () { doInstall(); });
    goBtn.style.display = 'none';
    row.appendChild(goBtn);

    if (up.canRollback()) {
      row.appendChild(ui.button('btn small', '이전 버전(v' + up.backupVersion() + ')으로 되돌리기', function () {
        if (!confirm('v' + up.backupVersion() + ' 로 되돌릴까요? 패널이 다시 열립니다.')) return;
        up.rollback().catch(function (e) {
          stat.className = 'status err';
          stat.textContent = '되돌리지 못했습니다: ' + e.message;
        });
      }));
    }
    sec.appendChild(row);
    sec.appendChild(stat);
    sec.appendChild(notes);

    var found = null;

    function doCheck() {
      stat.className = 'status busy';
      stat.textContent = '확인하는 중…';
      notes.style.display = 'none';
      goBtn.style.display = 'none';

      up.check().then(function (info) {
        found = info;
        when.textContent = whenText(Eddie.settings.get().lastUpdateCheck);

        if (!info.newer) {
          stat.className = 'status ok';
          stat.textContent = '최신 버전입니다. (v' + up.currentVersion() + ')';
          return;
        }

        stat.className = 'status ok';
        stat.textContent = '새 버전 v' + info.version + ' 이 있습니다.' +
                           (info.date ? ' (' + info.date + ')' : '');

        if (info.notes) {
          notes.style.display = '';
          notes.innerHTML = '';
          notes.appendChild(el('div', 'cl-title', 'v' + info.version + ' 에서 달라진 점'));
          String(info.notes).split(/\r?\n/).forEach(function (line) {
            if (line.trim()) notes.appendChild(el('div', 'cl-line', '')).textContent = line.trim();
          });
        }

        if (info.requiresInstaller) {
          stat.innerHTML += '<br>이 버전은 설치 파일을 새로 받아야 합니다.';
          var link = ui.button('btn primary', '설치 파일 받기', function () {
            Eddie.host.openUrl(info.installerPage || up.releasePage());
          });
          goBtn.parentNode.insertBefore(link, goBtn);
          return;
        }
        goBtn.style.display = '';
      }).catch(function (e) {
        stat.className = 'status err';
        stat.textContent = e.message;
      });
    }

    function doInstall() {
      if (!found) return;
      goBtn.disabled = true;
      btn.disabled = true;
      stat.className = 'status busy';
      up.install(found, function (msg) { stat.textContent = msg; })
        .catch(function (e) {
          goBtn.disabled = false;
          btn.disabled = false;
          stat.className = 'status err';
          stat.textContent = '업데이트 실패: ' + e.message + ' (이전 버전 그대로입니다)';
        });
    }

    sec.appendChild(checkField('프리미어를 켤 때 새 버전이 있는지 확인', 'autoUpdate',
      '새 버전이 있으면 알려만 줍니다. 설치는 위의 [업데이트] 버튼을 눌러야 시작해요.'));

    var lf = el('div', 'field');
    lf.appendChild(el('label', null, '<span class="name">라이선스 키</span>'));
    var lin = el('input');
    lin.type = 'text';
    lin.spellcheck = false;
    lin.placeholder = '없으면 비워두세요';
    lin.value = Eddie.settings.get().license || '';
    lin.addEventListener('change', function () { Eddie.settings.set('license', lin.value.trim()); });
    lf.appendChild(lin);
    lf.appendChild(el('p', 'hint', '다른 에디 플러그인들과 함께 쓰는 값입니다.'));
    sec.appendChild(lf);

    sec.appendChild(el('p', 'hint',
      '기능 파일: <code>' + up.pluginDir() + '</code><br>' +
      (up.manifestUrl()
        ? '업데이트 확인 주소: <code>' + up.manifestUrl() + '</code>'
        : '업데이트 주소는 아직 정해지지 않았습니다. (배포 단계에서 넣습니다)')));

    if (!up.manifestUrl()) btn.disabled = true;

    return sec;
  }

  function checkField(label, prop, hint, onChange) {
    var f = el('div', 'field');
    var lab = el('label', 'check');
    var cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!Eddie.settings.get()[prop];
    cb.addEventListener('change', function () {
      Eddie.settings.set(prop, cb.checked);
      if (onChange) onChange(cb.checked);
    });
    lab.appendChild(cb);
    lab.appendChild(el('span', 'name', label));
    f.appendChild(lab);
    if (hint) f.appendChild(el('p', 'hint', hint));
    return f;
  }

  function keyCard(def) {
    var card = el('div', 'keycard');

    var head = el('div', 'head');
    head.appendChild(el('span', 'title',
      def.label + ' <span style="color:var(--text-faint);font-weight:400">· ' + (def.desc || '') + '</span>'));
    if (def.issueUrl) {
      var a = ui.link('키 발급받기 ↗', def.issueUrl);
      a.className = 'issue';
      head.appendChild(a);
    }
    card.appendChild(head);

    var row = el('div', 'row');
    var input = el('input', 'grow');
    input.type = 'password';
    input.placeholder = 'API 키를 붙여넣으세요';
    input.spellcheck = false;
    input.value = Eddie.settings.key(def.id);

    var stat = el('div', 'status');

    input.addEventListener('input', function () {
      Eddie.settings.setKey(def.id, input.value);
      stat.textContent = '';
      stat.className = 'status';
    });

    row.appendChild(input);
    row.appendChild(ui.button('btn small', '보기', function (e) {
      var showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      e.target.textContent = showing ? '숨기기' : '보기';
    }));
    row.appendChild(ui.button('btn small', '연결 테스트', function () {
      var k = Eddie.settings.key(def.id);
      if (!k) { stat.textContent = '먼저 API 키를 입력해 주세요.'; stat.className = 'status err'; return; }
      if (!def.test) { stat.textContent = '이 소스는 연결 테스트를 제공하지 않습니다.'; stat.className = 'status'; return; }
      stat.textContent = '확인하는 중…';
      stat.className = 'status busy';
      def.test(k).then(function (r) {
        stat.textContent = r.message || (r.ok ? '연결 성공' : '실패');
        stat.className = 'status ' + (r.ok ? 'ok' : 'err');
      }).catch(function (e) {
        stat.textContent = '실패: ' + (e.message || e);
        stat.className = 'status err';
      });
    }));
    card.appendChild(row);
    card.appendChild(stat);
    return card;
  }

  function diagnose(out) {
    out.className = 'status busy';
    out.textContent = '확인하는 중…';
    Eddie.premiere.ping().then(function (d) {
      var lines = [];
      lines.push('프리미어 ' + d.version + ' 연결됨');
      lines.push('프로젝트: ' + (d.projectName || '(열린 프로젝트 없음)'));
      lines.push(d.sequence
        ? '시퀀스: ' + d.sequence.name + ' (V' + d.sequence.videoTracks + ' / A' + d.sequence.audioTracks + ')'
        : '시퀀스: 열린 시퀀스가 없습니다');
      lines.push('Node.js: ' + (Eddie.net.nodeReady() ? '사용 가능' : '사용 불가 — manifest 확인 필요'));
      lines.push('저장 폴더: ' + (Eddie.settings.ensureDir() ? '준비됨' : '만들 수 없음 ⚠'));
      lines.push('설정 파일: ' + (Eddie.settings.save() ? '쓰기 가능' : '쓸 수 없음 ⚠'));
      var sc = Eddie.shortcuts.status() || Eddie.shortcuts.apply();
      lines.push('단축키: ' + sc.message);
      out.className = 'status ok';
      out.innerHTML = lines.join('<br>');
    }).catch(function (e) {
      out.className = 'status err';
      out.textContent = '실패: ' + e.message;
    });
  }

  // ==================================================================
  // 단축키 → 지금 보이는 탭에 넘겨준다
  // ==================================================================
  /**
   * 버튼을 눌러도 포커스를 가져가지 않게 한다.
   *
   * 버튼(재생 · 삽입 · 덮어쓰기)에 포커스가 있으면 CEF 가 키를 프리미어로 넘겨서
   * , 를 눌렀을 때 소스 모니터에 있던 클립이 대신 삽입된다.
   * mousedown 의 기본 동작만 막으면 클릭은 그대로 되고 포커스만 안 옮겨간다.
   */
  function initButtonFocus() {
    document.addEventListener('mousedown', function (e) {
      var t = e.target;
      if (t && t.tagName === 'BUTTON') e.preventDefault();
    }, true);
  }

  function initKeyboard() {
    document.addEventListener('keydown', function (e) {
      var isCatcherEl = !!(e.target && e.target.dataset && e.target.dataset.keycatcher);

      // ⌘ / Ctrl / Alt 조합은 프리미어 몫이다. 키 잡기를 놓아준다.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if (isCatcherEl) ui.releaseKeys();
        return;
      }

      var name = ui.keyName(e);

      // Esc 또는 우리가 안 쓰는 키 → 키 잡기를 놓아서
      // 프리미어 단축키( ` 패널 최대화 등 )가 바로 먹게 한다
      if (!name) {
        if (isCatcherEl) ui.releaseKeys();
        return;
      }

      var t = e.target;
      // 숨은 키 받기용 입력칸은 "글 쓰는 중" 이 아니다
      var isCatcher = !!(t && t.dataset && t.dataset.keycatcher);
      var typing = !isCatcher && !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'));

      // 검색창에 글을 쓰는 중이어도 ↑ ↓ 는 결과 고르기로 쓴다.
      // (한 줄짜리 입력칸에서 위/아래는 하는 일이 없으므로 가져와도 안전하다)
      if (typing && name !== 'down' && name !== 'up') return;

      // Enter 는 프리미어의 인/아웃 렌더가 같이 돌아서 쓰지 않는다 (더블클릭으로 대체)
      if (name === 'enter') return;
      if (!Eddie.settings.get().panelShortcuts) return;
      if (!current || !current.tab || !current.tab.handleKey) return;

      if (typing && current.tab.focusResults) current.tab.focusResults();
      current.tab.handleKey(e, name);
    });
  }

  // ==================================================================
  // 시작
  // ==================================================================
  function boot() {
    ui = Eddie.ui;
    $ = ui.$;
    el = ui.el;

    // 검색 소스들이 요구하는 API 키를 설정 탭에 등록
    ['pexels', 'pixabay', 'giphy', 'freesound'].forEach(function (id) {
      var a = Sources.adapters[id];
      if (a && a.keyDef) Eddie.settings.registerKey(a.keyDef);
    });

    Eddie.settings.ensureDir();
    buildTabs();
    initButtonFocus();
    initKeyboard();
    ui.startFocusGuard();      // 포커스가 body 로 빠지면 스스로 되돌린다
    Eddie.shortcuts.apply();      // , . 등을 패널이 가져간다 (프리미어와 이중 동작 방지)

    $('#status-ver').textContent = 'Eddie Drop v' + Eddie.version;

    // 여기까지 왔으면 지금 버전은 멀쩡히 열린 것이다 → 되돌리기 표시를 지운다
    Eddie.updater.markHealthy();
    if (EddieBoot && EddieBoot.rolledBack) ui.toast(EddieBoot.rolledBack);

    setTimeout(function () { Eddie.updater.autoCheck(); }, 2500);

    Eddie.premiere.ping().then(function (d) {
      ui.status('프리미어 연결됨 · ' + (d.projectName || '프로젝트 없음'), 'ok');
    }).catch(function (e) {
      console.error(e);
      // 프리미어 쪽 기능 파일을 못 읽은 경우가 대부분이다 — 진짜 이유를 보여준다
      var why = EddieBoot && EddieBoot.jsxError;
      ui.status(why ? ('프리미어 연결 실패 — ' + why) : '프리미어 연결 실패 — 설정 탭에서 확인해 주세요', 'err');
      if (why) ui.toast('프리미어를 껐다 켜 주세요. (프리미어 쪽 기능을 못 읽었습니다)');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
