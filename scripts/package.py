#!/usr/bin/env python3
"""Build a portable skill ZIP from this source directory; generated work and credentials stay out."""
import argparse,zipfile,hashlib
from pathlib import Path
from common import ROOT,run_main
EXCLUDE={'.git','node_modules','__pycache__','.DS_Store','out','work','config.env','.env'}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);a=p.parse_args();out=a.output.resolve();out.parent.mkdir(parents=True,exist_ok=True)
    files=[x for x in ROOT.rglob('*') if x.is_file() and x.resolve()!=out and not any(part in EXCLUDE for part in x.relative_to(ROOT).parts) and x.suffix not in ['.pyc','.log']]
    if out.exists():raise ValueError('Output exists; choose a new package filename to preserve the prior package')
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for f in sorted(files):z.write(f,str(Path(ROOT.name)/f.relative_to(ROOT)))
    with zipfile.ZipFile(out) as z:
        if z.testzip():raise ValueError('Archive integrity check failed')
    print(str(out));print('files='+str(len(files)));print('sha256='+hashlib.sha256(out.read_bytes()).hexdigest())
if __name__=='__main__':run_main(main)
