#!/usr/bin/env python3
"""Initialize a V3 project, prepare a full-script review, compile or validate."""
import argparse, shutil, subprocess
from pathlib import Path
from common import ROOT, read, write, run_main

def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='cmd',required=True)
    for name in ['init','script','compile','validate']:
        q=sub.add_parser(name);q.add_argument('path',type=Path)
        if name=='compile':q.add_argument('--draft',action='store_true')
        if name=='validate':q.add_argument('--draft',action='store_true')
    a=p.parse_args();project=a.path.resolve()
    if a.cmd=='init':
        project=project/'project'
        if project.exists():raise ValueError(f'Project already exists; preserved: {project}')
        shutil.copytree(ROOT/'assets/director',project,ignore=shutil.ignore_patterns('node_modules','out','__pycache__','.DS_Store'))
        print(project);return
    if a.cmd=='compile':
        subprocess.run(['node','core/build.mjs']+(['--draft'] if a.draft else []),cwd=project,check=True);return
    if a.cmd=='validate':
        subprocess.run(['python3',str(ROOT/'scripts/validate.py'),str(project)]+(['--draft']if a.draft else []),check=True);return
    s=read(project/'content/script.json');lines=['# '+s.get('title','脚本文案'),'', '**观看收益**：'+s.get('viewerPromise',''),'', '**核心观点**：'+s.get('thesis',''),'','## 完整口播','']
    for b in s.get('beats',[]):
        lines.extend([f"### {b['id']}",'',b.get('narration',''),''])
        if b.get('viewerGain'):lines.extend(['本段作用：'+b['viewerGain'],''])
        if b.get('claims'):lines.extend(['事实引用：'+', '.join(b['claims']),''])
    lines.extend(['## 视觉方向','',read(project/'content/visual.json',{}).get('concept','待按本条素材设计'),''])
    out=project/'out/script-review.md';out.parent.mkdir(exist_ok=True);out.write_text('\n'.join(lines),encoding='utf-8');print(out)

if __name__=='__main__':run_main(main)
