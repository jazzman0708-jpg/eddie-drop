#!/usr/bin/env python3
"""
배포할 파일만 골라 모은다.

무엇을 빼는지는 여기 한 곳에서만 정한다.
맥(build.sh)과 윈도우(깃허브 워크플로)가 같은 규칙을 쓰기 위한 것.
전에 이 목록이 두 군데로 갈라져서 개발 문서가 사용자 확장 폴더에 들어간 적이 있다.

  python3 build/stage-payload.py <저장소 폴더> <모을 폴더>
"""
import os
import shutil
import sys


# 윈도우 파이썬은 기본 출력 인코딩이 cp1252 라 한글을 못 찍는다
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

# 확장에 들어가면 안 되는 것 (폴더 이름 또는 파일 이름, 최상위 기준)
EXCLUDE = {
    'build', 'dist', '.git', '.github', '.gitignore',
    '.debug', '.dev', '__test.html', '.DS_Store',
    'README.md', 'docs', 'installer', 'assets',
    'version.json', '배포방법.md', '설치방법.md',
    'node_modules', '.claude', '_preview.html',
}

# 어느 폴더에 있든 빼는 것
EXCLUDE_ANY = {'.DS_Store', '__MACOSX'}


def stage(root, dest):
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)

    count = 0
    for name in sorted(os.listdir(root)):
        if name in EXCLUDE:
            continue
        src = os.path.join(root, name)
        dst = os.path.join(dest, name)
        if os.path.isdir(src):
            shutil.copytree(
                src, dst,
                ignore=shutil.ignore_patterns(*EXCLUDE_ANY),
                symlinks=False,
            )
        else:
            shutil.copy2(src, dst)

    for _, _, files in os.walk(dest):
        count += len(files)
    return count


def main():
    if len(sys.argv) != 3:
        sys.exit('쓰는 법: stage-payload.py <저장소 폴더> <모을 폴더>')

    root, dest = sys.argv[1], sys.argv[2]
    n = stage(root, dest)

    # 실수로 들어가면 안 되는 것이 섞였는지 마지막으로 확인
    for bad in ('.dev', '.debug', '__test.html', 'docs', 'installer'):
        if os.path.exists(os.path.join(dest, bad)):
            sys.exit('❌ 배포본에 %s 가 들어갔습니다' % bad)

    for must in ('index.html', 'CSXS/manifest.xml', 'plugin/plugin.json',
                 'shell/loader.js', 'jsx/boot.jsx'):
        if not os.path.exists(os.path.join(dest, must.replace('/', os.sep))):
            sys.exit('❌ 배포본에 %s 가 없습니다' % must)

    print('   배포 파일 %d개 정리' % n)


if __name__ == '__main__':
    main()
