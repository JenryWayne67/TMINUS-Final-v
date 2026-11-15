#!/usr/bin/env python3
from pathlib import Path
import zipfile,json,hashlib,shutil,os,sys,re
root=Path(__file__).resolve().parents[1];version=json.loads((root/'package.json').read_text())['version'];out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'releases';out.mkdir(parents=True,exist_ok=True)
exclude={'node_modules','data','work','.git','.codex','.agents','downloads','releases','__pycache__'}
files=[p for p in root.rglob('*') if p.is_file() and not any(x in exclude for x in p.relative_to(root).parts) and p.name!='project.local.yaml']
configs={'package.json','package-lock.json','build.mjs','Dockerfile','compose.yaml','compose.cluster.yaml','Caddyfile','.dockerignore','README.md','DEPLOY.md','RELEASE_NOTES.md','REQUIREMENTS_STATUS.md','QA_REPORT.md','START_GAME.sh','START_GAME.bat','START_HERE.txt','render.yaml'}
def pack(name,selected,arc):
 with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for p in selected:z.write(p,arc(p))
pack(f'TMINUS-v{version}-SOURCE.zip',files,lambda p:f'TMINUS-v{version}/'+p.relative_to(root).as_posix())
pack(f'TMINUS-v{version}-NODE-DEPLOY.zip',[p for p in files if p.relative_to(root).parts[0] in {'dist','server'} or p.relative_to(root).as_posix() in configs],lambda p:p.relative_to(root).as_posix())
pack(f'TMINUS-v{version}-STATIC-CLIENT.zip',[p for p in files if p.relative_to(root).parts[0]=='dist'],lambda p:p.relative_to(root/'dist').as_posix())
with zipfile.ZipFile(out/f'TMINUS-v{version}-QA-EVIDENCE.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in (Path(os.environ.get('QA_EVIDENCE_DIR',root/'work/qa'))).glob('*'):
  if p.is_file() and 'failure' not in p.name:z.write(p,'screenshots/'+p.name if p.suffix=='.png' else p.name)
 for p in (root/'qa').glob('*'):
  if p.is_file():z.write(p,'qa/'+p.name)
 for name in ['QA_REPORT.md','REQUIREMENTS_STATUS.md','RELEASE_NOTES.md']:z.write(root/name,name)
checks=[]
for p in sorted(out.glob(f'TMINUS-v{version}-*.zip')):
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None
  assert all(not n.startswith('/') and '..' not in Path(n).parts for n in z.namelist())
  if 'SOURCE' in p.name:assert f'TMINUS-v{version}/tests/full-network-match.mjs' in z.namelist()
  if 'NODE' in p.name:assert 'server/gateway.mjs' in z.namelist() and 'compose.cluster.yaml' in z.namelist()
  if 'STATIC' in p.name:assert [n for n in z.namelist() if re.fullmatch(r't-minus-v[0-9.]+\.js',n)]==[f't-minus-v{version}.js']
  checks.append({'file':p.name,'bytes':p.stat().st_size,'entries':len(z.infolist()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'version':version,'packages':checks},indent=2)+'\n')
(out/'SHA256SUMS.txt').write_text('\n'.join(p['sha256']+'  '+p['file'] for p in checks)+'\n')
for name in ['QA_REPORT.md','RELEASE_NOTES.md','REQUIREMENTS_STATUS.md','README.md','DEPLOY.md']:shutil.copy2(root/name,out/name)
print(json.dumps(checks,indent=2))
