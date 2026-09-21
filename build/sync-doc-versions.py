#!/usr/bin/env python3
"""
문서에 적힌 버전·파일 이름을 지금 버전으로 맞춘다.

손으로 고치면 잊어버려서 낡은 버전이 남는다.
(실제로 설치방법.md 가 1.0.1 인 채로 1.0.7 까지 온 적이 있다)

  python3 build/sync-doc-versions.py 1.0.7
"""
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

TARGETS = [
    ('설치방법.md', [
        (r'\*\*버전 [0-9.]+\*\*', '**버전 {v}**'),
        (r'EddieDrop-[0-9.]+-mac\.pkg', 'EddieDrop-{v}-mac.pkg'),
        (r'EddieDrop-[0-9.]+-Setup\.exe', 'EddieDrop-{v}-Setup.exe'),
    ]),
    ('docs/사용설명서.md', [
        (r'버전 \*\*[0-9.]+\*\*', '버전 **{v}**'),
    ]),
    ('docs/기능가이드.md', [
        (r'기준 버전 \*\*v[0-9.]+\*\*', '기준 버전 **v{v}**'),
        (r'EddieDrop-[0-9.]+-mac\.pkg', 'EddieDrop-{v}-mac.pkg'),
        (r'EddieDrop-[0-9.]+-Setup\.exe', 'EddieDrop-{v}-Setup.exe'),
    ]),
]


def main():
    if len(sys.argv) != 2:
        sys.exit('쓰는 법: sync-doc-versions.py 1.0.7')
    v = sys.argv[1]

    changed = 0
    for path, subs in TARGETS:
        if not os.path.exists(path):
            continue
        before = io.open(path, encoding='utf-8').read()
        after = before
        for pat, rep in subs:
            after = re.sub(pat, rep.format(v=v), after)
        if after != before:
            io.open(path, 'w', encoding='utf-8').write(after)
            changed += 1

    print('   문서 버전 → v%s (%d개 고침)' % (v, changed))


if __name__ == '__main__':
    main()
