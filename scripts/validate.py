#!/usr/bin/env python3
"""Validate sources, transcript/audio identity, assets and compiled timeline freshness."""
import argparse, hashlib, json
from pathlib import Path
from common import read, inside, filehash, texthash, duration, norm, ident, run_main

def validate(project,draft=False):
    project=Path(project);s=read(project/'content/script.json');film=read(project/'content/film.json');a=read(project/'content/alignment.json',{});t=read(project/'content/timeline.json');brief=read(project/'content/brief.json')
    canonical='\x1f'.join((project/f).read_text(encoding='utf-8') if (project/f).exists() else '{}' for f in ['content/film.json','content/script.json','content/alignment.json'])
    if t.get('inputHash')!=hashlib.sha256(canonical.encode()).hexdigest():raise ValueError('Timeline is stale: run project.py compile')
    if t.get('draft') and not draft:raise ValueError('Technical draft cannot be used as a real preview/final')
    if not draft and brief.get('narrationRequired',True) and not t['voices']:raise ValueError('This brief requires actual narration')
    sources={x['id']:x for x in read(project/'content/sources.json',[])}
    claims={x['id']:x for x in read(project/'content/claims.json',[])}
    for c in claims.values():
        src=sources.get(c.get('sourceId'))
        if not src:raise ValueError('Unknown source for claim '+c['id'])
        sourcefile=inside(project,src['textFile'])
        quote=c.get('quote','')
        if not quote.strip() or ''.join(quote.split()) not in ''.join(sourcefile.read_text(encoding='utf-8').split()):raise ValueError('Quote absent from stated source: '+c['id'])
    ids=set()
    for b in s.get('beats',[]):
        ident(b['id'])
        if b['id'] in ids:raise ValueError('Duplicate script id')
        ids.add(b['id'])
        for c in b.get('claims',[]):
            if c not in claims:raise ValueError(f"Unknown claim {c} in {b['id']}")
    scheduled={v['id'] for v in t['voices']}
    for b in s.get('beats',[]):
        if b['id'] not in scheduled or not b.get('narration'):continue
        seg=a.get('segments',{}).get(b['id'])
        if not seg:
            if draft:continue
            raise ValueError('Missing alignment '+b['id'])
        audio=inside(project/'public',seg['src'])
        if seg.get('audioSha256')!=filehash(audio) or seg.get('textSha256')!=texthash(b['narration']):raise ValueError('Audio/script changed after alignment: '+b['id'])
        if abs(duration(audio)-seg['durationSeconds'])>.08:raise ValueError('Audio duration differs from alignment: '+b['id'])
    assets=film.get('assets',{})
    for s in t['shots']:
        for id in s.get('assets',[]):
            if id not in assets:raise ValueError('Unknown shot asset '+id)
    for id in film.get('globalAssets',[]):
        if id not in assets:raise ValueError('Unknown global asset '+id)
    for id,asset in assets.items():
        path=inside(project/'public',asset['src'])
        if not path.is_file():raise ValueError('Missing asset '+id)
        if asset.get('sha256') and filehash(path)!=asset['sha256']:raise ValueError('Changed asset '+id)
    for clip in t['audio']:
        path=inside(project/'public',clip['src'])
        if duration(path)*t['fps']+2<clip['trimStart']+clip['durationFrames']:raise ValueError('Audio track is too short: '+clip['src'])
        if not 0<=clip.get('duck',1)<=1:raise ValueError('duck must be 0..1')
    return {'ok':True,'draft':bool(t.get('draft')),'shots':len(t['shots']),'frames':t['durationFrames'],'facts':'Quote provenance checked; meaning and numerical context require editorial review.'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('project',type=Path);p.add_argument('--draft',action='store_true');a=p.parse_args();print(json.dumps(validate(a.project,a.draft),ensure_ascii=False))
if __name__=='__main__':run_main(main)
