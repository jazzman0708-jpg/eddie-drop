#!/usr/bin/env python3
"""
이모지 목록을 유니코드 공식 자료에서 만들어 plugin/js/emoji-data.js 로 저장한다.

가져오는 곳
  · emoji-test.txt  — 이모지 목록과 분류 (유니코드 공식)
  · CLDR ko.xml     — 한글 이름과 검색어 (유니코드 공식)

피부톤은 기본 이모지에 묶어서 담는다.
목록에 3,773개를 다 늘어놓으면 지저분해서, 기본 이모지만 보여주고
피부톤은 위에서 고르면 바뀌도록 하기 위한 것.

  python3 build/make-emoji-data.py
"""
import io
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'plugin', 'js', 'emoji-data.js')

TEST_URL = 'https://unicode.org/Public/emoji/15.1/emoji-test.txt'
KO_URL = 'https://raw.githubusercontent.com/unicode-org/cldr/main/common/annotations/ko.xml'
# 조합 이모지(가족·직업 등)의 한글 이름은 따로 있는 파일에 들어 있다
KO_DERIVED_URL = 'https://raw.githubusercontent.com/unicode-org/cldr/main/common/annotationsDerived/ko.xml'

TONES = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF']   # 하양 → 검정

# 유니코드 분류 → 한글 이름
GROUPS = [
    ('Smileys & Emotion', '표정'),
    ('People & Body', '사람'),
    ('Animals & Nature', '동물·자연'),
    ('Food & Drink', '음식'),
    ('Travel & Places', '여행·장소'),
    ('Activities', '활동'),
    ('Objects', '사물'),
    ('Symbols', '기호'),
    ('Flags', '깃발'),
]
GROUP_KO = dict(GROUPS)


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'EddieDrop/1.0'})
    return urllib.request.urlopen(req, timeout=90).read().decode('utf-8')


def load_korean():
    """한글 이름과 검색어 (기본 + 조합 이모지)"""
    name, keys = {}, {}
    for url in (KO_URL, KO_DERIVED_URL):
        try:
            root = ET.fromstring(get(url))
        except Exception as e:
            print('   (건너뜀) %s — %s' % (url.rsplit('/', 2)[-2], e))
            continue
        for a in root.iter('annotation'):
            cp = a.get('cp')
            if a.get('type') == 'tts':
                name.setdefault(cp, (a.text or '').strip())
            else:
                keys.setdefault(cp, [k.strip() for k in (a.text or '').split('|') if k.strip()])
    return name, keys


def main():
    print('   유니코드 자료 받는 중…')
    text = get(TEST_URL)
    ko_name, ko_keys = load_korean()

    group = ''
    base = []            # 피부톤 없는 기본 이모지
    tones = {}           # 기본 이모지 → 피부톤 변형들
    seen = set()

    for line in text.split('\n'):
        if line.startswith('# group:'):
            group = line.split(':', 1)[1].strip()
            continue
        if not line or line.startswith('#'):
            continue
        if 'fully-qualified' not in line:
            continue

        codes = line.split(';')[0].strip().split()
        char = ''.join(chr(int(c, 16)) for c in codes)

        tone_in = [c for c in codes if c in TONES]
        plain_codes = [c for c in codes if c not in TONES]
        plain = ''.join(chr(int(c, 16)) for c in plain_codes)

        if tone_in:
            tones.setdefault(plain, {})[TONES.index(tone_in[0])] = char
            continue

        if char in seen:
            continue
        seen.add(char)

        # 영어 이름 (emoji-test.txt 주석에 들어 있다)
        m = re.search(r'#\s+\S+\s+E[\d.]+\s+(.*)$', line)
        en = m.group(1).strip() if m else ''

        nm = ko_name.get(char, '') or en or char

        # 한글·영어 둘 다로 찾을 수 있게 검색어에 영어 이름도 넣는다
        words = list(ko_keys.get(char, []))
        if en and en.lower() not in [w.lower() for w in words]:
            words.append(en)

        base.append({
            'c': char,
            'n': nm,
            'k': words,
            'g': GROUP_KO.get(group, group),
        })

    # 피부톤 변형을 기본 이모지에 붙인다
    tone_count = 0
    for e in base:
        t = tones.get(e['c'])
        if t and len(t) == 5:
            e['t'] = [t[i] for i in range(5)]
            tone_count += 1

    data = {
        'groups': [ko for _, ko in GROUPS],
        'tones': ['기본', '하양', '연한 갈색', '갈색', '진한 갈색', '검정'],
        'list': base,
    }

    js = ('/*\n'
          ' * Eddie Drop - 이모지 목록 (자동 생성 · 직접 고치지 마세요)\n'
          ' *\n'
          ' * 만드는 법: python3 build/make-emoji-data.py\n'
          ' * 출처: 유니코드 emoji-test.txt · CLDR 한국어 annotations\n'
          ' */\n'
          'window.EmojiData = ' +
          json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

    io.open(OUT, 'w', encoding='utf-8').write(js)

    print('   이모지 %d개 · 피부톤 있는 것 %d개' % (len(base), tone_count))
    print('   한글 이름 붙은 것 %d개' % sum(1 for e in base if ko_name.get(e['c'])))
    print('   파일 크기 %.0f KB' % (os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
