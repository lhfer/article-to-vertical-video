#!/usr/bin/env python3
"""Install one package for selected hosts; existing installations are preserved."""
import argparse,shutil,sys
from pathlib import Path
from common import ROOT,run_main

DIRS={'claude':'.claude/skills','cursor':'.cursor/skills','grok':'.grok/skills','codex':'.agents/skills'}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--hosts',default='claude,cursor,grok');p.add_argument('--project',type=Path,help='Project-local installation; otherwise user-level');p.add_argument('--copy',action='store_true',help='Portable copy (recommended for cloud/another machine), otherwise symlink');p.add_argument('--dry-run',action='store_true');a=p.parse_args()
    base=a.project.resolve() if a.project else Path.home()
    for host in a.hosts.split(','):
        if host not in DIRS:raise ValueError('Unknown host '+host)
        target=base/DIRS[host]/ROOT.name
        if target.exists() or target.is_symlink():
            if target.resolve()==ROOT:print('already linked '+str(target));continue
            raise ValueError(f'Existing installation preserved: {target}. Review/version it before replacing deliberately.')
        print(('copy' if a.copy else 'link')+' '+str(target))
        if not a.dry_run:
            target.parent.mkdir(parents=True,exist_ok=True)
            if a.copy:shutil.copytree(ROOT,target,ignore=shutil.ignore_patterns('node_modules','__pycache__','.DS_Store','.git','out','work','config.env','.env'))
            else:target.symlink_to(ROOT,target_is_directory=True)
if __name__=='__main__':run_main(main)
