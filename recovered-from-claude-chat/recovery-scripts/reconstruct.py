"""Rebuild the files Claude wrote in a shared claude.ai conversation (v2).

Replays, in transcript order and without executing anything:
  * Write / create_file (full content) and Edit (exact replacement)
  * shell heredocs: `cat > f <<EOF`, `cat >> f`, `tee f <<EOF`
  * one-off `python3 - <<EOF` edit scripts, through the pyreplay interpreter
  * rm / git rm / mv / cp between tracked files
Anything else that may have changed a tracked file marks it uncertain.

usage: python3 -I reconstruct2.py <events.jsonl> <out_dir>
"""
import json
import os
import re
import shlex
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyreplay import UNKNOWN, Abort, Interp, Unsupported  # noqa: E402
from shellbits import SedUnsupported, redirect_targets, sed_apply, split_statements  # noqa: E402
import fnmatch  # noqa: E402

EVENTS, OUT = sys.argv[1], sys.argv[2]
REPO = '/home/claude/aeterna'
ev = [json.loads(l) for l in open(EVENTS, encoding='utf-8')]


class FS:
    def __init__(self):
        self.files = {}
        self.deleted = {}
        self.seq = None
        self.msg = None
        self.written_now = set()

    def st(self, p):
        return self.files.setdefault(p, {'content': None, 'origin': None, 'written_seq': None, 'ops': Counter(),
                                         'uncertain': [], 'msgs': set(), 'orphan_edits': []})

    def exists(self, p):
        return p in self.files and self.files[p]['content'] is not None and p not in self.deleted

    def read(self, p):
        if not self.exists(p):
            if p.startswith(REPO + '/') or p.startswith('/home/claude/'):
                return UNKNOWN  # a project file the transcript never showed
            raise Unsupported('missing base ' + p)
        return self.files[p]['content']

    def write(self, p, text, origin='python'):
        if text is UNKNOWN:
            if self.exists(p):
                self.flag(p, 'overwritten with content derived from an unknown file')
                self.files[p]['content'] = None
            return
        s = self.st(p)
        if s['written_seq'] is None or origin != 'python':
            s['written_seq'] = self.seq
        s['content'] = text
        s['origin'] = s['origin'] if origin == 'python' and s['origin'] else origin
        s['ops'][origin] += 1
        s['msgs'].add(self.msg)
        self.written_now.add(p)
        self.deleted.pop(p, None)
        if origin != 'python':
            s['uncertain'] = []

    def flag(self, p, why):
        if p in self.files:
            self.files[p]['uncertain'].append((self.seq, why))


fs = FS()
HEREDOC_OPEN = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
MODIFY = re.compile(r"perl\s+-p?i|git\s+(checkout|restore|apply|reset|mv)|\btee\s|--write|\bpatch\s|"
                    r"prettier|eslint\s+.*--fix|npm\s+run\s+(lint:fix|format)|\bsed\s+-i")


def expand(tok, env):
    def sub(m):
        k = m.group(1) or m.group(2)
        if k not in env:
            raise KeyError(k)
        return env[k]
    return re.sub(r"\$\{([A-Za-z_]\w*)(?::\?)?\}|\$([A-Za-z_]\w*)", sub, tok)


def resolve(tok, cwd, env):
    tok = tok.strip().strip('\'"')
    try:
        tok = expand(tok, env)
    except KeyError:
        return None
    if not tok or any(c in tok for c in '*?`$(){}'):
        return None
    return os.path.normpath(tok if tok.startswith('/') else os.path.join(cwd, tok))


def split_heredocs(cmd):
    """Yield ('shell', text) and ('heredoc', opener_line, body) pieces in order."""
    pos = 0
    while True:
        m = HEREDOC_OPEN.search(cmd, pos)
        if not m:
            yield ('shell', cmd[pos:])
            return
        line_start = cmd.rfind('\n', 0, m.start()) + 1
        line_end = cmd.find('\n', m.end())
        if line_end < 0:
            yield ('shell', cmd[pos:])
            return
        tag = m.group(2)
        end = re.compile(r'^\t*' + re.escape(tag) + r'\s*$', re.M).search(cmd, line_end + 1)
        if not end:
            yield ('shell', cmd[pos:])
            return
        yield ('shell', cmd[pos:line_start])
        opener = cmd[line_start:line_end]
        yield ('heredoc', opener, cmd[line_end + 1:end.start()])
        # the rest of the opener line (after the tag) runs too, e.g. `<<EOF && node x`
        yield ('shell', opener[m.end() - line_start:])
        pos = end.end()


statements = split_statements


def expand_glob(tok, cwd, env):
    if '*' not in tok and '?' not in tok:
        p = resolve(tok, cwd, env)
        return [p] if p else []
    try:
        tok = expand(tok.strip('\'"'), env)
    except KeyError:
        return []
    pat = os.path.normpath(tok if tok.startswith('/') else os.path.join(cwd, tok))
    return [q for q in fs.files if fnmatch.fnmatch(q, pat) and fs.exists(q)]


def do_sed(words, st, raw):
    scripts, files, i = [], [], 1
    inplace = False
    while i < len(words):
        w = words[i]
        if w.startswith('-i'):
            inplace = True
        elif w == '-e':
            scripts.append(words[i + 1]); i += 1
        elif w.startswith('-'):
            return False  # -E, -n, -z ...: not replayed
        elif not scripts:
            scripts.append(w)
        else:
            files.append(w)
        i += 1
    if not inplace:
        return True
    targets = [p for f in files for p in expand_glob(f, st['cwd'], st['env'])]
    for p in targets:
        if not fs.exists(p):
            fs.flag(p, 'sed on unknown base')
            continue
        try:
            text = fs.files[p]['content']
            for sc in scripts:
                text = sed_apply(sc, text)
            fs.write(p, text, 'sed')
        except (SedUnsupported, re.error) as x:
            fs.flag(p, 'sed not replayed: ' + str(x))
    return True


def tracked_mentions(text, cwd):
    hits = []
    for p in fs.files:
        rel = os.path.relpath(p, cwd) if p.startswith(cwd + '/') else None
        if p in text or (rel and re.search(r'(^|[\s\'"=/])' + re.escape(rel) + r'($|[\s\'";&|)])', text)):
            hits.append(p)
    return hits


def do_shell(text, st):
    for s in statements(text):
        m = re.match(r"^(?:export\s+)?([A-Za-z_]\w*)=(\S*)$", s)
        if m:
            try:
                st['env'][m.group(1)] = expand(m.group(2).strip('\'"'), st['env'])
            except KeyError:
                st['env'].pop(m.group(1), None)
            continue
        try:
            words = shlex.split(s, comments=True)
        except ValueError:
            words = s.split()
        if not words:
            continue
        w0 = words[0]
        if w0 == 'cd' and len(words) >= 2:
            p = resolve(words[1], st['cwd'], st['env'])
            st['cwd'] = p if p else '/unknown'
            continue
        if w0 in ('rm', 'git') and (w0 == 'rm' or words[1:2] == ['rm']):
            args = [w for w in (words[1:] if w0 == 'rm' else words[2:]) if not w.startswith('-')]
            for a in args:
                p = resolve(a, st['cwd'], st['env'])
                if p and p in fs.files:
                    fs.deleted[p] = fs.seq
                elif p:  # a whole directory
                    for q in list(fs.files):
                        if q.startswith(p + '/'):
                            fs.deleted[q] = fs.seq
            continue
        if w0 in ('mv', 'cp') or (w0 == 'git' and words[1:2] == ['mv']):
            args = [w for w in words[1:] if not w.startswith('-')]
            if w0 == 'git':
                args = args[1:]
            if len(args) == 2:
                a, b = (resolve(x, st['cwd'], st['env']) for x in args)
                if a and b and fs.exists(a):
                    if b in fs.files or not os.path.splitext(b)[1] == '' or not any(
                            q.startswith(b + '/') for q in fs.files):
                        dst = b
                    else:
                        dst = os.path.join(b, os.path.basename(a))
                    fs.write(dst, fs.files[a]['content'], 'shell-' + w0)
                    if w0 != 'cp':
                        fs.deleted[a] = fs.seq
                    continue
                if b:
                    for q in list(fs.files):
                        if q == b or q.startswith(b + '/'):
                            fs.flag(q, w0 + ' from unknown source')
            continue
        if w0 == 'sed' and do_sed(words, st, s):
            continue
        if w0 == 'git' and words[1:2] == ['stash']:
            continue  # only ever used as `git stash ... git stash pop` around a check
        for mode, tgt in redirect_targets(s):
            p = resolve(tgt, st['cwd'], st['env'])
            if p and p in fs.files:
                fs.flag(p, 'shell redirect: ' + s[:100])
        if MODIFY.search(s):
            for p in tracked_mentions(s, st['cwd']):
                fs.flag(p, s[:120])
            if re.match(r"git\s+(checkout|restore|stash|reset|apply)", s) and st['cwd'] == REPO:
                # touches files it doesn't name: everything under the named paths, or the whole repo
                named = [resolve(w, st['cwd'], st['env']) for w in words[2:] if not w.startswith('-')]
                for q in fs.files:
                    if q.startswith(REPO + '/') and (not named or any(n and (q == n or q.startswith(n + '/')) for n in named)):
                        if re.match(r"git\s+(stash|reset\s+--hard|checkout\s+\.|apply)", s) or named:
                            fs.flag(q, s[:120])


def do_heredoc(opener, body, st, e):
    o = opener.strip()
    m = re.search(r"\bcat\s+(>>?)\s*(\S+)\s*<<|\bcat\s+<<-?\s*\S+\s*(>>?)\s*(\S+)|\btee\s+(-a\s+)?(\S+)\s*<<", o)
    if m:
        if m.group(2):
            mode, tgt = m.group(1), m.group(2)
        elif m.group(4):
            mode, tgt = m.group(3), m.group(4)
        else:
            mode, tgt = ('>>' if m.group(5) else '>'), m.group(6)
        p = resolve(tgt, st['cwd'], st['env'])
        if p:
            text = body + '\n'
            if mode == '>>' and fs.exists(p):
                fs.write(p, fs.files[p]['content'] + text, 'heredoc')
            else:
                fs.write(p, text, 'heredoc')
        return
    if re.search(r"\bpython3?\b", o):
        interp = Interp(fs, st['cwd'] if st['cwd'] != '/unknown' else '/unknown')
        fs.written_now = set()
        real_failed = bool(e.get('result') and 'Traceback (most recent call last)' in e['result'])
        try:
            interp.run(body)
            ours = 'ok'
        except Abort:
            ours = 'abort'
        except Unsupported as x:
            ours = 'unsupported:' + str(x)[:80]
        except Exception as x:  # a real Python error in the script, as it would have raised for real
            ours = 'error:' + type(x).__name__
        st['py'][ours.split(':')[0]] += 1
        # Our run must end the way the real one did; otherwise our copy of some file differs.
        if ours.startswith('unsupported:missing base') and not real_failed:
            # Writes made before the miss are exact; files the script never got to are not.
            for p in (interp.touched | set(tracked_mentions(body, st['cwd']))) - fs.written_now:
                fs.flag(p, 'python script not replayed: ' + ours)
            st['py']['partial'] += 1
            return
        if ours.startswith('unsupported') or (ours == 'ok') == real_failed:
            if not ours.startswith('unsupported'):
                st['py']['diverged'] += 1
            elif not ours.startswith('unsupported:missing base'):
                st['unsupported'][ours] += 1
            for p in interp.touched | set(tracked_mentions(body, st['cwd'])):
                fs.flag(p, 'python script not replayed: ' + ours)
        return
    # node/other interpreters fed a heredoc: flag anything they name
    if re.search(r"\b(node|bash|sh|npx|tsx)\b", o):
        if re.search(r"writeFileSync|fs\.write|>\s*\S", body):
            for p in tracked_mentions(body, st['cwd']):
                fs.flag(p, 'node script ' + o[:60])


CHECKS = Counter()
DBG = []
MISMATCH = {}


def verify(result, cwd):
    """Compare what the real command printed with our copy at this moment."""
    if cwd == '/unknown':
        return
    for line in result.split('\n'):
        m = re.match(r"^\s*(\d+) (\S+)$", line)
        if m and m.group(2) != 'total':
            p = os.path.normpath(os.path.join(cwd, m.group(2)))
            if fs.exists(p):
                ok = fs.files[p]['content'].count('\n') == int(m.group(1))
                CHECKS['wc ' + ('ok' if ok else 'bad')] += 1
                if not ok:
                    MISMATCH.setdefault(p, []).append((fs.seq, 'wc', line.strip()))
                else:
                    fs.files[p].setdefault('verified', 0)
                    fs.files[p]['verified'] += 1
            continue
        m = re.match(r"^([\w./@-]+\.[A-Za-z]{1,5}):(\d+):(.*)$", line)
        if m and '…' not in line and len(line) < 3900:
            p = os.path.normpath(os.path.join(cwd, m.group(1)))
            if fs.exists(p):
                lines = fs.files[p]['content'].split('\n')
                n = int(m.group(2))
                theirs = m.group(3).rstrip()
                if re.match(r"^\d+: (ERROR|WARNING|error|warning)", theirs):
                    continue  # esbuild's file:line:col: ERROR, not file content
                ours = lines[n - 1].rstrip() if n <= len(lines) else None
                ok = ours == theirs or (ours is not None and len(theirs) >= 20 and ours.startswith(theirs)
                                        and 'output truncated' in result)
                CHECKS['grep ' + ('ok' if ok else 'bad')] += 1
                if not ok:
                    MISMATCH.setdefault(p, []).append((fs.seq, 'grep', line[:160]))
                    DBG.append((fs.seq, p, n, lines[n-1] if n <= len(lines) else '<EOF>', m.group(3)))
                else:
                    fs.files[p].setdefault('verified', 0)
                    fs.files[p]['verified'] += 1


state = {'cwd': REPO, 'env': {}, 'py': Counter(), 'unsupported': Counter()}
for e in ev:
    fs.seq, fs.msg = e['seq'], e['msg']
    n, i = e['name'], e.get('input') or {}
    if n == 'create_file':
        fs.write(i['path'], i.get('file_text', ''), 'create_file')
    elif n == 'Write':
        fs.write(i['file_path'], i.get('content', ''), 'Write')
    elif n == 'Edit':
        p = i['file_path']
        s = fs.st(p)
        s['msgs'].add(e['msg'])
        old, new = i.get('old_string', ''), i.get('new_string', '')
        if fs.exists(p) and old and old in s['content'] and not e.get('is_error'):
            s['content'] = s['content'].replace(old, new) if i.get('replace_all') else s['content'].replace(old, new, 1)
            s['ops']['Edit'] += 1
        elif not e.get('is_error'):
            s['ops']['Edit-unapplied'] += 1
            s['orphan_edits'].append({'seq': e['seq'], 'old_string': old, 'new_string': new})
            if fs.exists(p):
                fs.flag(p, 'an Edit did not match')
    elif n == 'Bash':
        state['env'] = {}
        for piece in split_heredocs(i.get('command', '')):
            if piece[0] == 'shell':
                do_shell(piece[1], state)
            else:
                do_heredoc(piece[1], piece[2], state, e)
        r = e.get('result') or ''
        verify(r, state['cwd'])
        m = re.search(r"Shell cwd was reset to (\S+)", r)
        if m:
            state['cwd'] = m.group(1)

print('python scripts:', dict(state['py']))
print('checks:', dict(CHECKS))
json.dump(DBG, open(os.path.join(OUT,'..','dbg.json'),'w'), indent=0)
# a mismatch after the file's last full write means our copy went wrong somewhere
for p, ms in MISMATCH.items():
    s = fs.files[p]
    for seq, kind, line in ms:
        if s['written_seq'] is None or seq > s['written_seq']:
            s['uncertain'].append((seq, 'transcript shows different content: ' + line[:100]))
            break
print('unsupported constructs:', state['unsupported'].most_common(15))


def out_path(p):
    if p.startswith(REPO + '/'):
        return os.path.join('repo', os.path.relpath(p, REPO))
    for pre, dst in (('/home/claude/crm-stabilize/', 'early-bundles/crm-stabilize/'),
                     ('/home/claude/crm-import/', 'early-bundles/crm-import/'),
                     ('/mnt/user-data/outputs/', 'delivered/'), ('/mnt/attach/outputs/', 'delivered/')):
        if p.startswith(pre):
            return dst + p[len(pre):]
    return None


manifest = []
for p, s in sorted(fs.files.items()):
    rel = out_path(p)
    if rel is None:
        continue
    if p in fs.deleted:
        status = 'deleted'
    elif s['content'] is None:
        status = 'edits-only'
    elif s['uncertain']:
        status = 'uncertain'
    else:
        status = 'exact'
    manifest.append({'path': rel, 'source': p, 'status': status, 'first_origin': s['origin'],
                     'verified_lines': s.get('verified', 0),
                     'ops': dict(s['ops']), 'uncertain_because': [w for _, w in s['uncertain'][:3]],
                     'uncertain_count': len(s['uncertain']), 'messages': sorted(x for x in s['msgs'] if x is not None)})
    if status == 'deleted':
        continue
    dst = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if s['content'] is not None:
        with open(dst, 'w', encoding='utf-8') as f:
            f.write(s['content'])
    if s['orphan_edits']:
        with open(dst + '.unapplied-edits.json', 'w', encoding='utf-8') as f:
            json.dump(s['orphan_edits'], f, indent=1, ensure_ascii=False)

with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=1, ensure_ascii=False)
print(Counter(r['status'] for r in manifest))
print(Counter((r['path'].split('/')[0], r['status']) for r in manifest))
