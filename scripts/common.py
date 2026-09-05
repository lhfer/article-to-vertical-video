"""Small shared file/validation helpers; no account secrets are read here."""
from pathlib import Path
import hashlib, json, os, re, subprocess, tempfile, unicodedata

ROOT = Path(__file__).resolve().parent.parent

def read(path, default=None):
    p = Path(path)
    if not p.exists() and default is not None: return default
    return json.loads(p.read_text(encoding='utf-8'))

def write(path, value):
    p = Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    fd, tmp = tempfile.mkstemp(prefix='.' + p.name, dir=p.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f: f.write(data)
        os.replace(tmp, p)
    finally:
        if Path(tmp).exists(): Path(tmp).unlink()

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def filehash(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def texthash(text): return hashlib.sha256(text.encode()).hexdigest()
def norm(text): return ''.join(c.lower() for c in unicodedata.normalize('NFKC',text) if c.isalnum())

def inside(root, relative):
    root = Path(root).resolve(); p = (root / relative).resolve()
    if Path(relative).is_absolute() or not p.is_relative_to(root): raise ValueError(f'Path must stay under {root.name}: {relative}')
    return p

def ident(value):
    if not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_-]*', value): raise ValueError(f'Invalid id: {value}')
    return value

def probe(path):
    r = subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)], check=True, capture_output=True, text=True)
    return json.loads(r.stdout)

def duration(path): return float(probe(path)['format']['duration'])

def script_material(project):
    s = read(Path(project)/'content/script.json')
    return {k:s.get(k,'') for k in ['title','viewerPromise','thesis']} | {'beats':[{'id':b['id'],'narration':b.get('narration','')} for b in s.get('beats',[])]}

def script_hash(project): return digest(script_material(project))

def ensure_script(project):
    r = read(Path(project)/'content/reviews.json', {})
    if r.get('script', {}).get('digest') != script_hash(project):
        raise ValueError('Full script needs a current user approval. Present out/script-review.md, then record the actual reply with review.py.')

def run_main(fn):
    try: fn()
    except (ValueError, KeyError, FileNotFoundError, json.JSONDecodeError, subprocess.CalledProcessError) as e:
        raise SystemExit(str(e))
