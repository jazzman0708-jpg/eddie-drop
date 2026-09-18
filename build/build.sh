#!/bin/bash
#
# Eddie Drop 설치 파일 만들기
#
#   ./build/build.sh            맥 .pkg + (가능하면) 윈도우 .exe
#   ./build/build.sh mac        맥만
#   ./build/build.sh win        윈도우만
#
# 결과물
#   dist/EddieDrop-<버전>-mac.pkg
#   dist/EddieDrop-<버전>-win.exe
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DIST="$ROOT/dist"
WORK="$ROOT/build/.work"

BUNDLE_ID="com.eddie.drop"
APP_NAME="Eddie Drop"

TARGET="${1:-all}"

# 배포본에 넣지 않을 것들 (개발용)
EXCLUDES=(
  "build" "dist" ".git" ".github" ".gitignore" ".debug" ".dev" "__test.html" ".DS_Store"
  # 개발자·배포자용 문서는 사용자 확장 폴더에 넣지 않는다
  "README.md" "docs" "배포방법.md" "설치방법.md" "version.json"
)

say()  { printf "\033[36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "\033[32m✅ %s\033[0m\n" "$*"; }
warn() { printf "\033[33m⚠️  %s\033[0m\n" "$*"; }
die()  { printf "\033[31m❌ %s\033[0m\n" "$*" >&2; exit 1; }

# ------------------------------------------------------------------
# 1. 버전 읽기 — manifest.xml 한 곳에서만 관리한다
# ------------------------------------------------------------------
read_version() {
  python3 - "$ROOT/CSXS/manifest.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
v = root.attrib.get('ExtensionBundleVersion')
if not v:
    sys.exit('manifest.xml 에서 ExtensionBundleVersion 을 찾지 못했습니다.')
print(v)
PY
}

VERSION="$(read_version)"
say "Eddie Drop $VERSION 설치 파일 만들기"

# ------------------------------------------------------------------
# 2. 배포할 파일만 모으기
# ------------------------------------------------------------------
stage() {
  rm -rf "$WORK"
  mkdir -p "$WORK/stage"

  local args=()
  for e in "${EXCLUDES[@]}"; do args+=(--exclude="$e"); done

  rsync -a "${args[@]}" "$ROOT/" "$WORK/stage/"

  # macOS 확장 속성 제거.
  # 안 지우면 pkgbuild 가 파일마다 ._이름 짝꿍 파일을 만들어 설치 폴더가 지저분해진다.
  xattr -cr "$WORK/stage" 2>/dev/null || true
  find "$WORK/stage" -name '._*' -delete 2>/dev/null || true

  # 개발용 파일이 남아 있으면 실수다
  [ -e "$WORK/stage/.debug" ]        && die "배포본에 .debug 가 남아 있습니다"
  [ -e "$WORK/stage/__test.html" ]   && die "배포본에 __test.html 이 남아 있습니다"
  [ -e "$WORK/stage/.dev" ]          && die "배포본에 .dev 가 남아 있습니다 (업데이트가 매번 지워집니다)"
  [ -f "$WORK/stage/index.html" ]         || die "index.html 이 없습니다"
  [ -f "$WORK/stage/CSXS/manifest.xml" ]  || die "manifest.xml 이 없습니다"
  [ -f "$WORK/stage/shell/loader.js" ]    || die "shell/loader.js 가 없습니다"
  [ -f "$WORK/stage/jsx/boot.jsx" ]       || die "jsx/boot.jsx 가 없습니다"
  [ -f "$WORK/stage/plugin/plugin.json" ] || die "plugin/plugin.json 이 없습니다"

  # plugin.json 에 적힌 기능 파일이 빠짐없이 들어갔는지, 버전이 맞는지 확인
  python3 "$HERE/check-payload.py" "$WORK/stage/plugin" "$VERSION" || die "기능 파일 확인 실패"

  ok "배포 파일 정리: $(find "$WORK/stage" -type f | wc -l | tr -d ' ')개"
}

# ------------------------------------------------------------------
# 3. CEP 서명 (자체 서명 인증서)
#    서명해두면 사용자가 PlayerDebugMode 를 켜지 않아도 패널이 열린다.
# ------------------------------------------------------------------
sign_extension() {
  local zxpsign="$HERE/tools/ZXPSignCmd"
  local cert="$HERE/certs/selfsigned.p12"
  local pass_file="$HERE/certs/password.txt"

  [ -x "$zxpsign" ] || die "ZXPSignCmd 가 없습니다: $zxpsign
  받는 곳: https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD"

  if [ ! -f "$cert" ]; then
    warn "자체 서명 인증서가 없어 새로 만듭니다 (build/certs/)"
    "$HERE/sign/make-cert.sh"
  fi

  local pass
  pass="$(cat "$pass_file")"

  mkdir -p "$WORK"
  say "CEP 서명 중…"
  "$zxpsign" -sign "$WORK/stage" "$WORK/$APP_NAME.zxp" "$cert" "$pass" \
      -tsa http://timestamp.digicert.com >/dev/null 2>&1 \
    || "$zxpsign" -sign "$WORK/stage" "$WORK/$APP_NAME.zxp" "$cert" "$pass" >/dev/null \
    || die "서명 실패"

  # 서명된 결과를 그대로 푼다 → META-INF 서명 파일이 함께 들어간다
  rm -rf "$WORK/payload"
  mkdir -p "$WORK/payload/$BUNDLE_ID"
  unzip -q "$WORK/$APP_NAME.zxp" -d "$WORK/payload/$BUNDLE_ID"

  [ -d "$WORK/payload/$BUNDLE_ID/META-INF" ] || die "서명 파일(META-INF)이 없습니다"

  # 압축을 풀면서 다시 붙은 확장 속성도 지운다
  xattr -cr "$WORK/payload" 2>/dev/null || true
  find "$WORK/payload" -name '._*' -delete 2>/dev/null || true
  ok "서명 완료 · $(du -sh "$WORK/payload/$BUNDLE_ID" | cut -f1)"
}

# ------------------------------------------------------------------
# 4. 맥 설치 파일 (.pkg)
#    설치 위치: ~/Library/Application Support/Adobe/CEP/extensions/com.eddie.drop
# ------------------------------------------------------------------
build_mac() {
  command -v pkgbuild >/dev/null     || die "pkgbuild 가 없습니다 (Xcode Command Line Tools 필요)"
  command -v productbuild >/dev/null || die "productbuild 가 없습니다"

  say "맥 설치 파일 만드는 중…"
  local out="$DIST/EddieDrop-$VERSION-mac.pkg"
  local res="$WORK/mac-res"

  mkdir -p "$DIST" "$res"

  # 설치 화면 문구 (버전 넣어서)
  sed "s/@VERSION@/$VERSION/g" "$HERE/mac/welcome.html"    > "$res/welcome.html"
  sed "s/@VERSION@/$VERSION/g" "$HERE/mac/conclusion.html" > "$res/conclusion.html"

  # 기존 버전을 지우는 스크립트 (공용 설정 폴더는 건드리지 않는다)
  mkdir -p "$WORK/scripts"
  cp "$HERE/mac/scripts/preinstall"  "$WORK/scripts/preinstall"
  cp "$HERE/mac/scripts/postinstall" "$WORK/scripts/postinstall"
  chmod +x "$WORK/scripts/preinstall" "$WORK/scripts/postinstall"

  pkgbuild \
    --root "$WORK/payload" \
    --identifier "$BUNDLE_ID.pkg" \
    --version "$VERSION" \
    --scripts "$WORK/scripts" \
    --install-location "Library/Application Support/Adobe/CEP/extensions" \
    "$WORK/component.pkg" >/dev/null

  sed "s/@VERSION@/$VERSION/g" "$HERE/mac/Distribution.xml" > "$WORK/Distribution.xml"

  productbuild \
    --distribution "$WORK/Distribution.xml" \
    --resources "$res" \
    --package-path "$WORK" \
    "$out" >/dev/null

  # postinstall 이 안 들어가면 ._ 군더더기가 남아 패널이 안 뜬다 — 꼭 확인한다
  local chk="$WORK/pkgcheck"
  rm -rf "$chk"
  pkgutil --expand "$out" "$chk" >/dev/null 2>&1
  [ -f "$chk"/*.pkg/Scripts/postinstall ] 2>/dev/null || \
    ls "$chk"/*.pkg/Scripts >/dev/null 2>&1 || die "pkg 안에 설치 스크립트가 없습니다"
  rm -rf "$chk"

  ok "맥: $(basename "$out")  ($(du -h "$out" | cut -f1))"
  echo "   $out"

  if [ -n "${DEVELOPER_ID:-}" ]; then
    say "Developer ID 서명·공증 시도 (DEVELOPER_ID 가 설정돼 있음)"
    "$HERE/sign/mac-notarize.sh" "$out"
  else
    warn "Apple 인증서가 없어 서명하지 않았습니다 → 설치 시 경고가 뜹니다 (설치방법.md 참고)"
  fi
}

# ------------------------------------------------------------------
# 5. 윈도우 설치 파일 (.exe)
#    설치 위치: %APPDATA%\Adobe\CEP\extensions\com.eddie.drop  (관리자 권한 불필요)
# ------------------------------------------------------------------
build_win() {
  local out="$DIST/EddieDrop-$VERSION-win.exe"
  mkdir -p "$DIST"

  if ! command -v makensis >/dev/null 2>&1; then
    warn "makensis(NSIS)가 없어 윈도우 설치 파일을 만들지 못했습니다."
    cat <<EOF

  만드는 방법 두 가지
    ① 이 맥에서 만들기
         brew install makensis     # Homebrew 가 없으면 https://brew.sh 먼저 설치
         ./build/build.sh win
    ② GitHub Actions 로 만들기 (윈도우 러너, 설치할 것 없음)
         .github/workflows/build.yml 이 준비돼 있습니다.
         저장소에 올리고 Actions 탭에서 실행하면 .exe 가 나옵니다.

EOF
    return 1
  fi

  # NSIS 는 BOM 이 없으면 소스를 ANSI 로 읽어서 한글이 전부 깨진다
  head -c 3 "$HERE/win/installer.nsi" | od -An -tx1 | tr -d ' \n' | grep -q "efbbbf" \
    || die "installer.nsi 에 UTF-8 BOM 이 없습니다 — 설치 화면 한글이 깨집니다"

  say "윈도우 설치 파일 만드는 중…"
  makensis -NOCD \
    "-DVERSION=$VERSION" \
    "-DPAYLOAD=$WORK/payload/$BUNDLE_ID" \
    "-DOUTFILE=$out" \
    "$HERE/win/installer.nsi" >/dev/null

  ok "윈도우: $(basename "$out")  ($(du -h "$out" | cut -f1))"
  echo "   $out"
  warn "코드 서명 인증서가 없어 SmartScreen 경고가 뜹니다 (설치방법.md 참고)"
}

# ------------------------------------------------------------------
main() {
  stage
  sign_extension

  local made_mac=0 made_win=0
  case "$TARGET" in
    mac) build_mac && made_mac=1 ;;
    win) build_win && made_win=1 || true ;;
    all)
      build_mac && made_mac=1
      build_win && made_win=1 || true
      ;;
    *) die "쓰는 법: build.sh [all|mac|win]" ;;
  esac

  echo
  say "끝났습니다 — dist/ 폴더를 확인하세요"
  ls -lh "$DIST" 2>/dev/null | tail -n +2 | awk '{print "   " $9 "  " $5}'
  [ "$made_win" = "0" ] && [ "$TARGET" != "mac" ] && warn "윈도우 설치 파일은 아직 없습니다 (위 안내 참고)"
  true
}

main
