#!/usr/bin/env python3
"""
마크다운 → 메모장에서 읽기 좋은 txt

윈도우 메모장에 맞추려면 세 가지가 필요하다.
  · 줄바꿈을 CRLF 로 (LF 만 있으면 옛날 메모장에서 한 줄로 붙어버린다)
  · UTF-8 BOM 을 붙여서 (없으면 한글이 깨져 보이는 경우가 있다)
  · 표·굵게 같은 마크다운 기호를 눈으로 읽을 수 있게 바꿔서

  python3 build/md-to-txt.py 원본.md [나올파일.txt]
"""
import os
import re
import sys
import unicodedata

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

WIDTH = 78          # 한 줄 최대 너비 (메모장 기본 창에 맞춘 값)


def w(s):
    """글자 폭. 한글·한자는 두 칸을 차지한다."""
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)


def pad(s, n):
    return s + ' ' * max(0, n - w(s))


def inline(s):
    """줄 안에 섞인 마크다운 기호를 걷어낸다."""
    s = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', s)              # 그림
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1 (\2)', s)   # 링크
    s = re.sub(r'\*\*([^*]+)\*\*', r'\1', s)                # 굵게
    s = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'\1', s)       # 기울임
    s = re.sub(r'`([^`]+)`', r'\1', s)                      # 코드
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = s.replace('&nbsp;', ' ').replace('&gt;', '>').replace('&lt;', '<')
    return s.rstrip()


def split_row(line):
    line = line.strip()
    if line.startswith('|'):
        line = line[1:]
    if line.endswith('|'):
        line = line[:-1]
    return [inline(c.strip()) for c in line.split('|')]


def is_sep(line):
    return bool(re.match(r'^\s*\|?[\s:|-]+\|[\s:|-]*$', line)) and '-' in line


def render_table(rows, out):
    """표를 칸 맞춘 글로 그린다."""
    cols = max(len(r) for r in rows)
    rows = [r + [''] * (cols - len(r)) for r in rows]
    widths = [max(w(r[i]) for r in rows) for i in range(cols)]

    # 너무 넓으면 칸 맞추기를 포기하고 줄마다 "항목: 값" 으로 적는다
    if sum(widths) + 3 * (cols - 1) > WIDTH:
        head = rows[0]
        for r in rows[1:]:
            for i in range(cols):
                if r[i]:
                    label = head[i] if i < len(head) and head[i] else '·'
                    out.append('  %s: %s' % (label, r[i]))
            out.append('')
        return

    def line(r):
        return '  ' + '   '.join(pad(r[i], widths[i]) for i in range(cols)).rstrip()

    out.append(line(rows[0]))
    out.append('  ' + '   '.join('─' * widths[i] for i in range(cols)))
    for r in rows[1:]:
        out.append(line(r))


def convert(md):
    lines = md.replace('\r\n', '\n').split('\n')
    out = []
    i = 0
    in_code = False

    while i < len(lines):
        raw = lines[i]

        # 코드 블록
        if raw.strip().startswith('```'):
            in_code = not in_code
            if in_code:
                out.append('')
            i += 1
            continue
        if in_code:
            out.append('    ' + raw)
            i += 1
            continue

        # 표
        if '|' in raw and i + 1 < len(lines) and is_sep(lines[i + 1]):
            rows = [split_row(raw)]
            i += 2
            while i < len(lines) and '|' in lines[i] and lines[i].strip():
                rows.append(split_row(lines[i]))
                i += 1
            out.append('')
            render_table(rows, out)
            out.append('')
            continue

        line = raw.rstrip()

        # 제목
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            level, text = len(m.group(1)), inline(m.group(2))
            out.append('')
            if level == 1:
                out.append('═' * min(WIDTH, w(text) + 4))
                out.append('  ' + text)
                out.append('═' * min(WIDTH, w(text) + 4))
            elif level == 2:
                out.append('── ' + text + ' ' + '─' * max(0, WIDTH - w(text) - 4))
            else:
                out.append('▸ ' + text)
            out.append('')
            i += 1
            continue

        # 가로줄
        if re.match(r'^\s*(-{3,}|={3,}|\*{3,})\s*$', line):
            out.append('')
            out.append('─' * WIDTH)
            out.append('')
            i += 1
            continue

        # 인용
        if line.lstrip().startswith('>'):
            out.append('  │ ' + inline(line.lstrip()[1:].strip()))
            i += 1
            continue

        # 체크 목록 · 목록
        m = re.match(r'^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$', line)
        if m:
            box = '☑' if m.group(2).lower() == 'x' else '□'
            out.append('  ' + m.group(1) + box + ' ' + inline(m.group(3)))
            i += 1
            continue

        m = re.match(r'^(\s*)[-*+]\s+(.*)$', line)
        if m:
            out.append('  ' + m.group(1) + '· ' + inline(m.group(2)))
            i += 1
            continue

        m = re.match(r'^(\s*)(\d+)\.\s+(.*)$', line)
        if m:
            out.append('  ' + m.group(1) + m.group(2) + '. ' + inline(m.group(3)))
            i += 1
            continue

        out.append(inline(line))
        i += 1

    # 빈 줄이 세 줄 넘게 이어지지 않게 정리
    cleaned = []
    blanks = 0
    for l in out:
        if l.strip() == '':
            blanks += 1
            if blanks > 2:
                continue
        else:
            blanks = 0
        cleaned.append(l)

    return '\n'.join(cleaned).strip() + '\n'


def main():
    if len(sys.argv) < 2:
        sys.exit('쓰는 법: md-to-txt.py 원본.md [나올파일.txt]')

    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + '.txt'

    with open(src, encoding='utf-8') as f:
        text = convert(f.read())

    # 한글 자소분리 막기.
    # 맥은 파일 이름과 글자를 "ㅅ ㅏ ㅇ" 처럼 쪼개서(NFD) 저장하는 버릇이 있다.
    # 그대로 윈도우로 넘기면 "ㅅㅏㅇㅛㅇㅅㅓㄹㅁㅕㅇㅅㅓ" 처럼 보인다.
    # 합친 형태(NFC)로 바꿔서 내보낸다.
    text = unicodedata.normalize('NFC', text)
    dst = unicodedata.normalize('NFC', dst)

    # 메모장용: UTF-8 BOM + CRLF
    with open(dst, 'wb') as f:
        f.write(b'\xef\xbb\xbf')
        f.write(text.replace('\n', '\r\n').encode('utf-8'))

    # 맥이 저장하면서 파일 이름을 다시 쪼개놓는 경우가 있어 한 번 더 확인한다
    folder, name = os.path.split(dst)
    for existing in os.listdir(folder or '.'):
        if existing != name and unicodedata.normalize('NFC', existing) == name:
            os.rename(os.path.join(folder, existing), dst)

    print('  %s  →  %s' % (os.path.basename(src), os.path.basename(dst)))


if __name__ == '__main__':
    main()
