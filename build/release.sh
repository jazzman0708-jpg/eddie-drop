#!/bin/bash
#
# Eddie Drop 배포 — 버전 하나만 넣으면 끝난다
#
#   ./build/release.sh 1.2.0
#   ./build/release.sh 1.2.0 --notes "효과음 검색이 빨라졌어요"
#
# 하는 일
#   1. 버전 번호를 manifest.xml · plugin.json 두 곳에 똑같이 써넣는다
#   2. 기능 파일(plugin/)을 zip 으로 묶는다
#   3. zip 의 지문(sha256)을 계산한다
#   4. version.json 을 만든다  ← 패널이 이 파일을 보고 새 버전을 안다
#   5. 깃허브에 커밋·태그·푸시하고, 릴리스에 zip 을 올린다
#
# 옵션
#   --notes "글"     달라진 점 (안 적으면 물어본다)
#   --min 1.0.0      이 버전보다 낮으면 못 쓰게 막는다
#   --installer      설치 파일을 새로 받아야 하는 큰 변경이다
#   --yes            확인 묻지 않고 바로 진행
#   --dry-run        깃허브에 올리지 않고 만들기만 해본다
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DIST="$ROOT/dist"

OWNER="jazzman0708-jpg"
REPO="eddie-drop"

say()  { printf "\033[36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[32m✅ %s\033[0m\n" "$*"; }
warn() { printf "\033[33m⚠️  %s\033[0m\n" "$*"; }
die()  { printf "\033[31m❌ %s\033[0m\n" "$*" >&2; exit 1; }

# ------------------------------------------------------------------
# 옵션 읽기
# ------------------------------------------------------------------
VERSION="${1:-}"
shift || true
NOTES=""
MIN=""
INSTALLER="false"
ASSUME_YES=0
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --notes)     NOTES="${2:-}"; shift 2 ;;
    --min)       MIN="${2:-}"; shift 2 ;;
    --installer) INSTALLER="true"; shift ;;
    --yes|-y)    ASSUME_YES=1; shift ;;
    --dry-run)   DRY=1; shift ;;
    *) die "모르는 옵션입니다: $1" ;;
  esac
done

[ -n "$VERSION" ] || die "쓰는 법: ./build/release.sh 1.2.0 [--notes \"달라진 점\"]"
echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || die "버전은 1.2.0 처럼 숫자 세 개여야 합니다 (넣은 값: $VERSION)"

command -v gh >/dev/null || die "gh 명령을 찾을 수 없습니다. 새 터미널을 열어 보세요."
gh auth status >/dev/null 2>&1 || die "깃허브에 로그인돼 있지 않습니다:  gh auth login"

cd "$ROOT"

# ------------------------------------------------------------------
# 지금 버전 확인 — 뒤로 가는 배포는 막는다
# ------------------------------------------------------------------
CUR="$(python3 -c "import xml.etree.ElementTree as ET;print(ET.parse('CSXS/manifest.xml').getroot().attrib['ExtensionBundleVersion'])")"

python3 - "$CUR" "$VERSION" <<'PY' || die "새 버전이 지금 버전보다 높아야 합니다."
import sys
def t(v): return tuple(int(x) for x in v.split('.'))
sys.exit(0 if t(sys.argv[2]) > t(sys.argv[1]) else 1)
PY

git rev-parse "v$VERSION" >/dev/null 2>&1 && die "v$VERSION 태그가 이미 있습니다."

say "Eddie Drop  v$CUR  →  v$VERSION"

# ------------------------------------------------------------------
# 달라진 점
# ------------------------------------------------------------------
if [ -z "$NOTES" ]; then
  echo
  echo "이번 버전에서 달라진 점을 적어주세요. (여러 줄 가능 · 다 적었으면 빈 줄에서 Enter)"
  NOTES=""
  while IFS= read -r line; do
    [ -z "$line" ] && break
    NOTES="${NOTES}${line}"$'\n'
  done
  NOTES="$(printf '%s' "$NOTES" | sed -e 's/[[:space:]]*$//')"
fi
[ -n "$NOTES" ] || NOTES="자잘한 개선과 오류 수정"

# ------------------------------------------------------------------
# 1. 버전 번호 써넣기 (manifest.xml · plugin.json)
# ------------------------------------------------------------------
say "버전 번호 적용 중…"
python3 - "$VERSION" <<'PY'
import sys, io, re, json, collections
v = sys.argv[1]

# manifest.xml — 속성 두 곳
p = 'CSXS/manifest.xml'
s = io.open(p, encoding='utf-8').read()
s = re.sub(r'ExtensionBundleVersion="[^"]*"', 'ExtensionBundleVersion="%s"' % v, s, count=1)
s = re.sub(r'(<Extension Id="[^"]*" Version=")[^"]*"', r'\g<1>%s"' % v, s, count=1)
io.open(p, 'w', encoding='utf-8').write(s)

# plugin.json
p = 'plugin/plugin.json'
m = json.load(io.open(p, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
m['version'] = v
io.open(p, 'w', encoding='utf-8').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('   manifest.xml · plugin.json → v%s' % v)
PY

python3 "$HERE/check-payload.py" "$ROOT/plugin" "$VERSION" || die "기능 파일 확인 실패"

# ------------------------------------------------------------------
# 2. 기능 파일 zip 으로 묶기
#    (확장 껍데기는 넣지 않는다 — 패널이 받아서 갈아끼우는 건 plugin/ 뿐이다)
# ------------------------------------------------------------------
say "기능 파일 압축 중…"
mkdir -p "$DIST"
ZIP="$DIST/eddie-drop-plugin-$VERSION.zip"
rm -f "$ZIP"
( cd "$ROOT/plugin" && zip -qr "$ZIP" . -x ".DS_Store" -x "__MACOSX/*" )
[ -f "$ZIP" ] || die "압축 실패"

# ------------------------------------------------------------------
# 3. 지문(sha256) 계산 — 패널이 받은 파일이 맞는지 확인하는 데 쓴다
# ------------------------------------------------------------------
SHA="$(shasum -a 256 "$ZIP" | cut -d' ' -f1)"
ok "$(basename "$ZIP")  ·  $(du -h "$ZIP" | cut -f1)"
echo "   지문: $SHA"

# ------------------------------------------------------------------
# 4. version.json 만들기 — 패널이 이 파일 하나만 본다
# ------------------------------------------------------------------
say "version.json 만드는 중…"
URL="https://github.com/$OWNER/$REPO/releases/download/v$VERSION/$(basename "$ZIP")"
NOTES="$NOTES" URL="$URL" SHA="$SHA" VERSION="$VERSION" MIN="$MIN" \
INSTALLER="$INSTALLER" OWNER="$OWNER" REPO="$REPO" python3 - <<'PY'
import os, io, json, collections, datetime
d = collections.OrderedDict()
d['version'] = os.environ['VERSION']
d['date'] = datetime.date.today().isoformat()
d['url'] = os.environ['URL']
d['sha256'] = os.environ['SHA']
d['notes'] = os.environ['NOTES']
if os.environ.get('MIN'):
    d['minSupportedVersion'] = os.environ['MIN']
if os.environ['INSTALLER'] == 'true':
    d['requiresInstaller'] = True
    d['installerPage'] = 'https://github.com/%s/%s/releases/latest' % (os.environ['OWNER'], os.environ['REPO'])
io.open('version.json', 'w', encoding='utf-8').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
PY
cat version.json | sed 's/^/   /'

# ------------------------------------------------------------------
# 5. 깃허브에 올리기
# ------------------------------------------------------------------
if [ "$DRY" = "1" ]; then
  # 연습이므로 고쳐놓은 버전 번호를 되돌린다.
  # (안 되돌리면 진짜로 배포할 때 "이미 그 버전" 이라며 막힌다)
  git checkout -- CSXS/manifest.xml plugin/plugin.json 2>/dev/null || true
  rm -f version.json
  warn "--dry-run 이라 여기서 멈춥니다."
  echo "   깃허브에 아무것도 올리지 않았고, 버전 번호도 v$CUR 그대로 되돌렸습니다."
  echo "   만들어본 파일: $(basename "$ZIP")"
  exit 0
fi

echo
say "깃허브에 올릴 내용"
git add -A
git status --short | sed 's/^/   /'
echo
echo "   태그    : v$VERSION"
echo "   릴리스  : $(basename "$ZIP") 첨부"
echo

if [ "$ASSUME_YES" != "1" ]; then
  printf "올릴까요? (y/N) "
  read -r answer
  case "$answer" in
    y|Y|yes) ;;
    *) die "취소했습니다. (파일은 그대로 남아 있습니다)" ;;
  esac
fi

git commit -q -m "v$VERSION

$NOTES"
git tag "v$VERSION"
git push -q origin HEAD
git push -q origin "v$VERSION"
ok "커밋·태그 올림"

# 릴리스 만들고 zip 첨부
gh release create "v$VERSION" "$ZIP" \
  --title "Eddie Drop v$VERSION" \
  --notes "$NOTES" >/dev/null
ok "릴리스 만듦 · zip 첨부 완료"

# ------------------------------------------------------------------
# 6. 패널이 실제로 볼 주소가 살아 있는지 확인
# ------------------------------------------------------------------
say "확인 중…"

# (1) 저장소에 제대로 들어갔는지 — 이건 바로 확인된다
ONREPO="$(gh api "repos/$OWNER/$REPO/contents/version.json" --jq '.content' 2>/dev/null \
          | base64 -d 2>/dev/null \
          | python3 -c "import sys,json;print(json.load(sys.stdin)['version'])" 2>/dev/null || true)"
if [ "$ONREPO" = "$VERSION" ]; then
  ok "저장소에 version.json 반영됨 (v$VERSION)"
else
  die "저장소의 version.json 이 v$VERSION 이 아닙니다 (읽은 값: ${ONREPO:-없음})"
fi

# (2) 패널이 실제로 읽는 주소는 깃허브 CDN 을 거쳐서 최대 5분 늦다
RAW="https://raw.githubusercontent.com/$OWNER/$REPO/main/version.json"
GOT=""
for i in $(seq 1 10); do
  GOT="$(curl -fsSL "$RAW?t=$(date +%s)$i" 2>/dev/null \
        | python3 -c "import sys,json;print(json.load(sys.stdin)['version'])" 2>/dev/null || true)"
  [ "$GOT" = "$VERSION" ] && break
  sleep 15
done
if [ "$GOT" = "$VERSION" ]; then
  ok "패널이 보는 주소에도 반영됨"
else
  warn "패널이 보는 주소는 아직 v${GOT:-?} 입니다."
  echo "   깃허브 CDN 캐시 때문이며, 몇 분 뒤 저절로 바뀝니다. 배포 자체는 정상입니다."
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' -L "$URL")"
[ "$CODE" = "200" ] && ok "zip 내려받기 확인 (HTTP 200)" || warn "zip 주소 응답: HTTP $CODE"

echo
ok "v$VERSION 배포 끝"
echo "   릴리스 : https://github.com/$OWNER/$REPO/releases/tag/v$VERSION"
echo "   이제 사용자 패널에서 [업데이트 확인] 을 누르면 v$VERSION 이 보입니다."
