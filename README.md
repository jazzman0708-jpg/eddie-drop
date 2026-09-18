# Eddie Drop

프리미어 프로용 소스 검색 패널 (CEP 확장).
Pexels · Pixabay · GIPHY · Freesound 에서 영상 · 이미지 · GIF · 효과음을 찾아 바로 타임라인에 넣는다.

- 번들 ID: `com.eddie.drop`
- **패널 ID: `com.eddie.drop.panel` (고정 — 바꾸지 말 것)**
- 대상: Adobe Premiere Pro 14.0 ~ (CEP 9~12)
- 패널 위치: **Window → Extensions → Eddie Drop**

## 다른 에디 플러그인과의 연결

**① 대시보드에서 이 패널 열기** — 나중에 만들 "Eddie 대시보드" 확장에서:
```js
new CSInterface().requestOpenExtension('com.eddie.drop.panel', '');
```
패널 ID는 고정이므로 이 코드는 계속 동작한다.

**② 설정 공유** — API 키·다운로드 폴더는 아래 파일에 저장된다.
```
~/Library/Application Support/Eddie/shared-settings.json
```
```json
{
  "version": 1,
  "shared": { "keys": {...}, "downloadDir": "...", "insertMode": "insert" },
  "apps":   { "eddie-drop": { "quality": "fhd", "binRoot": "Eddie Drop", ... } }
}
```
- `shared` : 모든 에디 플러그인이 함께 쓰는 값 (API 키 등) — 한 번만 입력하면 된다
- `apps.<플러그인id>` : 그 플러그인만 쓰는 값
- 저장할 때마다 파일을 다시 읽고 자기 부분만 고쳐 쓰므로, 다른 플러그인 설정을 지우지 않는다
- 임시 파일에 쓴 뒤 이름을 바꾸는 방식(atomic)이라 쓰다 말고 깨지지 않는다
- API 키가 들어 있어 권한은 `600`(본인만 읽기)

## 폴더 구조

```
eddie-drop/
├─ CSXS/manifest.xml   패널 등록 정보
├─ .debug              원격 디버깅 포트 8099
├─ index.html          패널 화면
├─ __test.html         브라우저 검사용 (배포 시 제외)
├─ css/style.css       다크 테마
├─ js/
│  ├─ CSInterface.js   Adobe 공식 (CEP 12.0.0)
│  ├─ eddie.js         전역 Eddie 객체 · 패널 ID
│  ├─ settings.js      공유 설정 파일 읽기/쓰기
│  ├─ net.js           Node https 요청
│  ├─ download.js      다운로드 · 파일/썸네일 캐시
│  ├─ cache.js         검색 결과 TTL 캐시
│  ├─ host.js          ExtendScript 호출 다리
│  ├─ ui.js            토스트 · 상태바 · DOM 부품
│  ├─ premiere.js      받기 → 불러오기 → 삽입 흐름
│  ├─ grid.js          결과 그리드
│  ├─ api/pexels.js    · pixabay.js · giphy.js · freesound.js
│  ├─ media-tab.js     영상 · 이미지 탭
│  ├─ giphy-tab.js     GIF · 스티커 탭
│  ├─ sfx-dictionary.js 효과음 한글→영어 사전 · 태그 칩
│  ├─ sfx-tab.js       효과음 탭 (리스트 · 미리듣기)
│  ├─ files-tab.js     내 파일 탭 (내 컴퓨터 파일 찾아보기)
│  ├─ shortcuts.js     , . 등 키를 패널이 가져가기 (이중 실행 방지)
│  └─ main.js          탭 · 설정 화면 · 단축키
└─ jsx/host.jsx        프리미어 조작 (EddieDrop.core.*)
```

검색 소스를 추가하려면 `js/api/<이름>.js` 에 어댑터를 만들고
`Sources.adapters.<이름>` 에 등록한 뒤 `index.html` 에 script 한 줄을 넣으면 된다.

## 개발 환경

```
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```
```
~/Library/Application Support/Adobe/CEP/extensions/com.eddie.drop
  -> ~/Desktop/클로드코드/eddie-drop          (심볼릭 링크)
```
원격 디버깅: 패널을 연 뒤 크롬에서 `http://localhost:8099`
브라우저에서 빠르게 검사: `python3 -m http.server 8777` 후 `__test.html`

## 진행 상황

- [x] 1단계 뼈대 + 설정 탭
- [x] 2단계 Pexels 영상/이미지 (+ fps 필터, 드래그앤드롭)
- [x] 3단계 Pixabay
- [x] 4단계 GIPHY (GIF · 스티커)
- [x] 5단계 Freesound (효과음)
- [x] 6단계 필터 · 단축키 다듬기
- [ ] 7단계 ZXP 패키징 + 설치방법.md

## 확인한 API 사양 (2026-09-17 공식 문서 기준)

| 소스 | 엔드포인트 | 인증 | 비고 |
|---|---|---|---|
| Pexels 이미지 | `GET https://api.pexels.com/v1/search` | 헤더 `Authorization: KEY` | `locale=ko-KR` 지원 |
| Pexels 영상 | `GET https://api.pexels.com/videos/search` | 동일 | 시간당 200 / 월 20,000 · 응답에 fps 있음 |
| Pixabay 이미지 | `GET https://pixabay.com/api/` | `key=` | `lang=ko`, per_page 3~200 |
| Pixabay 영상 | `GET https://pixabay.com/api/videos/` | `key=` | **fps 정보 없음**, 영상은 방향 필터 없음 |
| GIPHY | `/v1/gifs/search` · `/v1/stickers/search` | `api_key=` | limit 최대 50(베타 키) |
| Freesound | `GET https://freesound.org/apiv2/search/` | `token=` | 구 `search/text/` 2025-11 폐기, 토큰은 미리듣기만 |

### Pixabay 규정 대응
- **응답 24시간 캐시**: `Eddie.cache` 에 24시간 TTL로 저장
- **이미지 핫링크 금지**: 썸네일도 `Eddie.download.cacheThumb()` 로 로컬에 받아서 표시

### GIPHY 약관 대응
- **"Powered by GIPHY" 표기**: GIF·스티커 탭 하단에 고정 표시 (필수)
  ⚠ 공개 배포 전에는 GIPHY 공식 로고 이미지로 바꿔야 한다 (현재는 텍스트 마크)
- **다른 사이트 결과와 섞지 않기**: GIF·스티커를 Pexels/Pixabay와 다른 탭으로 분리
- **다운로드 형식**: GIF 탭은 `images.original.mp4`, 스티커 탭은 투명 배경 때문에 GIF 원본
- ⚠ 프로덕션 API 키 신청 시 "미디어 캐시 금지" 조항 확인

### fps 필터
어느 사이트도 fps 검색 파라미터를 주지 않는다. Pexels는 응답의 `video_files[].fps`
를 보고 패널에서 걸러내고, 8개 미만이면 다음 페이지를 최대 3번 자동으로 더 가져온다.
Pixabay는 fps 정보가 없어서 적용되지 않는다고 결과 위에 안내한다.

### 영상 · 이미지 크기 맞추기
설정 `fitMode` 로 넣을 때 클립 크기를 시퀀스 프레임에 맞춘다.
- `none` 원본 그대로
- `scale` 프리미어 기본 기능 **프레임 크기로 비율 조정** (`projectItem.setScaleToFrameSize()`)
- `fit` 화면 안에 다 들어오게 — `scale = min(프레임W/소스W, 프레임H/소스H) × 100`
- `fill` 화면을 꽉 채우게 — `scale = max(...) × 100`

크기 속성은 보통 `clip.components[0].properties[1]`(Motion > Scale)이지만,
한글 프리미어 등에서 다를 수 있어 못 찾으면 값이 100 인 속성을 훑어서 찾는다.

### 효과음 레벨 자동 맞추기
목표 레벨은 설정의 **페이더**(-30 ~ 0 dB, 0.5 단위, 기본 -15)로 조절한다.
넣기 전에 받은 파일의 **피크를 재서** 클립 볼륨을 목표치(**기본 -15 dB**)에 맞춘다.
효과음마다 크기가 들쭉날쭉하지 않게 하려는 것.

1. `js/audio-level.js` 가 Node `fs` 로 파일을 읽어 Web Audio `decodeAudioData` 로 디코딩
2. 전 채널 샘플을 훑어 최대 절대값 → `peakDb = 20·log10(peak)`
3. `gainDb = 목표 - peakDb` (+15 ~ -60 으로 제한)
4. `jsx/host.jsx` 가 넣은 클립을 찾아 볼륨 속성에 적용

**끌어놓기로 넣을 때**는 프리미어가 알아서 클립을 만들기 때문에 패널이 손댈 기회가 없다.
그래서 `Eddie.premiere.afterDrop()` 이 나중에 클립을 찾아 뒷정리한다.

⚠ **`dragend` 는 믿을 수 없다.** 드롭이 CEF 밖(프리미어)에서 끝나면 이벤트가 안 올 수 있다.
그래서 **`dragstart` 시점부터** 감시를 시작해 0.6초 뒤부터 0.7초 간격으로 **약 10초간** 확인한다.
(중복 실행은 `item.__afterDropRunning` 로 막는다)
- 효과음 → `levelClipsByPath` 로 레벨 맞추기
- 영상·이미지 → `fitClipsByPath` 로 크기 맞추기

클립이 생길 때까지 0.7초 간격으로 최대 6번 확인하고,
건너뛰는 기준은 **"이미 목표값인 클립"** 이다.
(처음엔 "크기 100% 인 것만" 으로 했는데, 프리미어 환경설정의 자동 스케일 때문에
갓 놓은 클립이 100% 가 아닌 경우가 있어 그냥 건너뛰어 버렸다)

프리미어 클립 볼륨(Level)은 **0~1 실수이고 1.0 이 +15 dB** 다.
```
level = 10 ^ ((dB - 15) / 20)      // 0dB → 0.1778,  -15dB → 0.0316
```
볼륨 속성은 보통 `clip.components[0].properties[1]` 이지만, 한글 프리미어 등에서 다를 수 있어
못 찾으면 0~1 값을 가진 속성을 훑어서 찾는다.

측정 정확도 확인(알려진 진폭의 WAV):
`0.5 → -6.02dB`, `0.1 → -20.00dB`, `0.944 → -0.50dB` 모두 이론값과 일치.

### 내 파일 탭
내 컴퓨터에 있는 영상 · 이미지 · 소리를 찾아 바로 넣는다. 인터넷에서 받지 않으므로 다운로드 단계가 없다.
- 폴더 선택 · ↑상위 · 자주 쓰는 폴더 6개 (칩) · 새로고침
- 파일 이름 검색 · 종류(영상/이미지/소리) 필터 · **하위 폴더까지**(3단계, 최대 400개)
- 정렬 7가지: 이름순 · 이름 거꾸로 · **종류순** · 크기(큰/작은) · 최근/오래된 순 (선택은 저장된다)
  폴더는 어떤 정렬에서도 항상 맨 위에 모인다
- 썸네일: 이미지는 그대로, **영상은 첫 프레임**(`<video>` 를 0.5초 지점으로 이동시켜 표시), 소리는 🎵
- 폴더 카드에는 **폴더 이름을 타일 위에** 두 줄까지 보여준다
- 폴더는 더블클릭으로 들어간다. 소리는 클릭하면 패널에서 바로 들린다.
- 이미 컴퓨터에 있으니 **끌어놓기가 바로 된다** (받을 필요가 없음)
- 넣을 때도 효과음이면 **-15dB 자동 레벨**이 그대로 적용된다

`Eddie.premiere.run()` 에 `file.localPath` 를 주면 받기 단계를 건너뛰고 바로 불러온다.

**폴더 단위로 불러오기**
- 상단 **[이 폴더 전체를 프로젝트로 불러오기]** — 지금 보이는 파일들을 폴더 이름의 빈에 한 번에 넣는다
- 폴더 카드의 **[불러오기]** — 그 하위 폴더를 통째로
- `EddieDrop.core.importMany` 가 `importFiles()` 한 번으로 처리하고, **이미 들어와 있는 파일은 건너뛴다**

⚠ **CEP 폴더 선택 창은 경로를 `file:///Users/…/%EB%B0%94%EB%8B%A4` 형태로 돌려준다.**
`file://` 를 떼고 `decodeURIComponent` 하지 않으면 **폴더를 아예 못 읽는다** (`ENOENT`).
`Eddie.ui.decodePath()` 가 이 일을 하고, 설정에 잘못 저장된 값도 읽을 때 정리한다.
맥은 파일 이름 한글을 자모로 쪼개 저장(NFD)하므로 화면 표시는 `Eddie.ui.prettyName()` 으로 NFC 변환한다.

**보기 방식** — 검색창 아래에서 **썸네일 보기 / 목록 보기** 를 고른다 (선택은 저장된다).
목록 보기는 썸네일을 만들지 않고 **프리미어 프로젝트 패널처럼 작은 유형 아이콘**만 붙인다.
```
▶ 파랑   영상          ▣ 초록  이미지
♪ 노랑   소리          ▸ 회색  폴더        ✦ 보라  GIF · 스티커
```
한 줄에 `아이콘 · 파일이름 / 72MB · 23.11.30` 로 보여주고 줄 높이는 40px.
미리보기가 안 되는 파일이 많은 폴더나, 파일이 많을 때 훨씬 빠르고 보기 편하다.

⚠ **ProRes 등 일부 `.mov` 는 미리보기를 만들 수 없다** (`MEDIA_ERR_SRC_NOT_SUPPORTED`).
CEF(크로미움)가 그 코덱을 디코딩하지 못하기 때문이고, 패널 쪽에서 우회할 방법이 없다.
- macOS `qlmanage`(Quick Look)로 썸네일을 뽑아보려 했으나 **2분이 지나도 응답이 없어 포기**했다.
- ffmpeg 은 기본 설치가 아니라 배포판에 기댈 수 없다.
→ 검은 칸 대신 🎬 아이콘과 확장자(MOV)를 보여주고, **목록 보기**를 권한다.
   삽입 · 더블클릭 · 끌어놓기는 모두 정상 동작한다.

### 효과음 미리듣기 멈춤
설정 `sfxStopOnLeave` (기본 켜짐). 효과음 탭을 벗어나거나(`onHide`)
프리미어의 다른 패널로 이동하면(`window blur`) 듣고 있던 소리를 멈춘다.

### 효과음 미리듣기 볼륨
효과음 탭에 볼륨 슬라이더(0~100%)와 음소거 버튼이 있다. 값은 `sfxVolume` 으로 저장되고
재생할 때마다 `audio.volume` 에 반영된다. 음소거를 풀면 직전 볼륨으로 돌아온다.

### Freesound
- **CC0만 검색한다.** 2중으로 막는다.
  ① `filter` 에 항상 `license:"Creative Commons 0"` 를 붙인다 (사용자가 끌 수 없음)
  ② 응답을 받은 뒤에도 `license` 가 CC0 가 아니면 화면에 올리지 않는다
  실측(2026-09-17, "whoosh"): 필터 없이 4,178건(CC-BY·CC-BY-NC 섞임) → 필터 적용 2,308건 전부 CC0.
  각 줄에 초록색 `CC0` 배지를 표시해 눈으로도 확인된다.
- **API 키로는 미리듣기 파일만 받을 수 있다** (`preview-hq-mp3`, 약 128kbps).
  원본(wav/flac 등)은 OAuth2 로그인이 필요하다.
- 한글 검색: `js/sfx-dictionary.js` 의 사전으로 단어를 영어로 바꿔서 보낸다.
  사전에 없는 한글이 남으면 "영어로 검색하면 결과가 더 많아요" 안내를 띄운다.
- 태그 여러 개는 `filter=tag:a tag:b` (공백 = AND), 길이는 `duration:[0 TO 3]` 형식.

#### 원본 파일 받기 (OAuth2) — 2차 작업용 메모
1. <https://freesound.org/apiv2/apply/> 에서 앱 등록 → `client_id`, `client_secret`, redirect URI 설정
2. 패널에서 Node로 `http://localhost:<빈포트>/callback` 짧게 띄우고, 그 주소를 redirect URI 로 등록
3. 브라우저를 `https://freesound.org/apiv2/oauth2/authorize/?client_id=<ID>&response_type=code` 로 연다
4. 사용자가 로그인·승인 → redirect 로 `?code=...` 가 돌아온다
5. `POST https://freesound.org/apiv2/oauth2/access_token/`
   (`client_id`, `client_secret`, `grant_type=authorization_code`, `code`) → `access_token`(24시간) + `refresh_token`
6. 원본 내려받기: `GET /apiv2/sounds/<id>/download/` + 헤더 `Authorization: Bearer <access_token>`
7. 만료되면 `grant_type=refresh_token` 으로 갱신

⚠ `client_secret` 을 패널 안에 넣으면 누구나 꺼내볼 수 있다. 공개 배포한다면
   ① 사용자가 각자 앱을 등록해 client_id/secret 을 설정 탭에 넣게 하거나
   ② 토큰 교환만 내 서버(Cloudflare Workers 등)를 거치게 해야 한다.

### 단축키 — 패널은 , . 를 쓰지 않는다 (중요)

**`registerKeyEventsInterest` 는 실제로 키를 막아주지 못한다.**
패널 안에서 `,` 를 누르면 **패널도 받고 프리미어도 받아서**,
패널이 고른 클립과 **소스 모니터에 열려 있던 클립이 둘 다** 삽입된다.
Adobe 가 오래 방치한 CEP 버그다 ([CEP-Resources #165](https://github.com/Adobe-CEP/CEP-Resources/issues/165)).

실측 증거 (패널에 기록기를 심어 확인):
```
키 ","  hasFocus: true   active: sfx-list    ← 12번 모두 패널에 정상 도착
```
포커스는 멀쩡했다. 포커스 문제가 아니라 **키를 독점할 수 없는 게 원인**이었다.
`requestOpenExtension` 으로 포커스를 되찾는 것도 안 된다 (9번 연속 시도 동안 `hasFocus:false` 유지).

**`,` `.` 는 그대로 쓴다 — 이 동작을 알고 쓰는 것으로 정했다.**
패널에서 `,` 를 누르면 패널이 고른 클립이 들어가고, 소스 모니터에 열린 클립이 있으면 그것도 같이 들어간다.
설정 화면과 각 탭 안내에 이 점을 적어 두었다.

**`Enter` 만 뺐다.** 프리미어의 "인/아웃 렌더" 가 같이 돌아버리기 때문이다.
소스 모니터에 열려면 **더블클릭**을 쓴다.

**깔끔하게 넣는 방법** (프리미어가 끼어들지 않음)
1. 카드/줄의 **[삽입] [덮어쓰기] 버튼**
2. **끌어놓기**
3. **더블클릭 → 소스 모니터** → 인/아웃 찍고 프리미어 기본 `,` `.`

| 키 | 동작 | 맥 코드 | 윈도 코드 |
|---|---|---|---|
| `,` | 삽입 (프리미어도 같이 반응) | 43 | 188 |
| `.` | 덮어쓰기 (프리미어도 같이 반응) | 47 | 190 |
| Tab | 다음 결과 (Shift+Tab 이전) | 48 | 9 |
| Space | 미리보기 / 미리듣기 | 49 | 32 |
| ← → ↓ ↑ | 결과 이동 (프리미어가 가져감 — 안내에서 제외) | 123 124 125 126 | 37 39 40 38 |

### 지원하지 않는 필터
소스가 지원하지 않는 필터는 **회색으로 잠그고** 이유를 툴팁으로 보여준다.
- Pixabay 영상 → 방향 필터 잠금
- Pixabay 단독 → fps 필터 잠금 (fps 정보를 주지 않음)
- Pixabay 이미지 → 방향 중 "정사각" 만 잠금
- Pexels → 색상 중 "투명 · 흑백" 만 잠금
"둘 다" 로 검색할 때는 잠그지 않고, 어느 쪽에만 적용되는지 안내 문구를 띄운다.

### 드래그앤드롭
Adobe가 지원하는 방향은 **패널 → 프리미어** 한쪽뿐이다.
`dragstart` 에서 `dataTransfer.setData('com.adobe.cep.dnd.file.0', 로컬경로)`.
파일이 디스크에 있어야 하므로 카드를 누르는 순간 미리 받는다.

---

## 배포 전에 할 일 (메모)

- GIPHY 공식 로고 이미지로 교체
- ZXPSignCmd로 자체 서명 인증서를 만들어 `.zxp` 생성 (`__test.html` 제외)
- 일반 사용자용 `설치방법.md` 작성
