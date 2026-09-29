#!/usr/bin/env python3
"""
문서에 적힌 버전·파일 이름을 지금 버전으로 맞춘다.

손으로 고치면 잊어버려서 낡은 버전이 남는다.
(실제로 문서가 1.0.1 인 채로 1.0.7 까지 온 적이 있다)

설명서는 원본 하나만 고치면 되고, 맥판·윈도우판은 make-manual.py 가 만든다.

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
    ('docs/설명서-원본.md', [
        (r'\*\*버전 [0-9.]+\*\*', '**버전 {v}**'),
        (r'기준 버전 \*\*v[0-9.]+\*\*', '기준 버전 **v{v}**'),
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
