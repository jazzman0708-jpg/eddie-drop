#!/usr/bin/env python3
"""배포본 검사 — plugin.json 에 적힌 파일이 다 있는지, 버전이 manifest 와 같은지."""
import json, os, sys


# 윈도우 파이썬은 기본 출력 인코딩이 cp1252 라 한글을 못 찍는다
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

plugin_dir, version = sys.argv[1], sys.argv[2]
meta = json.load(open(os.path.join(plugin_dir, 'plugin.json'), encoding='utf-8'))

missing = [f for f in meta['styles'] + meta['scripts'] + [meta['jsx']]
           if not os.path.exists(os.path.join(plugin_dir, f))]
if missing:
    sys.exit('❌ plugin.json 에 적힌 파일이 없습니다: ' + ', '.join(missing))

if meta['version'] != version:
    sys.exit('❌ 버전이 다릅니다 — manifest.xml=%s, plugin.json=%s' % (version, meta['version']))

url = meta.get('update', {}).get('manifestUrl', '')
if 'OWNER' in url or 'REPO' in url:
    print('⚠️  업데이트 주소가 아직 자리표시자입니다 (plugin.json 의 update.manifestUrl)')

print('   기능 파일 %d개 확인 · v%s' % (len(meta['scripts']), version))
