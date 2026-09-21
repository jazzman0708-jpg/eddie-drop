# 윈도우 설치 파일 만들기

원본 Inno Setup 스크립트는 **타이닛**님이 만들어 주셨습니다. 감사합니다.

---

## 새 버전을 낼 때 (이것만 하면 됩니다)

```bash
./build/release.sh 1.0.7 --notes "무엇이 달라졌는지"
```

이 한 줄이 버전을 올리고 `v1.0.7` 태그를 올립니다.
태그가 올라가면 **깃허브가 알아서 윈도우 설치 파일을 만들어** 릴리스에 붙입니다.

몇 분 뒤 여기서 확인하세요 →
https://github.com/jazzman0708-jpg/eddie-drop/releases

> 태그 없이 만들어 보고 싶으면 Actions 탭 → **윈도우 설치 파일 (Inno Setup)** → **Run workflow**.
> 결과물은 그 실행의 Artifacts 에 들어갑니다.

---

## 만들어지는 것

```
EddieDrop-1.0.7-Setup.exe
```

| | |
|---|---|
| 설치 위치 | `%APPDATA%\Adobe\CEP\extensions\com.eddie.drop` |
| 관리자 권한 | 필요 없음 |
| 제거 프로그램 | `%LOCALAPPDATA%\Eddie Drop\uninstall\` (확장 폴더 **밖**) |
| 건드리지 않는 것 | `%APPDATA%\Eddie\` (API 키·설정), `내 문서\Eddie Drop` (받아둔 소스) |

---

## 손대면 안 되는 것

**`AppId`** — 이미 이 설치 파일로 설치한 분이 있습니다.
바꾸면 제어판 "프로그램 제거" 목록에 Eddie Drop 이 **두 개**로 보입니다.

**`UninstallFilesDir`** — 확장 폴더 밖을 가리켜야 합니다.
Inno 기본값은 `{app}` 인데, 그러면 `unins000.exe` 가 확장 폴더 안에 생깁니다.
CEP 는 서명할 때 없던 파일이 폴더에 있으면 서명이 깨진 것으로 보고
**확장을 아예 불러오지 않습니다.** (창 → 확장명 에 패널이 안 뜸)

워크플로가 매번 설치해 보고 파일 개수를 대조하므로, 실수하면 빌드가 실패합니다.

---

## 버전은 어디서 오나

`CSXS/manifest.xml` 의 `ExtensionBundleVersion` 한 곳입니다.
`.iss` 가 이 파일을 직접 읽으므로 버전을 따로 적을 필요가 없습니다.

직접 지정하고 싶으면:
```
iscc /DMyAppVersion=1.0.7 installer\EddieDrop.iss
```

---

## 코드 서명

아직 인증서가 없어 **서명 없이** 만듭니다. 설치할 때 SmartScreen 경고가 뜹니다.
넘어가는 방법은 [설치방법.md](../설치방법.md) 에 적어두었습니다.

인증서가 생기면 `EddieDrop.iss` 의 `[Files]` 아래 주석을 푸세요.

---

## 맥에서 직접 만들 수 있나요

**안 됩니다.** Inno Setup 은 윈도우 전용입니다.
Wine 으로 돌리는 방법이 있지만 Homebrew + Wine (수 GB) 설치가 필요하고
한글 메시지 파일에서 자주 깨집니다. 깃허브 Actions 를 쓰세요.

굳이 시도하시려면 [build-with-wine.sh](build-with-wine.sh) 에 절차를 적어두었습니다.
