; ============================================================================
;  Eddie Drop — 윈도우 설치 프로그램 (Inno Setup)
;
;  원본 스크립트: 타이닛 님
;  정리: 저장소 상대 경로화 · 버전 자동 읽기 · 확장 폴더 오염 방지
;
;  빌드
;    iscc installer\EddieDrop.iss                      (버전은 manifest.xml 에서 읽음)
;    iscc /DMyAppVersion=1.0.7 installer\EddieDrop.iss (버전을 직접 지정)
;
;  결과물: installer\output\EddieDrop-<버전>-Setup.exe
; ============================================================================

#define MyAppName       "Eddie Drop"
#define MyAppPublisher  "Eddie"
#define MyAppURL        "https://github.com/jazzman0708-jpg/eddie-drop"

; ── 설치할 내용이 담긴 폴더 (기본: installer\app) ────────────────────────────
#ifndef PayloadDir
  #define PayloadDir "app"
#endif

; ── 버전: 넘겨받지 않았으면 CSXS\manifest.xml 에서 읽는다 ───────────────────
;    버전을 한 곳(manifest.xml)에서만 관리하기 위한 것.
#ifndef MyAppVersion
  #define ManifestFile "..\CSXS\manifest.xml"
  #define VerKey "ExtensionBundleVersion="""
  #define FH
  #define Line
  #define P

  #sub ScanLine
    #expr Line = FileRead(FH)
    #if !Defined(MyAppVersion) && Pos(VerKey, Line) > 0
      #expr P = Pos(VerKey, Line) + Len(VerKey)
      #expr Line = Copy(Line, P, 32)
      #expr MyAppVersion = Copy(Line, 1, Pos('"', Line) - 1)
    #endif
  #endsub

  #expr FH = FileOpen(ManifestFile)
  #if !FH
    #error manifest.xml 을 열지 못했습니다. /DMyAppVersion=1.0.7 처럼 버전을 직접 넘겨주세요.
  #endif
  #for {0; !FileEof(FH) && !Defined(MyAppVersion); 0} ScanLine
  #expr FileClose(FH)

  #ifndef MyAppVersion
    #error manifest.xml 에서 ExtensionBundleVersion 을 찾지 못했습니다.
  #endif
#endif

; ── 설치할 내용이 제자리에 있는지 미리 확인 ────────────────────────────────
#if !FileExists(AddBackslash(PayloadDir) + "CSXS\manifest.xml")
  #error 설치할 내용이 없습니다. PayloadDir 폴더에 서명된 확장 폴더 내용을 넣어주세요.
#endif

[Setup]
; ⚠ AppId 는 절대 바꾸지 말 것.
;   바꾸면 이미 설치한 분의 제어판에 Eddie Drop 이 두 개로 보인다.
AppId={{13865600-32ED-43FD-9FD5-F5A168720374}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; 프리미어가 확장을 찾는 자리. 사용자가 바꾸면 패널이 안 뜨므로 고정한다.
DefaultDirName={userappdata}\Adobe\CEP\extensions\com.eddie.drop
DisableDirPage=yes
DisableProgramGroupPage=yes

; 사용자 폴더에만 설치하므로 관리자 권한이 필요 없다
PrivilegesRequired=lowest

OutputDir=output
OutputBaseFilename=EddieDrop-{#MyAppVersion}-Setup

SetupIconFile=..\assets\EddieDrop.ico
; 제거 프로그램 자체의 아이콘을 쓴다.
; (확장 폴더에 .ico 를 넣으면 파일이 늘어나 서명이 깨진다)
UninstallDisplayIcon={uninstallexe}

Compression=lzma
SolidCompression=yes
WizardStyle=modern
Uninstallable=yes

; ⚠ 제거 프로그램을 확장 폴더 "밖"에 둔다.
;   기본값은 {app} 인데, 그러면 unins000.exe / unins000.dat 가
;   확장 폴더 안에 생긴다. CEP 는 서명할 때 없던 파일이 폴더에 있으면
;   서명이 깨진 것으로 보고 확장을 아예 불러오지 않는다.
;   → 창 > 확장명 에 패널이 안 뜬다. (NSIS 판에서 실제로 겪은 문제)
UninstallFilesDir={localappdata}\Eddie Drop\uninstall

; 프리미어를 강제로 닫지 않는다. 대신 켜져 있으면 안내만 한다.
CloseApplications=no
RestartApplications=no

VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} 설치 프로그램
VersionInfoCopyright={#MyAppPublisher}

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Messages]
korean.FinishedLabel=Eddie Drop 설치를 마쳤습니다.%n%n프리미어 프로를 다시 실행한 뒤 창 → 확장(Extensions) 에서 Eddie Drop 을 열어주세요.%n%n처음 열면 설정 탭에서 API 키를 넣어야 검색이 됩니다. 내 컴퓨터에 있는 파일은 키 없이 '내 파일' 탭에서 바로 쓸 수 있습니다.

[InstallDelete]
; 예전 버전 파일을 먼저 지운다.
; 옛날 js 가 남아 새 파일과 섞이면 오작동하고,
; 확장 폴더에 없어야 할 파일이 남으면 서명이 깨진다.
;
; ⚠ %APPDATA%\Eddie (API 키·설정)는 여기에 절대 넣지 않는다.
Type: filesandordirs; Name: "{app}"

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

; 코드 서명 인증서가 생기면 아래 주석을 풀고 쓰세요.
;   1) [Setup] 에 다음 줄을 추가
;        SignTool=signtool
;   2) Inno Setup 의 도구 > 설정 > 서명 도구에 이름 signtool 로 아래 명령 등록
;        signtool.exe sign /f "$q인증서.pfx$q" /p 비밀번호 /fd SHA256 \
;                     /tr http://timestamp.digicert.com /td SHA256 $f
;   지금은 인증서가 없어 서명 없이 만듭니다. (SmartScreen 경고가 뜹니다)

[UninstallDelete]
; 확장 폴더와 제거 프로그램이 있던 자리만 지운다.
; ⚠ %APPDATA%\Eddie (API 키·설정)와 내 문서\Eddie Drop (받아둔 소스)은
;   일부러 남긴다. 다시 설치할 때 키를 다시 넣지 않아도 되게 하기 위함.
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{localappdata}\Eddie Drop"

[Code]

{ ─────────────────────────────────────────────────────────────
  프리미어가 켜져 있는지 확인한다.
  켜져 있으면 파일이 잠겨 설치가 실패하거나 반만 깔린다.
  ───────────────────────────────────────────────────────────── }
function PremiereRunning(): Boolean;
var
  TmpFile: String;
  Code: Integer;
  Content: AnsiString;
begin
  Result := False;
  TmpFile := ExpandConstant('{tmp}\eddiedrop_tasklist.txt');
  if Exec(ExpandConstant('{cmd}'),
          '/C tasklist /NH /FO CSV > "' + TmpFile + '"',
          '', SW_HIDE, ewWaitUntilTerminated, Code) then
  begin
    if LoadStringFromFile(TmpFile, Content) then
      Result := Pos('premiere', Lowercase(String(Content))) > 0;
    DeleteFile(TmpFile);
  end;
end;

{ ─────────────────────────────────────────────────────────────
  예전 NSIS 설치 흔적 확인.
  확실하지 않은 것은 지우지 않고, 사용자에게 물어본 뒤에만 정리한다.
  ───────────────────────────────────────────────────────────── }
procedure CheckOldNsisInstall();
var
  Key, Publisher, OldUninst: String;
begin
  Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\EddieDrop';
  if not RegKeyExists(HKEY_CURRENT_USER, Key) then
    Exit;

  { 우리가 만든 항목이 맞는지 확인한 뒤에만 손댄다 }
  Publisher := '';
  RegQueryStringValue(HKEY_CURRENT_USER, Key, 'Publisher', Publisher);
  if CompareText(Publisher, 'Eddie') <> 0 then
    Exit;

  OldUninst := ExpandConstant('{userappdata}\Eddie\uninstaller\EddieDrop-uninstall.exe');

  if MsgBox('예전 방식으로 설치된 Eddie Drop 이 있습니다.' + #13#10 + #13#10 +
            '그대로 두면 제어판 "프로그램 제거" 목록에 Eddie Drop 이' + #13#10 +
            '두 개로 보일 수 있습니다.' + #13#10 + #13#10 +
            '예전 항목을 목록에서 정리할까요?' + #13#10 + #13#10 +
            'API 키와 설정은 그대로 두며, 지우지 않습니다.',
            mbConfirmation, MB_YESNO) = IDYES then
  begin
    RegDeleteKeyIncludingSubkeys(HKEY_CURRENT_USER, Key);
    if FileExists(OldUninst) then
      DeleteFile(OldUninst);
    { 빈 폴더만 정리한다. %APPDATA%\Eddie 자체는 건드리지 않는다. }
    RemoveDir(ExpandConstant('{userappdata}\Eddie\uninstaller'));
  end;
end;

function InitializeSetup(): Boolean;
begin
  CheckOldNsisInstall();
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  while PremiereRunning() do
  begin
    if MsgBox('프리미어 프로가 실행 중입니다.' + #13#10 + #13#10 +
              '켜둔 채로 설치하면 파일이 잠겨 설치가 실패하거나' + #13#10 +
              '패널이 나타나지 않을 수 있습니다.' + #13#10 + #13#10 +
              '프리미어를 완전히 종료한 뒤 [다시 시도] 를 눌러주세요.',
              mbError, MB_RETRYCANCEL) = IDCANCEL then
    begin
      Result := '프리미어 프로를 종료한 뒤 다시 설치해 주세요.';
      Exit;
    end;
  end;
end;
