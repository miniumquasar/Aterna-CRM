"""A tiny, side-effect-free interpreter for the one-off Python edit scripts in the
transcript. It understands string/list/dict operations, re, json and file
read/write -- the file I/O goes to an in-memory map, never to disk. Anything
it does not understand raises Unsupported, so the caller can mark the files
involved as uncertain rather than guessing.
"""
import ast
import json
import os
import re


class Unsupported(Exception):
    pass


class Abort(Exception):
    """The script stopped (assert, raise, SystemExit) -- as it would have for real."""


class _Unknown:
    """The content of a file the transcript never showed, and anything computed from it."""
    def __repr__(self):
        return '<unknown>'

    def __bool__(self):
        raise Unsupported('truth of unknown')

    def __iter__(self):
        raise Unsupported('iterate unknown')


UNKNOWN = _Unknown()


def _unk(*vals):
    return any(v is UNKNOWN for v in vals)


def _ends_in_raise(body):
    return bool(body) and isinstance(body[-1], ast.Raise) and all(
        isinstance(b, (ast.Raise, ast.Expr)) for b in body)


class _Return(Exception):
    def __init__(self, value):
        self.value = value


class _Break(Exception):
    pass


class _Continue(Exception):
    pass


class FileHandle:
    def __init__(self, fs, path, mode):
        self.fs, self.path, self.mode = fs, path, mode
        if 'w' in mode:
            self.buf = ''
        elif 'a' in mode:
            self.buf = fs.read(path)
        else:
            self.buf = None

    def read(self):
        return self.fs.read(self.path)

    def readlines(self):
        return self.fs.read(self.path).splitlines(True)

    def write(self, text):
        if not isinstance(text, str):
            raise Unsupported('non-str write')
        self.buf += text
        self.fs.write(self.path, self.buf)
        return len(text)

    def close(self):
        pass


class PathObj:
    def __init__(self, fs, path):
        self.fs, self.path = fs, path

    def read_text(self, encoding=None):
        return self.fs.read(self.path)

    def write_text(self, text, encoding=None):
        self.fs.write(self.path, text)
        return len(text)

    def exists(self):
        return self.fs.exists(self.path)

    def __truediv__(self, other):
        return PathObj(self.fs, os.path.join(self.path, str(other)))

    def __str__(self):
        return self.path


class Func:
    def __init__(self, node, interp):
        self.node, self.interp = node, interp


SAFE_STR_METHODS = {
    'replace', 'count', 'index', 'find', 'rfind', 'rindex', 'startswith', 'endswith', 'split',
    'rsplit', 'splitlines', 'join', 'strip', 'rstrip', 'lstrip', 'upper', 'lower', 'format',
    'partition', 'rpartition', 'isdigit', 'isspace', 'title', 'zfill', 'removeprefix', 'removesuffix',
}
SAFE_LIST_METHODS = {'append', 'extend', 'insert', 'index', 'remove', 'pop', 'count', 'sort', 'reverse'}
SAFE_DICT_METHODS = {'items', 'keys', 'values', 'get', 'pop', 'setdefault', 'update'}


class Interp:
    def __init__(self, fs, cwd):
        self.fs, self.cwd = fs, cwd
        self.glob = {}
        self.touched = set()

    # -- paths -----------------------------------------------------------
    def abspath(self, p):
        if isinstance(p, PathObj):
            p = p.path
        if not isinstance(p, str):
            raise Unsupported('path type')
        p = os.path.normpath(p if p.startswith('/') else os.path.join(self.cwd, p))
        self.touched.add(p)
        return p

    # -- statements ------------------------------------------------------
    def run(self, src):
        tree = ast.parse(src)
        self.block(tree.body, self.glob, None)

    def block(self, body, scope, fn_globals):
        for st in body:
            self.stmt(st, scope, fn_globals)

    def stmt(self, st, scope, gl):
        t = type(st)
        if t in (ast.Import, ast.ImportFrom, ast.Pass):
            return
        if t is ast.Global:
            gl.update(st.names) if gl is not None else None
            return
        if t is ast.FunctionDef:
            scope[st.name] = Func(st, self)
            return
        if t is ast.Expr:
            self.expr(st.value, scope, gl)
            return
        if t is ast.Assign:
            v = self.expr(st.value, scope, gl)
            for tg in st.targets:
                self.assign(tg, v, scope, gl)
            return
        if t is ast.AnnAssign and st.value is not None:
            self.assign(st.target, self.expr(st.value, scope, gl), scope, gl)
            return
        if t is ast.AugAssign:
            cur = self.expr(_load(st.target), scope, gl)
            self.assign(st.target, self.binop(st.op, cur, self.expr(st.value, scope, gl)), scope, gl)
            return
        if t is ast.If:
            test = self.expr(st.test, scope, gl)
            if test is UNKNOWN:
                # The real run succeeded, so it took the branch that doesn't stop the script.
                if _ends_in_raise(st.body):
                    self.block(st.orelse, scope, gl)
                elif _ends_in_raise(st.orelse):
                    self.block(st.body, scope, gl)
                else:
                    raise Unsupported('if on unknown')
                return
            self.block(st.body if test else st.orelse, scope, gl)
            return
        if t is ast.For:
            it = self.expr(st.iter, scope, gl)
            for item in list(it):
                self.assign(st.target, item, scope, gl)
                try:
                    self.block(st.body, scope, gl)
                except _Break:
                    break
                except _Continue:
                    continue
            else:
                self.block(st.orelse, scope, gl)
            return
        if t is ast.Break:
            raise _Break()
        if t is ast.Continue:
            raise _Continue()
        if t is ast.Assert:
            test = self.expr(st.test, scope, gl)
            if test is UNKNOWN:
                return
            if not test:
                raise Abort('assert')
            return
        if t is ast.Raise:
            raise Abort('raise')
        if t is ast.Return:
            raise _Return(self.expr(st.value, scope, gl) if st.value else None)
        if t is ast.Delete:
            for tg in st.targets:
                if isinstance(tg, ast.Subscript):
                    obj = self.expr(tg.value, scope, gl)
                    del obj[self.expr(tg.slice, scope, gl)]
                else:
                    raise Unsupported('del')
            return
        if t is ast.With:
            for item in st.items:
                v = self.expr(item.context_expr, scope, gl)
                if item.optional_vars is not None:
                    self.assign(item.optional_vars, v, scope, gl)
            self.block(st.body, scope, gl)
            return
        raise Unsupported(t.__name__)

    def assign(self, tg, v, scope, gl):
        if isinstance(tg, ast.Name):
            if gl is not None and tg.id in gl:
                self.glob[tg.id] = v
            else:
                scope[tg.id] = v
        elif isinstance(tg, (ast.Tuple, ast.List)):
            vals = list(v)
            if len(vals) != len(tg.elts):
                raise Abort('unpack')
            for a, b in zip(tg.elts, vals):
                self.assign(a, b, scope, gl)
        elif isinstance(tg, ast.Subscript):
            obj = self.expr(tg.value, scope, gl)
            if not isinstance(obj, (dict, list)):
                raise Unsupported('subscript assign')
            obj[self.expr(tg.slice, scope, gl)] = v
        else:
            raise Unsupported('assign target')

    # -- expressions -----------------------------------------------------
    def lookup(self, name, scope):
        if name in scope:
            return scope[name]
        if name in self.glob:
            return self.glob[name]
        builtins = {'True': True, 'False': False, 'None': None, 'len': len, 'str': str, 'int': int,
                    'list': list, 'tuple': tuple, 'dict': dict, 'set': set, 'sorted': sorted, 'range': range,
                    'enumerate': enumerate, 'zip': zip, 'min': min, 'max': max, 'any': any, 'all': all,
                    'reversed': reversed, 'repr': repr, 'isinstance': isinstance, 'bool': bool, 'sum': sum,
                    'print': lambda *a, **k: None, 'SystemExit': SystemExit, 'Exception': Exception,
                    'ValueError': ValueError, 'AssertionError': AssertionError, 'abs': abs}
        if name in builtins:
            return builtins[name]
        if name == 'open':
            return lambda p, mode='r', encoding=None, newline=None: FileHandle(self.fs, self.abspath(p), mode)
        if name in ('re', 'json', 'os', 'pathlib', 'collections', 'sys', 'Path', 'io', 'textwrap'):
            return ('module', name)
        raise Unsupported('name ' + name)

    def expr(self, e, scope, gl):
        t = type(e)
        if t is ast.Constant:
            return e.value
        if t is ast.Name:
            return self.lookup(e.id, scope)
        if t is ast.JoinedStr:
            out = []
            for v in e.values:
                if isinstance(v, ast.Constant):
                    out.append(v.value)
                else:
                    x = self.expr(v.value, scope, gl)
                    if x is UNKNOWN:
                        return UNKNOWN
                    if v.conversion == ord('r'):
                        x = repr(x)
                    spec = self.expr(v.format_spec, scope, gl) if v.format_spec else ''
                    out.append(format(x, spec))
            return ''.join(out)
        if t is ast.BinOp:
            a, b = self.expr(e.left, scope, gl), self.expr(e.right, scope, gl)
            return UNKNOWN if _unk(a, b) else self.binop(e.op, a, b)
        if t is ast.UnaryOp:
            v = self.expr(e.operand, scope, gl)
            if v is UNKNOWN:
                return UNKNOWN
            if isinstance(e.op, ast.Not):
                return not v
            if isinstance(e.op, ast.USub):
                return -v
            raise Unsupported('unary')
        if t is ast.BoolOp:
            if isinstance(e.op, ast.And):
                v = True
                for x in e.values:
                    v = self.expr(x, scope, gl)
                    if v is UNKNOWN:
                        return UNKNOWN
                    if not v:
                        return v
                return v
            v = False
            for x in e.values:
                v = self.expr(x, scope, gl)
                if v is UNKNOWN:
                    return UNKNOWN
                if v:
                    return v
            return v
        if t is ast.Compare:
            left = self.expr(e.left, scope, gl)
            for op, c in zip(e.ops, e.comparators):
                right = self.expr(c, scope, gl)
                if _unk(left, right):
                    return UNKNOWN
                ok = {ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b, ast.Lt: lambda a, b: a < b,
                      ast.LtE: lambda a, b: a <= b, ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
                      ast.In: lambda a, b: a in b, ast.NotIn: lambda a, b: a not in b,
                      ast.Is: lambda a, b: a is b, ast.IsNot: lambda a, b: a is not b}[type(op)](left, right)
                if not ok:
                    return False
                left = right
            return True
        if t is ast.IfExp:
            test = self.expr(e.test, scope, gl)
            if test is UNKNOWN:
                return UNKNOWN
            return self.expr(e.body if test else e.orelse, scope, gl)
        if t in (ast.List, ast.Tuple, ast.Set):
            vals = []
            for x in e.elts:
                if isinstance(x, ast.Starred):
                    vals.extend(self.expr(x.value, scope, gl))
                else:
                    vals.append(self.expr(x, scope, gl))
            return {ast.List: list, ast.Tuple: tuple, ast.Set: set}[t](vals)
        if t is ast.Dict:
            return {self.expr(k, scope, gl): self.expr(v, scope, gl) for k, v in zip(e.keys, e.values)}
        if t is ast.Subscript:
            obj = self.expr(e.value, scope, gl)
            key = self.expr(e.slice, scope, gl)
            if _unk(obj, key) or (isinstance(key, slice) and _unk(key.start, key.stop, key.step)):
                return UNKNOWN
            return obj[key]
        if t is ast.Slice:
            f = lambda x: None if x is None else self.expr(x, scope, gl)
            return slice(f(e.lower), f(e.upper), f(e.step))
        if t in (ast.ListComp, ast.GeneratorExp):
            return self.comp(e, scope, gl)
        if t is ast.Attribute:
            base = self.expr(e.value, scope, gl)
            if base is UNKNOWN:
                return UNKNOWN
            if isinstance(base, tuple) and base and base[0] == 'module':
                return ('module', base[1] + '.' + e.attr)
            return ('method', base, e.attr)
        if t is ast.Call:
            return self.call(e, scope, gl)
        raise Unsupported(t.__name__)

    def comp(self, e, scope, gl):
        if len(e.generators) != 1:
            raise Unsupported('nested comp')
        g = e.generators[0]
        out = []
        local = dict(scope)
        for item in list(self.expr(g.iter, scope, gl)):
            self.assign(g.target, item, local, None)
            if all(self.expr(c, local, gl) for c in g.ifs):
                out.append(self.expr(e.elt, local, gl))
        return out

    def binop(self, op, a, b):
        if isinstance(op, ast.Add):
            return a + b
        if isinstance(op, ast.Sub):
            return a - b
        if isinstance(op, ast.Mult):
            return a * b
        if isinstance(op, ast.Mod) and isinstance(a, str):
            return a % b
        if isinstance(op, ast.FloorDiv):
            return a // b
        if isinstance(op, ast.Div) and isinstance(a, PathObj):
            return a / b
        raise Unsupported('binop')

    def call(self, e, scope, gl):
        fn = self.expr(e.func, scope, gl)
        args = []
        for a in e.args:
            if isinstance(a, ast.Starred):
                args.extend(self.expr(a.value, scope, gl))
            else:
                args.append(self.expr(a, scope, gl))
        kw = {k.arg: self.expr(k.value, scope, gl) for k in e.keywords if k.arg}
        if fn is UNKNOWN:
            return UNKNOWN
        if isinstance(fn, Func):
            return self.call_func(fn, args, kw)
        if isinstance(fn, tuple) and fn[0] == 'module':
            return self.module_call(fn[1], args, kw)
        if isinstance(fn, tuple) and fn[0] == 'method':
            return self.method_call(fn[1], fn[2], args, kw)
        if fn is SystemExit or fn in (Exception, ValueError, AssertionError):
            return Abort('exc')
        if callable(fn):
            if _unk(*args, *kw.values()):
                return UNKNOWN
            return fn(*args, **kw)
        raise Unsupported('call')

    def call_func(self, fn, args, kw):
        node = fn.node
        a = node.args
        if a.vararg or a.kwarg or a.kwonlyargs:
            raise Unsupported('fn signature')
        names = [x.arg for x in a.args]
        defaults = [self.expr(d, self.glob, None) for d in a.defaults]
        local = {}
        for i, n in enumerate(names):
            if i < len(args):
                local[n] = args[i]
            elif n in kw:
                local[n] = kw[n]
            else:
                j = i - (len(names) - len(defaults))
                if j < 0:
                    raise Unsupported('missing arg')
                local[n] = defaults[j]
        gl = set()
        try:
            self.block(node.body, local, gl)
        except _Return as r:
            return r.value
        return None

    def module_call(self, name, args, kw):
        if _unk(*args, *kw.values()) and name not in ('pathlib.Path', 'Path'):
            return UNKNOWN
        if name == 're.sub':
            return re.sub(*args, **kw)
        if name == 're.subn':
            return re.subn(*args, **kw)
        if name in ('re.search', 're.match', 're.findall', 're.finditer', 're.escape', 're.split',
                    're.fullmatch'):
            return getattr(re, name[3:])(*args, **kw)
        if name == 're.compile':
            return re.compile(*args)
        if name in ('json.loads', 'json.dumps'):
            kw.pop('object_pairs_hook', None)
            return getattr(json, name[5:])(*args, **kw)
        if name in ('os.path.join', 'os.path.basename', 'os.path.dirname', 'os.path.splitext'):
            return getattr(os.path, name[8:])(*args)
        if name == 'os.path.exists':
            return self.fs.exists(self.abspath(args[0]))
        if name in ('pathlib.Path', 'Path'):
            return PathObj(self.fs, self.abspath(args[0]))
        if name in ('collections.OrderedDict',):
            return dict(*args)
        if name in ('sys.exit',):
            raise Abort('sys.exit')
        if name in ('textwrap.dedent',):
            import textwrap
            return textwrap.dedent(*args)
        raise Unsupported('module ' + name)

    def method_call(self, obj, attr, args, kw):
        if isinstance(obj, (FileHandle, PathObj)) and attr in ('write', 'write_text') and _unk(*args):
            self.fs.write(obj.path, UNKNOWN)
            return UNKNOWN
        if _unk(*args, *kw.values()):
            if isinstance(obj, (list, dict)) and attr in ('append', 'insert', 'extend', 'update', 'setdefault'):
                raise Unsupported('unknown into container')
            return UNKNOWN
        if isinstance(obj, str):
            if attr not in SAFE_STR_METHODS:
                raise Unsupported('str.' + attr)
            return getattr(obj, attr)(*args, **kw)
        if isinstance(obj, list):
            if attr not in SAFE_LIST_METHODS:
                raise Unsupported('list.' + attr)
            return getattr(obj, attr)(*args, **kw)
        if isinstance(obj, dict):
            if attr not in SAFE_DICT_METHODS:
                raise Unsupported('dict.' + attr)
            return getattr(obj, attr)(*args, **kw)
        if isinstance(obj, (FileHandle, PathObj)):
            if attr in ('read', 'write', 'readlines', 'close', 'read_text', 'write_text', 'exists'):
                return getattr(obj, attr)(*args, **kw)
        if isinstance(obj, re.Pattern) and attr in ('sub', 'subn', 'search', 'match', 'findall', 'finditer'):
            return getattr(obj, attr)(*args, **kw)
        if isinstance(obj, re.Match) and attr in ('group', 'start', 'end', 'span', 'groups'):
            return getattr(obj, attr)(*args, **kw)
        raise Unsupported('method ' + type(obj).__name__ + '.' + attr)


def _load(target):
    if isinstance(target, ast.Name):
        return ast.Name(id=target.id, ctx=ast.Load())
    if isinstance(target, ast.Subscript):
        return ast.Subscript(value=target.value, slice=target.slice, ctx=ast.Load())
    raise Unsupported('augassign target')
