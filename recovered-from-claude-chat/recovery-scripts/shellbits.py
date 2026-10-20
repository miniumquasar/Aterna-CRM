"""Quote-aware shell splitting, redirect targets, and a small GNU `sed -i` replayer."""
import re


def split_statements(text):
    """Split on unquoted ; && || | & and newlines (not inside '...' or "...")."""
    out, cur, q, i = [], [], None, 0
    while i < len(text):
        c = text[i]
        if q:
            cur.append(c)
            if c == '\\' and q == '"' and i + 1 < len(text):
                cur.append(text[i + 1])
                i += 1
            elif c == q:
                q = None
        elif c in '\'"':
            q = c
            cur.append(c)
        elif c == '\\' and i + 1 < len(text):
            if text[i + 1] == '\n':
                i += 1  # line continuation
            else:
                cur.append(c)
                cur.append(text[i + 1])
                i += 1
        elif c in ';\n' or (c == '|' ) or (c == '&' and text[i + 1:i + 2] == '&'):
            out.append(''.join(cur))
            cur = []
            if c in '&|' and text[i + 1:i + 2] == c:
                i += 1
        elif c == '&' and text[i + 1:i + 2] != '>' and (i == 0 or text[i - 1] != '>'):
            out.append(''.join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1
    out.append(''.join(cur))
    return [s.strip() for s in out if s.strip()]


REDIRECT = re.compile(r"(?<![0-9&>])(>>?)\s*(?!&)([^\s;&|<>]+)")


def redirect_targets(stmt):
    """Unquoted > / >> targets, ignoring 2>&1, >&2 and /dev/null."""
    unq = re.sub(r"'[^']*'|\"(?:\\.|[^\"\\])*\"", lambda m: ' ' * len(m.group(0)), stmt)
    outs = []
    for m in REDIRECT.finditer(unq):
        tgt = stmt[m.start(2):m.end(2)]
        if tgt != '/dev/null':
            outs.append((m.group(1), tgt))
    return outs


class SedUnsupported(Exception):
    pass


def _bre_to_py(pat, delim):
    out, i = [], 0
    while i < len(pat):
        c = pat[i]
        if c == '\\' and i + 1 < len(pat):
            n = pat[i + 1]
            i += 2
            if n in '(){}+?|':
                out.append(n)
            elif n == delim or n in '/&#':
                out.append(re.escape(n))
            elif n in '.[]*^$\\':
                out.append('\\' + n)
            elif n == 'n':
                out.append('\n')
            elif n == 't':
                out.append('\t')
            elif n in 'bBwWsS<>':
                out.append({'<': r'\b', '>': r'\b'}.get(n, '\\' + n))
            elif n.isdigit():
                out.append('\\' + n)
            else:
                out.append(re.escape(n))
            continue
        if c == '[':
            j = i + 1
            if j < len(pat) and pat[j] == '^':
                j += 1
            if j < len(pat) and pat[j] == ']':
                j += 1
            k = pat.find(']', j)
            if k < 0:
                raise SedUnsupported('bracket')
            body = pat[i + 1:k].replace('\\', '\\\\')
            out.append('[' + body + ']')
            i = k + 1
            continue
        if c in '(){}+?|':
            out.append('\\' + c)
        else:
            out.append(c)
        i += 1
    return ''.join(out)


def _repl(rep, delim):
    parts, i, lit = [], 0, []
    while i < len(rep):
        c = rep[i]
        if c == '\\' and i + 1 < len(rep):
            n = rep[i + 1]
            i += 2
            if n.isdigit():
                parts.append(''.join(lit)); lit = []
                parts.append(int(n))
            elif n == 'n':
                lit.append('\n')
            elif n == 't':
                lit.append('\t')
            else:
                lit.append(n)
            continue
        if c == '&':
            parts.append(''.join(lit)); lit = []
            parts.append(0)
        else:
            lit.append(c)
        i += 1
    parts.append(''.join(lit))

    def f(m):
        return ''.join(m.group(p) or '' if isinstance(p, int) else p for p in parts)
    return f


def sed_apply(script, text):
    """Apply one GNU sed script (s///flags, Na text, Ni text) to text."""
    m = re.match(r"^(\d+)([ai])\s?(.*)$", script, re.S)
    if m:
        n, cmd, add = int(m.group(1)), m.group(2), m.group(3)
        lines = text.split('\n')
        idx = n if cmd == 'a' else n - 1
        if idx > len(lines):
            raise SedUnsupported('line out of range')
        lines.insert(idx, add)
        return '\n'.join(lines)
    if not script.startswith('s') or len(script) < 4:
        raise SedUnsupported('cmd')
    d = script[1]
    fields, cur, i = [], [], 2
    while i < len(script):
        c = script[i]
        if c == '\\' and i + 1 < len(script):
            cur.append(c + script[i + 1])
            i += 2
            continue
        if c == d:
            fields.append(''.join(cur))
            cur = []
            i += 1
            if len(fields) == 2:
                break
            continue
        cur.append(c)
        i += 1
    if len(fields) != 2:
        raise SedUnsupported('s fields')
    flags = script[i:]
    if flags.strip() not in ('', 'g'):
        raise SedUnsupported('flags ' + flags)
    pat = re.compile(_bre_to_py(fields[0], d), re.M)
    rep = _repl(fields[1], d)
    count = 0 if 'g' in flags else 1
    # sed works line by line; with no newline in the pattern, per-line == whole-text with re.M
    if '\n' in fields[0] or '\\n' in fields[0]:
        raise SedUnsupported('multiline pattern')
    lines = text.split('\n')
    return '\n'.join(pat.sub(rep, ln, count=count) for ln in lines)
