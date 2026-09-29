#!/usr/bin/env python3
"""
설명서 원본 하나에서 맥판·윈도우판을 찍어낸다.

두 벌을 따로 손으로 고치면 반드시 어긋나므로, 원본은 하나만 둔다.

원본에서 쓰는 표시
  [[mac]] ... [[/mac]]     맥판에만 들어감
  [[win]] ... [[/win]]     윈도우판에만 들어감
  {버전} {설치파일} {확장폴더} {설정폴더} {받은파일폴더} {운영체제}

  python3 build/make-manual.py
"""
import io
import os
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', '설명서-원본.md')
OUT = os.path.join(ROOT, 'docs')


def version():
    p = os.path.join(ROOT, 'CSXS', 'manifest.xml')
    return ET.parse(p).getroot().attrib['ExtensionBundleVersion']


PROFILES = {
    'mac': {
        '이름': '맥',
        '{운영체제}': '맥',
        '{설치파일}': 'EddieDrop-{v}-mac.pkg',
        '{확장폴더}': '~/Library/Application Support/Adobe/CEP/extensions/com.eddie.drop',
        '{설정폴더}': '~/Library/Application Support/Eddie',
        '{받은파일폴더}': '~/Documents/Eddie Drop',
    },
    'win': {
        '이름': '윈도우',
        '{운영체제}': '윈도우',
        '{설치파일}': 'EddieDrop-{v}-Setup.exe',
        '{확장폴더}': r'%APPDATA%\Adobe\CEP\extensions\com.eddie.drop',
        '{설정폴더}': r'%APPDATA%\Eddie',
        '{받은파일폴더}': r'내 문서\Eddie Drop',
    },
}


def build(text, os_key, v):
    keep, drop = os_key, ('win' if os_key == 'mac' else 'mac')

    # 다른 운영체제 부분은 통째로 들어낸다
    text = re.sub(r'\[\[%s\]\].*?\[\[/%s\]\]\n?' % (drop, drop), '', text, flags=re.S)
    # 내 운영체제 표시는 벗겨낸다
    text = re.sub(r'\[\[%s\]\]\n?|\[\[/%s\]\]\n?' % (keep, keep), '', text)

    for k, val in PROFILES[os_key].items():
        if k.startswith('{'):
            text = text.replace(k, val.replace('{v}', v))
    text = text.replace('{버전}', v)

    # 빈 줄이 세 줄 넘게 이어지지 않게
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    return unicodedata.normalize('NFC', text.strip() + '\n')


def main():
    if not os.path.exists(SRC):
        sys.exit('원본이 없습니다: ' + SRC)

    v = version()
    src = io.open(SRC, encoding='utf-8').read()

    # 맥은 md 로, 윈도우는 메모장에서 바로 열리는 txt 로 낸다.
    # (윈도우 사용자는 md 를 열 프로그램이 없는 경우가 많다)
    for key, prof in PROFILES.items():
        name = 'Eddie Drop 사용설명서 (%s)' % prof['이름']
        md = os.path.join(OUT, name + '.md')
        io.open(md, 'w', encoding='utf-8').write(build(src, key, v))

        if key == 'win':
            txt = os.path.join(OUT, name + '.txt')
            subprocess.check_call([sys.executable,
                                   os.path.join(ROOT, 'build', 'md-to-txt.py'), md, txt],
                                  stdout=subprocess.DEVNULL)
            os.remove(md)                       # 윈도우는 txt 만 남긴다
            print('   %s.txt' % name)
        else:
            print('   %s.md' % name)

    print('   버전 v%s' % v)


if __name__ == '__main__':
    main()
