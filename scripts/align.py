#!/usr/bin/env python3
"""Import measured timestamps or transcribe actual audio; review before production use."""
import argparse, json, subprocess
from pathlib import Path
from common import read, write, inside, duration, filehash, texthash, norm, ident, run_main

def check_words(words,seconds):
    last=0
    for w in words:
        if not isinstance(w.get('text'),str) or not isinstance(w.get('startMs'),(int,float)) or not isinstance(w.get('endMs'),(int,float)):raise ValueError('Expected Caption-shaped entries: text/startMs/endMs')
        if w['startMs']<last-1 or w['endMs']<=w['startMs'] or w['endMs']>seconds*1000+80:raise ValueError('Timestamps overlap or exceed actual audio')
        last=w['endMs'];w.setdefault('timestampMs',None);w.setdefault('confidence',None)
    if not words:raise ValueError('No measured timestamps')

def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='cmd',required=True)
    for cmd in ['import','transcribe','review']:
        q=sub.add_parser(cmd);q.add_argument('project',type=Path);q.add_argument('--id',required=True)
        if cmd!='review':q.add_argument('--audio',help='Relative to public; defaults to narration/<id>.mp3')
        if cmd=='import':q.add_argument('--words',required=True,type=Path);q.add_argument('--method',choices=['provider','manual','whisper'],default='provider')
        if cmd=='transcribe':q.add_argument('--model',required=True,type=Path);q.add_argument('--language',default='zh')
        if cmd=='review':q.add_argument('--note',required=True,help='Record actual listen/check and corrections')
    a=p.parse_args();project=a.project.resolve();id=ident(a.id)
    beat=next((b for b in read(project/'content/script.json')['beats'] if b['id']==id),None)
    if not beat:raise ValueError('Unknown script beat '+id)
    path=project/'content/alignment.json';data=read(path,{'version':3,'segments':{}})
    if a.cmd=='review':
        seg=data['segments'][id];audio=inside(project/'public',seg['src']);check_words(seg['words'],duration(audio))
        if seg['audioSha256']!=filehash(audio) or seg['textSha256']!=texthash(beat['narration']):raise ValueError('Audio/script changed; re-align first')
        if norm(''.join(w['text'] for w in seg['words']))!=norm(beat['narration']):raise ValueError('Transcript differs from approved text; correct measured words and re-import')
        if not a.note.strip():raise ValueError('Provide the actual timing review note')
        seg.update(reviewed=True,reviewNote=a.note);write(path,data);print(id+' alignment reviewed');return
    src=a.audio or f'narration/{id}.mp3';audio=inside(project/'public',src);seconds=duration(audio)
    if a.cmd=='import':
        raw=read(a.words);words=raw if isinstance(raw,list) else raw['words'];method=a.method
        captions=None if isinstance(raw,list) else raw.get('captions')
    else:
        if not a.model.is_file():raise ValueError('Whisper model file missing')
        folder=project/'work/alignment'/id;folder.mkdir(parents=True,exist_ok=True);wav=folder/'audio.wav';out=folder/'whisper'
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(audio),'-ar','16000','-ac','1',str(wav)],check=True)
        subprocess.run(['whisper-cli','-m',str(a.model.resolve()),'-f',str(wav),'-l',a.language,'-ml','1','-sow','-ojf','-of',str(out)],check=True)
        raw=read(out.with_suffix('.json'));words=[]
        for item in raw.get('transcription',[]):
            text=item.get('text','');offsets=item.get('offsets',{})
            if text.strip() and offsets.get('to',0)>offsets.get('from',0):words.append({'text':text,'startMs':offsets['from'],'endMs':offsets['to'],'timestampMs':None,'confidence':None})
        method='whisper';captions=None
    check_words(words,seconds)
    seg={'src':src,'durationSeconds':seconds,'audioSha256':filehash(audio),'textSha256':texthash(beat['narration']),'method':method,'reviewed':False,'words':words,'transcriptMatches':norm(''.join(w['text'] for w in words))==norm(beat['narration'])}
    if captions is not None:check_words(captions,seconds);seg['captions']=captions
    data['segments'][id]=seg;write(path,data)
    print(json.dumps({'id':id,'method':method,'words':len(words),'transcriptMatches':seg['transcriptMatches'],'reviewed':False,'next':'Listen, correct actual timestamps/text when needed, then align.py review --note ...'},ensure_ascii=False))

if __name__=='__main__':run_main(main)
