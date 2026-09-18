#!/bin/bash
# 자체 서명 인증서 만들기 (CEP 확장 서명용)
# 한 번만 만들면 되고, build/certs/ 안에 보관된다.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS="$HERE/../certs"
ZXP="$HERE/../tools/ZXPSignCmd"

mkdir -p "$CERTS"
[ -x "$ZXP" ] || { echo "ZXPSignCmd 가 없습니다: $ZXP"; exit 1; }

if [ -f "$CERTS/selfsigned.p12" ]; then
  echo "이미 있습니다: $CERTS/selfsigned.p12"
  exit 0
fi

# 비밀번호는 무작위로 만들어 파일로 보관한다 (배포본에는 들어가지 않는다)
PASS="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)"
printf '%s' "$PASS" > "$CERTS/password.txt"
chmod 600 "$CERTS/password.txt"

"$ZXP" -selfSignedCert KR Seoul "Eddie" "Eddie" "$PASS" "$CERTS/selfsigned.p12" \
       -validityDays 3650

chmod 600 "$CERTS/selfsigned.p12"
echo "만들었습니다: $CERTS/selfsigned.p12 (10년)"
echo "⚠ 이 파일과 password.txt 는 백업해 두세요."
echo "  다른 인증서로 서명하면 사용자가 기존 확장을 지우고 다시 설치해야 할 수 있습니다."
