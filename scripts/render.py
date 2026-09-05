#!/usr/bin/env python3
"""Render explicit stages; normal previews/finals respect the two user review gates."""
import argparse, json, subprocess, time
from pathlib import Path
from common import read, write, filehash, ensure_script, probe, run_main
from review import ensure_opening, opening_hash
from validate import validate

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('project',type=Path);p.add_argument('--stage',choices=['draft','opening','preview','final'],required=True);p.add_argument('--format',choices=['3x4','9x16','16x9','all'],default='3x4');p.add_argument('--scale',type=float);a=p.parse_args()
    project=a.project.resolve();draft=a.stage=='draft'
    subprocess.run(['node','core/build.mjs']+(['--draft']if draft else []),cwd=project,check=True)
    validate(project,draft);t=read(project/'content/timeline.json')
    if not draft:ensure_script(project)
    if a.stage in ['preview','final']:
        if t['scope']!='full':raise ValueError('Complete the full film and use scope=full before full preview/final')
        ensure_opening(project)
    scale=a.scale if a.scale is not None else (1 if a.stage=='final' else .5)
    if scale<=0 or scale>2:raise ValueError('scale must be >0 and <=2')
    formats=list(t['formats']) if a.format=='all' else [a.format]
    for fmt in formats:
        dims=t['formats'][fmt]
        if any(abs(dims[k]*scale-round(dims[k]*scale))>1e-8 or round(dims[k]*scale)%2 for k in ['width','height']):raise ValueError('H.264 scale must produce even integer dimensions')
        output=project/f'out/{a.stage}-{fmt}.mp4';output.parent.mkdir(exist_ok=True)
        # Preserve earlier renders, including approved samples, for comparisons.
        if output.exists():
            archive=output.parent/'versions';archive.mkdir(exist_ok=True)
            output.replace(archive/f'{output.stem}-{time.time_ns()}.mp4')
        cmd=['npx','--no-install','remotion','render',f'Film-{fmt}',str(output),'--codec=h264','--crf=18',f'--scale={scale}','--log=error']
        frames=t['durationFrames']
        if a.stage=='opening':
            frames=min(frames,t['fps']*10);cmd.append(f'--frames=0-{frames-1}')
        subprocess.run(cmd,cwd=project,check=True)
        info=probe(output);video=next(x for x in info['streams'] if x['codec_type']=='video')
        expected=[round(dims['width']*scale),round(dims['height']*scale)]
        if [video['width'],video['height']]!=expected:raise ValueError('Rendered dimensions differ from composition')
        if abs(float(info['format']['duration'])-frames/t['fps'])>.12:raise ValueError('Rendered duration differs from timeline')
        audible=any(v['from']<frames and v['real'] for v in t['voices']) or any(v['from']<frames for v in t['audio'])
        if audible and not any(x['codec_type']=='audio' for x in info['streams']):raise ValueError('Expected audio stream is missing')
        meta={'stage':a.stage,'format':fmt,'width':video['width'],'height':video['height'],'frames':frames,'fps':t['fps'],'sha256':filehash(output)}
        if a.stage=='opening' and fmt=='3x4':meta['openingDigest']=opening_hash(project)
        write(output.with_suffix('.render.json'),meta);print(output)

if __name__=='__main__':run_main(main)
