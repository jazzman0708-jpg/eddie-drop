#!/bin/bash
#
# 맥에서 Wine 으로 윈도우 설치 파일 만들기 — 권장하지 않습니다.
#
# Inno Setup 은 윈도우 전용입니다. Wine 으로 돌릴 수는 있지만
#   · Homebrew 와 Wine (수 GB) 을 깔아야 하고
#   · 한글 메시지 파일(Korean.isl)에서 깨지는 경우가 잦습니다
#
# 깃허브 Actions 를 쓰는 편이 훨씬 빠르고 확실합니다 (README.md 참고).
# 그래도 해보시겠다면 아래 순서대로.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

echo "⚠️  이 방법은 검증되지 않았습니다. 깃허브 Actions 를 권합니다."
echo

command -v brew >/dev/null || {
  echo "❌ Homebrew 가 없습니다. 먼저 설치하세요:"
  echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  exit 1
}

command -v wine64 >/dev/null || command -v wine >/dev/null || {
  echo "Wine 을 설치합니다 (수 GB, 시간이 걸립니다)"
  brew install --cask --no-quarantine wine-stable
}

WINE="$(command -v wine64 || command -v wine)"
ISS_DIR="$HOME/.eddie-inno"
ISCC="$ISS_DIR/drive_c/Program Files (x86)/Inno Setup 6/ISCC.exe"

if [ ! -f "$ISCC" ]; then
  echo "Inno Setup 을 받아 설치합니다"
  mkdir -p "$ISS_DIR"
  curl -L -o /tmp/innosetup.exe https://jrsoftware.org/download.php/is.exe
  WINEPREFIX="$ISS_DIR" "$WINE" /tmp/innosetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
fi

VERSION="$(python3 -c "import xml.etree.ElementTree as ET;print(ET.parse('$ROOT/CSXS/manifest.xml').getroot().attrib['ExtensionBundleVersion'])")"

# 설치할 내용(서명된 확장)을 installer/app 에 넣어둬야 한다
[ -f "$HERE/app/CSXS/manifest.xml" ] || {
  echo "❌ installer/app 에 서명된 확장 내용이 없습니다."
  echo "   먼저 ./build/build.sh mac 을 돌린 뒤"
  echo "   build/.work/payload/com.eddie.drop/ 의 내용을 installer/app/ 로 복사하세요."
  exit 1
}

cd "$ROOT"
WINEPREFIX="$ISS_DIR" "$WINE" "$ISCC" "/DMyAppVersion=$VERSION" "installer\\EddieDrop.iss"
echo "✅ installer/output/EddieDrop-$VERSION-Setup.exe"
