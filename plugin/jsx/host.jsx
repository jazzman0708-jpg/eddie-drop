/*
 * Eddie Drop - ExtendScript (프리미어 조작)
 *
 * 다른 확장과 이름이 부딪히지 않게 전부 EddieDrop 아래에 넣는다.
 * 패널에서는 전역 함수 ED_call(기능이름, JSON문자열) 하나로만 부른다.
 */

$.global.EddieDrop = $.global.EddieDrop || {};

// ==================================================================
// JSON (ExtendScript에는 JSON 객체가 없다)
// ==================================================================
EddieDrop.escape = function (s) {
    s = String(s);
    var out = '', i, c, code;
    for (i = 0; i < s.length; i++) {
        c = s.charAt(i);
        code = s.charCodeAt(i);
        if (c === '"') out += '\\"';
        else if (c === '\\') out += '\\\\';
        else if (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '\t') out += '\\t';
        else if (code < 32 || code > 126) {
            var h = code.toString(16);
            while (h.length < 4) h = '0' + h;
            out += '\\u' + h;
        } else out += c;
    }
    return out;
};

EddieDrop.stringify = function (v) {
    var t = typeof v, i, parts;
    if (v === null || t === 'undefined') return 'null';
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return '"' + EddieDrop.escape(v) + '"';
    if (v instanceof Array) {
        parts = [];
        for (i = 0; i < v.length; i++) parts.push(EddieDrop.stringify(v[i]));
        return '[' + parts.join(',') + ']';
    }
    parts = [];
    for (var k in v) {
        if (!v.hasOwnProperty(k)) continue;
        parts.push('"' + EddieDrop.escape(k) + '":' + EddieDrop.stringify(v[k]));
    }
    return '{' + parts.join(',') + '}';
};

EddieDrop.parse = function (str) {
    if (str === undefined || str === null || str === '') return {};
    try { return eval('(' + str + ')'); }
    catch (e) { return {}; }
};

EddieDrop.ok   = function (data) { return EddieDrop.stringify({ ok: true, data: (data === undefined ? null : data) }); };
EddieDrop.fail = function (msg)  { return EddieDrop.stringify({ ok: false, error: String(msg) }); };

// ==================================================================
// 모듈이 같이 쓰는 도구들
// ==================================================================
EddieDrop.util = {

    normPath: function (p) {
        if (!p) return '';
        p = String(p).replace(/\\/g, '/');
        try { p = decodeURIComponent(p); } catch (e) {}
        return p;
    },

    baseName: function (p) {
        p = EddieDrop.util.normPath(p);
        var i = p.lastIndexOf('/');
        return (i >= 0) ? p.substring(i + 1) : p;
    },

    /** 전체 경로가 다르면 파일 이름으로도 맞춰본다 (프리미어가 경로를 다르게 적을 때 대비) */
    sameFile: function (a, b) {
        if (EddieDrop.util.samePath(a, b)) return true;
        var na = EddieDrop.util.baseName(a), nb = EddieDrop.util.baseName(b);
        return !!na && na.toLowerCase() === nb.toLowerCase();
    },

    samePath: function (a, b) {
        a = EddieDrop.util.normPath(a);
        b = EddieDrop.util.normPath(b);
        if (a === b) return true;
        return a.toLowerCase() === b.toLowerCase();   // macOS는 대소문자 구분 안 하는 경우가 많다
    },

    /** BIN 여부 (버전에 따라 ProjectItemType 이 없을 수도 있어 숫자로도 확인) */
    isBin: function (it) {
        try {
            if (typeof ProjectItemType !== 'undefined' && ProjectItemType.BIN !== undefined) {
                return it.type === ProjectItemType.BIN;
            }
        } catch (e) {}
        return it.type === 2;
    },

    /** 빈(폴더) 경로를 따라 내려가며 없으면 만든다 */
    ensureBin: function (names) {
        var parent = app.project.rootItem;
        for (var n = 0; n < names.length; n++) {
            var name = names[n];
            if (!name) continue;
            var found = null;
            for (var i = 0; i < parent.children.numItems; i++) {
                var child = parent.children[i];
                if (EddieDrop.util.isBin(child) && child.name === name) { found = child; break; }
            }
            parent = found ? found : parent.createBin(name);
        }
        return parent;
    },

    walkItems: function (root, visit) {
        for (var i = 0; i < root.children.numItems; i++) {
            var it = root.children[i];
            if (EddieDrop.util.isBin(it)) {
                var r = EddieDrop.util.walkItems(it, visit);
                if (r) return r;
            } else if (visit(it)) {
                return it;
            }
        }
        return null;
    },

    findByMediaPath: function (target) {
        return EddieDrop.util.walkItems(app.project.rootItem, function (it) {
            var mp = '';
            try { mp = it.getMediaPath(); } catch (e) { return false; }
            return mp && EddieDrop.util.samePath(mp, target);
        });
    },

    findByNodeId: function (nodeId) {
        if (!nodeId) return null;
        return EddieDrop.util.walkItems(app.project.rootItem, function (it) {
            return String(it.nodeId) === String(nodeId);
        });
    },

    itemInfo: function (it) {
        var mp = '';
        try { mp = it.getMediaPath(); } catch (e) {}
        return { nodeId: String(it.nodeId), name: it.name, path: mp };
    },

    activeSequenceOrThrow: function () {
        if (!app.project) throw new Error('프로젝트가 열려 있지 않습니다.');
        var s = app.project.activeSequence;
        if (!s) throw new Error('활성 시퀀스가 없습니다. 시퀀스를 먼저 열어주세요.');
        return s;
    },

    trackBusyAt: function (track, t) {
        for (var i = 0; i < track.clips.numItems; i++) {
            var c = track.clips[i];
            if (t >= c.start.seconds - 0.0005 && t < c.end.seconds - 0.0005) return true;
        }
        return false;
    },

    /**
     * 넣을 트랙 고르기
     * 1) 타겟팅된 트랙이 있으면 그 중 가장 아래
     * 2) 없으면 내용이 있는 가장 위 트랙의 바로 위 (비어 있는 트랙)
     * 3) 그것도 없으면 맨 위 트랙 (경고)
     */
    chooseTrack: function (tracks, t) {
        var i;
        for (i = 0; i < tracks.numTracks; i++) {
            var targeted = false;
            try { targeted = tracks[i].isTargeted(); } catch (e) {}
            if (targeted) return { index: i, reason: 'targeted', warn: null };
        }
        var highestBusy = -1;
        for (i = 0; i < tracks.numTracks; i++) {
            if (EddieDrop.util.trackBusyAt(tracks[i], t)) highestBusy = i;
        }
        var idx = highestBusy + 1;
        if (idx < tracks.numTracks) {
            return { index: idx, reason: 'empty', warn: '타겟 트랙이 없어서 비어 있는 트랙에 넣었어요.' };
        }
        return {
            index: tracks.numTracks - 1,
            reason: 'full',
            warn: '빈 트랙이 없어서 맨 위 트랙에 넣었어요. 트랙을 하나 추가하면 더 안전합니다.'
        };
    },

    /**
     * 프리미어 클립 볼륨(Level)은 0~1 실수로 저장되고 1.0 이 +15dB 다.
     *   level = 10 ^ ((dB - 15) / 20)
     */
    dbToLevel: function (db) {
        if (db > 15) db = 15;
        if (db < -96) db = -96;
        return Math.pow(10, (db - 15) / 20);
    },

    /** 클립의 볼륨 속성 찾기 (한글 프리미어에서도 되게 이름 대신 구조로 찾는다) */
    findLevelProperty: function (clip) {
        var comps = clip.components;
        if (!comps) return null;

        // 보통 components[0] 이 Volume, properties[1] 이 Level 이다
        try {
            var p = comps[0].properties[1];
            if (p && typeof p.setValue === 'function') return p;
        } catch (e) {}

        // 못 찾으면 0~1 값을 가진 속성을 훑어본다
        for (var c = 0; c < comps.numItems; c++) {
            try {
                var props = comps[c].properties;
                for (var i = 0; i < props.numItems; i++) {
                    var pr = props[i];
                    if (typeof pr.setValue !== 'function') continue;
                    var v = pr.getValue();
                    if (typeof v === 'number' && v >= 0 && v <= 1) return pr;
                }
            } catch (e2) {}
        }
        return null;
    },

    /** 넣은 클립의 볼륨을 dB 로 맞춘다 */
    applyClipLevel: function (clip, db) {
        try {
            var prop = EddieDrop.util.findLevelProperty(clip);
            if (!prop) return false;
            prop.setValue(EddieDrop.util.dbToLevel(db), true);
            return true;
        } catch (e) { return false; }
    },

    /** insertClip / overwriteClip 이 받는 시간 형식이 버전마다 달라서 차례로 시도 */
    placeClip: function (track, projectItem, timeObj, mode) {
        var attempts = [timeObj, timeObj.seconds, String(timeObj.seconds), timeObj.ticks];
        var lastErr = null;
        for (var i = 0; i < attempts.length; i++) {
            if (attempts[i] === undefined || attempts[i] === null) continue;
            try {
                if (mode === 'insert') track.insertClip(projectItem, attempts[i]);
                else track.overwriteClip(projectItem, attempts[i]);
                return true;
            } catch (e) { lastErr = e; }
        }
        throw new Error('타임라인에 넣지 못했습니다' + (lastErr ? ' (' + lastErr.toString() + ')' : ''));
    }
};

// ==================================================================
// 공통 기능
// ==================================================================
EddieDrop.core = {

    /** 패널 ↔ 프리미어 연결 확인 */
    ping: function () {
        try {
            var seq = null;
            if (app.project && app.project.activeSequence) {
                var s = app.project.activeSequence;
                seq = { name: s.name, videoTracks: s.videoTracks.numTracks, audioTracks: s.audioTracks.numTracks };
            }
            return EddieDrop.ok({
                appName: app.appName ? app.appName : 'Premiere Pro',
                version: app.version,
                projectName: app.project ? app.project.name : null,
                projectPath: (app.project && app.project.path) ? app.project.path : null,
                sequence: seq
            });
        } catch (e) { return EddieDrop.fail(e.toString()); }
    },

    hasActiveSequence: function () {
        try { return EddieDrop.ok(!!(app.project && app.project.activeSequence)); }
        catch (e) { return EddieDrop.fail(e.toString()); }
    },

    /** 파일을 프로젝트로 불러온다 (이미 있으면 재사용). args: { path, bin: [...] } */
    importFile: function (argStr) {
        try {
            var a = EddieDrop.parse(argStr);
            if (!a.path) return EddieDrop.fail('파일 경로가 없습니다.');
            if (!app.project) return EddieDrop.fail('프로젝트가 열려 있지 않습니다.');

            var existing = EddieDrop.util.findByMediaPath(a.path);
            if (existing) {
                var info = EddieDrop.util.itemInfo(existing);
                info.reused = true;
                return EddieDrop.ok(info);
            }

            var bin = EddieDrop.util.ensureBin(a.bin || ['Eddie Drop']);
            var before = bin.children.numItems;
            app.project.importFiles([a.path], true, bin, false);

            var item = EddieDrop.util.findByMediaPath(a.path);
            if (!item && bin.children.numItems > before) item = bin.children[bin.children.numItems - 1];
            if (!item) return EddieDrop.fail('파일을 불러오지 못했습니다. 프리미어가 지원하지 않는 형식일 수 있어요.');

            var out = EddieDrop.util.itemInfo(item);
            out.reused = false;
            return EddieDrop.ok(out);
        } catch (e) { return EddieDrop.fail(e.toString()); }
    },

    /**
     * 여러 파일을 한 번에 불러온다 (폴더 단위).
     * args: { paths: [...], bin: [...] }
     */
    importMany: function (argStr) {
        try {
            var a = EddieDrop.parse(argStr);
            var paths = a.paths || [];
            if (!paths.length) return EddieDrop.fail('불러올 파일이 없습니다.');
            if (!app.project) return EddieDrop.fail('프로젝트가 열려 있지 않습니다.');

            var bin = EddieDrop.util.ensureBin(a.bin || ['Eddie Drop']);

            // 이미 들어와 있는 건 빼고 넣는다
            var todo = [], skipped = 0;
            for (var i = 0; i < paths.length; i++) {
                if (EddieDrop.util.findByMediaPath(paths[i])) { skipped++; continue; }
                todo.push(paths[i]);
            }

            if (todo.length) app.project.importFiles(todo, true, bin, false);

            return EddieDrop.ok({ added: todo.length, skipped: skipped, bin: bin.name });
        } catch (e) { return EddieDrop.fail(e.toString()); }
    },

    /** 소스 모니터에 열기. args: { nodeId } 또는 { path } */
    openInSource: function (argStr) {
        try {
            var a = EddieDrop.parse(argStr);
            var item = a.nodeId ? EddieDrop.util.findByNodeId(a.nodeId)
                                : (a.path ? EddieDrop.util.findByMediaPath(a.path) : null);
            if (!item) return EddieDrop.fail('프로젝트에서 항목을 찾지 못했습니다.');
            app.sourceMonitor.openProjectItem(item);
            return EddieDrop.ok({ name: item.name });
        } catch (e) { return EddieDrop.fail(e.toString()); }
    },

    /** 플레이헤드 위치에 삽입/덮어쓰기. args: { nodeId|path, mode, kind } */
    place: function (argStr) {
        try {
            var a = EddieDrop.parse(argStr);
            var seq = EddieDrop.util.activeSequenceOrThrow();

            var item = a.nodeId ? EddieDrop.util.findByNodeId(a.nodeId)
                                : (a.path ? EddieDrop.util.findByMediaPath(a.path) : null);
            if (!item) return EddieDrop.fail('프로젝트에서 항목을 찾지 못했습니다.');

            var mode = (a.mode === 'overwrite') ? 'overwrite' : 'insert';
            var isAudio = (a.kind === 'audio');
            var tracks = isAudio ? seq.audioTracks : seq.videoTracks;
            if (!tracks.numTracks) return EddieDrop.fail((isAudio ? '오디오' : '비디오') + ' 트랙이 없습니다.');

            var pos = seq.getPlayerPosition();
            var pick = EddieDrop.util.chooseTrack(tracks, pos.seconds);
            var track = tracks[pick.index];
            EddieDrop.util.placeClip(track, item, pos, mode);

            // 방금 넣은 클립 찾기 (볼륨 맞추기 · 플레이헤드 이동에 쓴다)
            var placedClip = null;
            try {
                for (var c = 0; c < track.clips.numItems; c++) {
                    var clip = track.clips[c];
                    if (Math.abs(clip.start.seconds - pos.seconds) < 0.01) { placedClip = clip; break; }
                }
            } catch (eFind) {}

            // 오디오 레벨 맞추기 (-15dB 등)
            var leveled = null;
            if (placedClip && a.levelDb !== undefined && a.levelDb !== null) {
                leveled = EddieDrop.util.applyClipLevel(placedClip, a.levelDb) ? a.levelDb : false;
            }

            // 프리미어 기본 삽입처럼, 넣은 클립 끝으로 플레이헤드를 옮긴다
            var movedTo = null;
            if (a.advance !== false && placedClip) {
                try {
                    seq.setPlayerPosition(placedClip.end.ticks);
                    movedTo = placedClip.end.seconds;
                } catch (e2) { /* 옮기지 못해도 삽입은 성공이다 */ }
            }

            return EddieDrop.ok({
                track: (isAudio ? 'A' : 'V') + (pick.index + 1),
                mode: mode,
                reason: pick.reason,
                warn: pick.warn,
                at: pos.seconds,
                movedTo: movedTo,
                leveled: leveled,
                sequence: seq.name
            });
        } catch (e) { return EddieDrop.fail(e.toString()); }
    },

    /**
     * 끌어놓기로 들어온 클립의 레벨을 맞춘다.
     * 드롭은 프리미어가 알아서 처리하므로 패널이 클립을 만들지 않는다.
     * → 같은 파일을 쓰는 오디오 클립 중 "볼륨을 아직 안 건드린 것" 만 손본다.
     * args: { path, levelDb }
     */
    levelClipsByPath: function (argStr) {
        try {
            var a = EddieDrop.parse(argStr);
            if (!a.path || a.levelDb === undefined || a.levelDb === null) {
                return EddieDrop.fail('경로나 레벨 값이 없습니다.');
            }
            var seq = EddieDrop.util.activeSequenceOrThrow();
            var tracks = seq.audioTracks;
            var defaultLevel = EddieDrop.util.dbToLevel(0);
            var changed = 0, found = 0;

            for (var t = 0; t < tracks.numTracks; t++) {
                var track = tracks[t];
                for (var c = 0; c < track.clips.numItems; c++) {
                    var clip = track.clips[c];
                    var mp = '';
                    try { mp = clip.projectItem.getMediaPath(); } catch (e) { continue; }
                    if (!mp || !EddieDrop.util.sameFile(mp, a.path)) continue;
                    found++;

                    var prop = EddieDrop.util.findLevelProperty(clip);
                    if (!prop) continue;

                    // 사용자가 이미 볼륨을 만졌으면 그대로 둔다
                    var cur = null;
                    try { cur = prop.getValue(); } catch (e2) {}
                    if (typeof cur === 'number' && Math.abs(cur - defaultLevel) > 0.0008) continue;

                    if (EddieDrop.util.applyClipLevel(clip, a.levelDb)) changed++;
                }
            }
            return EddieDrop.ok({ count: changed, found: found });
        } catch (e) { return EddieDrop.fail(e.toString()); }
    },

    /** 불러오기 + (소스 모니터) + (삽입/덮어쓰기) 한 번에 */
    importAndPlace: function (argStr) {
        try {
            var a = EddieDrop.parse(argStr);
            var impRaw = EddieDrop.core.importFile(argStr);
            var imp = EddieDrop.parse(impRaw);
            if (!imp.ok) return impRaw;

            var result = { item: imp.data, placed: null, opened: false };

            if (a.openInSource) {
                var opened = EddieDrop.parse(EddieDrop.core.openInSource(EddieDrop.stringify({ nodeId: imp.data.nodeId })));
                result.opened = !!opened.ok;
            }

            if (a.mode === 'insert' || a.mode === 'overwrite') {
                var placed = EddieDrop.parse(EddieDrop.core.place(EddieDrop.stringify({
                    nodeId: imp.data.nodeId, mode: a.mode, kind: a.kind, advance: a.advance, levelDb: a.levelDb
                })));
                if (!placed.ok) return EddieDrop.fail(placed.error);
                result.placed = placed.data;
            }

            return EddieDrop.ok(result);
        } catch (e) { return EddieDrop.fail(e.toString()); }
    }
};

// ==================================================================
// 패널에서 부르는 유일한 전역 함수
//   ED_call("ping", "{}")
//   ED_call("importAndPlace", "{...}")
// ==================================================================
function ED_call(fn, argStr) {
    try {
        var f = EddieDrop.core[fn];
        if (typeof f !== 'function') return EddieDrop.fail('기능을 찾을 수 없습니다: ' + fn);
        return f(argStr);
    } catch (e) {
        return EddieDrop.fail(e.toString());
    }
}
