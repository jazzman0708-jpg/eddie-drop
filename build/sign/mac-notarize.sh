#!/bin/bash
# Apple Developer ID 로 .pkg 서명하고 공증하기
#
# 인증서가 생기면 아래 두 값을 환경변수로 넣고 build.sh 를 돌리면 자동으로 실행된다.
#   export DEVELOPER_ID="Developer ID Installer: 이름 (TEAMID)"
#   export NOTARY_PROFILE="eddie-notary"      # 아래 ① 로 미리 만들어 둔 이름
#
# ① 공증 계정 한 번만 등록
#   xcrun notarytool store-credentials "eddie-notary" \
#       --apple-id "you@example.com" \
#       --team-id "TEAMID" \
#       --password "앱 암호(app-specific password)"
set -euo pipefail
PKG="${1:?사용법: mac-notarize.sh <pkg 경로>}"

: "${DEVELOPER_ID:?DEVELOPER_ID 가 없습니다}"
SIGNED="${PKG%.pkg}-signed.pkg"

echo "▶ 서명 중…"
productsign --sign "$DEVELOPER_ID" "$PKG" "$SIGNED"
mv "$SIGNED" "$PKG"

if [ -n "${NOTARY_PROFILE:-}" ]; then
  echo "▶ 공증 요청 (몇 분 걸립니다)…"
  xcrun notarytool submit "$PKG" --keychain-profile "$NOTARY_PROFILE" --wait
  echo "▶ 공증 결과 붙이기…"
  xcrun stapler staple "$PKG"
  xcrun stapler validate "$PKG"
  echo "✅ 서명·공증 완료 — 이제 경고 없이 설치됩니다"
else
  echo "⚠ NOTARY_PROFILE 이 없어 서명만 했습니다 (공증은 건너뜀)"
fi
