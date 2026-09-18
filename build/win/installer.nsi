; Eddie Drop - 윈도우 설치 프로그램 (NSIS)
;
; 만드는 법
;   makensis -DVERSION=0.4.0 -DPAYLOAD=<서명된 확장 폴더> -DOUTFILE=<나올 exe> installer.nsi
;
; 설치 위치는 %APPDATA% 라서 관리자 권한이 필요 없다.

Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef PAYLOAD
  !error "PAYLOAD 를 지정해 주세요 (-DPAYLOAD=...)"
!endif
!ifndef OUTFILE
  !define OUTFILE "EddieDrop-${VERSION}-win.exe"
!endif

!define APPNAME    "Eddie Drop"
!define BUNDLEID   "com.eddie.drop"
!define PUBLISHER  "Eddie"
!define UNINSTKEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\EddieDrop"

Name "${APPNAME} ${VERSION}"
OutFile "${OUTFILE}"
RequestExecutionLevel user                 ; 관리자 권한 없이 설치
InstallDir "$APPDATA\Adobe\CEP\extensions\${BUNDLEID}"
ShowInstDetails show
SetCompressor /SOLID lzma

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1042 "ProductName"     "${APPNAME}"
VIAddVersionKey /LANG=1042 "CompanyName"     "${PUBLISHER}"
VIAddVersionKey /LANG=1042 "FileDescription" "${APPNAME} 설치 프로그램"
VIAddVersionKey /LANG=1042 "FileVersion"     "${VERSION}"
VIAddVersionKey /LANG=1042 "LegalCopyright"  "${PUBLISHER}"

; ---------------- 화면 ----------------
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APPNAME} ${VERSION} 설치"
!define MUI_WELCOMEPAGE_TEXT  "프리미어 프로에서 영상 · 이미지 · GIF · 효과음을 찾아 바로 타임라인에 넣는 패널입니다.$\r$\n$\r$\n설치 위치는 사용자 폴더 안이라 관리자 암호가 필요 없습니다.$\r$\n기존에 설치돼 있으면 새 버전으로 바뀌며, 입력해 둔 API 키와 설정은 그대로 유지됩니다.$\r$\n$\r$\n설치하기 전에 프리미어 프로를 종료해 주세요."

!define MUI_FINISHPAGE_TITLE "설치가 끝났습니다"
!define MUI_FINISHPAGE_TEXT  "프리미어를 재시작한 뒤$\r$\n창 → 확장명 에서 열어주세요.$\r$\n$\r$\n처음 열면 설정 탭에서 API 키를 넣어야 검색이 됩니다.$\r$\n내 컴퓨터에 있는 파일은 키 없이 '내 파일' 탭에서 바로 쓸 수 있습니다."
!define MUI_FINISHPAGE_NOAUTOCLOSE

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Korean"

; ---------------- 설치 ----------------
Section "설치" SecMain
  ; 기존 버전 지우기 — 공용 설정 폴더(%APPDATA%\Eddie)는 건드리지 않는다
  DetailPrint "기존 버전을 정리하는 중…"
  RMDir /r "$INSTDIR"

  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*.*"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; 제어판 "프로그램 제거" 등록 (현재 사용자)
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKCU "${UNINSTKEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayIcon"     "$INSTDIR\uninstall.exe"
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"

  DetailPrint "설치를 마쳤습니다: $INSTDIR"
SectionEnd

; ---------------- 제거 ----------------
Section "Uninstall"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"

  ; 참고: 공용 설정 폴더(%APPDATA%\Eddie)와 받아둔 파일은 일부러 지우지 않습니다.
  ;       다른 에디 플러그인이 같이 쓰고, 사용자가 받아둔 소스가 들어 있기 때문입니다.
  MessageBox MB_OK|MB_ICONINFORMATION "제거했습니다.$\r$\n$\r$\nAPI 키와 받아둔 파일은 그대로 두었습니다.$\r$\n완전히 지우려면 아래 폴더를 직접 삭제하세요.$\r$\n$\r$\n  %APPDATA%\Eddie$\r$\n  내 문서\Eddie Drop"
SectionEnd
