# 윈도우 코드 서명 (인증서가 생기면)

지금은 코드 서명 인증서가 없어서 설치 파일에 서명이 없습니다.
그래서 윈도우에서 **SmartScreen 경고**가 뜹니다. 인증서를 사면 아래대로 서명하면 됩니다.

## 필요한 것
- 코드 서명 인증서 (`.pfx`) — DigiCert, Sectigo 등에서 구입
- Windows SDK 의 `signtool.exe`

## 명령 (윈도우 명령 프롬프트)

```bat
signtool sign ^
  /f "C:\경로\eddie.pfx" ^
  /p "인증서비밀번호" ^
  /fd SHA256 ^
  /tr http://timestamp.digicert.com ^
  /td SHA256 ^
  /d "Eddie Drop" ^
  "dist\EddieDrop-0.4.0-win.exe"
```

확인:
```bat
signtool verify /pa /v "dist\EddieDrop-0.4.0-win.exe"
```

## GitHub Actions 에서 서명하기

저장소 Secrets 에 `WIN_CERT_BASE64`(pfx 를 base64 로 인코딩), `WIN_CERT_PASSWORD` 를 넣고
`.github/workflows/build.yml` 의 서명 단계 주석을 풀면 됩니다.

```powershell
[IO.File]::WriteAllBytes("cert.pfx", [Convert]::FromBase64String($env:WIN_CERT_BASE64))
& signtool sign /f cert.pfx /p $env:WIN_CERT_PASSWORD /fd SHA256 `
    /tr http://timestamp.digicert.com /td SHA256 dist\*.exe
```

## 참고
- EV 인증서를 쓰면 SmartScreen 경고가 바로 사라집니다.
- 일반(OV) 인증서는 다운로드 수가 쌓이면서 평판이 생겨야 경고가 없어집니다.
