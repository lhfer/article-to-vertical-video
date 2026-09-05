#!/usr/bin/env python3
"""Seed-TTS 2.0: fingerprinted per-paragraph synthesis after script approval.
--dry-run prints a plan without writing silent audio. Existing unknown files are preserved.
"""
import base64
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

DEFAULT_SPEAKER = "zh_male_qingshuangnanda_uranus_bigtts"
DEFAULT_RATE = 28
DEFAULT_STYLE = "阳光、青春、有活力、有亲和力，像与朋友分享有趣发现，重音与停顿跟随语义，表达自然清楚"
ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
RESOURCE_ID = "seed-tts-2.0"
KEY_HINT = "SEED_AUDIO_KEY not set. export SEED_AUDIO_KEY=…  or:  set -a; source config.env; set +a"

JSON_MODE = False


def log(*a):
    print(*a, file=sys.stderr if JSON_MODE else sys.stdout, flush=True)


def die(msg, code=1):
    print(f"tts_seed2.py: {msg}", file=sys.stderr)
    sys.exit(code)


def ffprobe_seconds(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode().strip()
    return round(float(out), 3)


# ------------------------------------------------------------------ Seed-TTS 2.0 (kept verbatim from v1)
def tts(text, dst, key, speaker, rate, style):
    body = {"user": {"uid": "vertical-video"}, "req_params": {"text": text, "speaker": speaker,
            "audio_params": {"format": "mp3", "sample_rate": 48000, "speech_rate": rate},
            "additions": json.dumps({"context_texts": [style]}, ensure_ascii=False)}}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json", "X-Api-Key": key, "X-Api-Resource-Id": RESOURCE_ID, "X-Api-Request-Id": str(uuid.uuid4())})
    raw = None
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                raw = r.read()
            break
        except urllib.error.HTTPError as e:
            sys.exit(f"HTTP {e.code}: {e.read()[:300]}")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt == 2:
                sys.exit(f"network error for {dst.stem}: {e}")
            log(f"  retry {dst.stem}: {e}")
    audio = b""
    for line in raw.split(b"\n"):
        if line.strip():
            j = json.loads(line)
            if j.get("code") not in (0, 20000000): sys.exit(f"TTS error for {dst.stem}: {j}")
            if j.get("data"): audio += base64.b64decode(j["data"])
    if not audio: sys.exit(f"no audio for {dst.stem}: {raw[:300]}")
    dst.write_bytes(audio)


def fingerprint(text, speaker, rate, style, dry):
    return hashlib.sha1(f"{text}\x1f{speaker}\x1f{rate}\x1f{style}\x1f{'dry' if dry else 'seed2'}".encode()).hexdigest()[:16]

def main():
    import argparse, time
    from common import read,write,ensure_script,ident,filehash,run_main
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('project',type=pathlib.Path);p.add_argument('--only');p.add_argument('--speaker');p.add_argument('--rate',type=int);p.add_argument('--style');p.add_argument('--force',action='store_true');p.add_argument('--dry-run',action='store_true');a=p.parse_args()
    project=a.project.resolve();script=read(project/'content/script.json');brief=read(project/'content/brief.json');settings=brief.get('tts',{})
    if settings.get('provider','seed2')!='seed2':raise ValueError('Use the selected voice provider and import its audio/alignment; this command is Seed-TTS only.')
    speaker=a.speaker or settings.get('speaker',DEFAULT_SPEAKER);rate=a.rate if a.rate is not None else settings.get('rate',DEFAULT_RATE);style=a.style or settings.get('style',DEFAULT_STYLE)
    if not -50<=rate<=100:raise ValueError('Seed speech rate must be -50..100')
    beats=[b for b in script['beats'] if b.get('narration','').strip()]
    if a.only:
        selected=set(a.only.split(','));unknown=selected-{b['id'] for b in beats}
        if unknown:raise ValueError('Unknown voice ids: '+','.join(unknown))
        beats=[b for b in beats if b['id'] in selected]
    for b in beats:ident(b['id'])
    if a.dry_run:
        print(json.dumps({'executed':False,'speaker':speaker,'rate':rate,'ids':[b['id'] for b in beats],'text':[b['narration'] for b in beats]},ensure_ascii=False,indent=2));return
    ensure_script(project)
    key=os.environ.get('SEED_AUDIO_KEY')
    if not key:raise ValueError(KEY_HINT)
    folder=project/'public/narration';folder.mkdir(parents=True,exist_ok=True);index=read(folder/'index.json',{});durations=read(project/'content/narration-durations.json',{})
    for b in beats:
        text=b['narration'];id=b['id'];dst=folder/f'{id}.mp3';voice=b.get('voice',{});br=voice.get('rate',rate);bs=voice.get('style',style)
        if not -50<=br<=100:raise ValueError('Invalid per-paragraph rate '+id)
        fp=fingerprint(text,speaker,br,bs,False);record=index.get(id,{})
        if dst.exists() and not a.force and isinstance(record,dict) and record.get('fingerprint')==fp and record.get('sha256')==filehash(dst):
            print('reuse '+id);continue
        temp=folder/f'.{id}-{time.time_ns()}.mp3'
        tts(text,temp,key,speaker,br,bs);seconds=ffprobe_seconds(temp)
        if dst.exists():
            archive=project/'work/voice-versions';archive.mkdir(parents=True,exist_ok=True);dst.replace(archive/f'{id}-{time.time_ns()}.mp3')
        temp.replace(dst);index[id]={'fingerprint':fp,'sha256':filehash(dst),'provider':'seed2','speaker':speaker,'rate':br,'style':bs};durations[id]=seconds
        write(folder/'index.json',index);write(project/'content/narration-durations.json',durations)
        print(f'{id}: {seconds:.3f}s; align the actual audio before production rendering')

if __name__=='__main__':
    from common import run_main
    run_main(main)
