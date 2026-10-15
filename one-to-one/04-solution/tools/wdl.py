"""A small interpreter for the parts of the Logic Apps / Power Automate workflow definition language the
ESG 1-to-1 flows use. It exists only to run the generated flows against a fake SharePoint in tests.

It is deliberately strict where the real engine is strict: empty() on a number fails, property access on
null without ?[...] fails, Initialize variable must be top-level, Terminate stops the run.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

TZ = {'GMT Standard Time': ZoneInfo('Europe/London'), 'UTC': timezone.utc}


class ExprError(Exception):
    pass


class ActionFailed(Exception):
    pass


class Terminated(Exception):
    def __init__(self, status, message=''):
        super().__init__(status)
        self.status, self.message = status, message


# --------------------------------------------------------------------------------------------- parsing
TOKEN = re.compile(r"\s*(?:(?P<str>'(?:[^']|'')*')|(?P<num>-?\d+(?:\.\d+)?)|(?P<id>[A-Za-z_][A-Za-z0-9_]*)|(?P<op>\?\[|\?\.|[()\[\],.]))")


def tokenize(s):
    pos, out = 0, []
    while pos < len(s):
        if s[pos:].strip() == '':
            break
        m = TOKEN.match(s, pos)
        if not m:
            raise ExprError('cannot parse at: ' + s[pos:pos + 30])
        pos = m.end()
        kind = m.lastgroup
        val = m.group(kind)
        if kind == 'str':
            val = val[1:-1].replace("''", "'")
        out.append((kind, val))
    return out


class Parser:
    def __init__(self, s):
        self.t, self.i = tokenize(s), 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else (None, None)

    def take(self, val=None):
        tok = self.peek()
        if val is not None and tok[1] != val:
            raise ExprError('expected {0} got {1}'.format(val, tok))
        self.i += 1
        return tok

    def parse(self):
        e = self.expr()
        if self.i != len(self.t):
            raise ExprError('trailing tokens ' + str(self.t[self.i:]))
        return e

    def expr(self):
        kind, val = self.take()
        if kind == 'str':
            node = ('lit', val)
        elif kind == 'num':
            node = ('lit', float(val) if '.' in val else int(val))
        elif kind == 'id':
            if self.peek()[1] == '(':
                self.take('(')
                args = []
                if self.peek()[1] != ')':
                    args.append(self.expr())
                    while self.peek()[1] == ',':
                        self.take(',')
                        args.append(self.expr())
                self.take(')')
                node = ('call', val, args)
            elif val in ('true', 'false', 'null'):
                node = ('lit', {'true': True, 'false': False, 'null': None}[val])
            else:
                raise ExprError('bare identifier ' + val)
        else:
            raise ExprError('unexpected ' + str(val))
        while self.peek()[1] in ('[', '?[', '.', '?.'):
            op = self.take()[1]
            safe = op.startswith('?')
            if op.endswith('['):
                key = self.expr()
                self.take(']')
            else:
                key = ('lit', self.take()[1])
            node = ('idx', node, key, safe)
        return node


# --------------------------------------------------------------------------------------------- values
def to_str(v):
    if v is None:
        return ''
    if isinstance(v, bool):
        return 'True' if v else 'False'
    if isinstance(v, (dict, list)):
        return json.dumps(v, separators=(',', ':'), ensure_ascii=False)
    if isinstance(v, float):
        return repr(v)   # strict: SharePoint Number columns arrive as doubles; 12.0 must not silently become '12'
    return str(v)


def parse_ts(v):
    if isinstance(v, datetime):
        return v
    s = str(v)
    m = re.match(r'^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}:\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$', s)
    if not m:
        raise ExprError('not a timestamp: ' + s)
    dt = datetime.fromisoformat(m.group(1) + 'T' + (m.group(2) or '00:00:00'))
    if m.group(4) == 'Z':
        dt = dt.replace(tzinfo=timezone.utc)
    elif m.group(4):
        dt = datetime.fromisoformat(dt.isoformat() + m.group(4)).astimezone(timezone.utc)
    return dt


def iso(dt):
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
        return dt.strftime('%Y-%m-%dT%H:%M:%S') + '.0000000Z'
    return dt.strftime('%Y-%m-%dT%H:%M:%S') + '.0000000'


def fmt(dt, f):
    out, i = [], 0
    while i < len(f):
        for tok, rep in (('dddd', '%A'), ('yyyy', '%Y'), ('MMMM', '%B'), ('MMM', '%b'), ('MM', '%m'), ('dd', '%d'),
                         ('HH', '%H'), ('mm', '%M'), ('ss', '%S')):
            if f.startswith(tok, i):
                out.append(dt.strftime(rep))
                i += len(tok)
                break
        else:
            if f.startswith('d', i):
                out.append(str(dt.day))
                i += 1
            else:
                out.append(f[i])
                i += 1
    return ''.join(out)


TICK_EPOCH = datetime(1, 1, 1, tzinfo=timezone.utc)


# --------------------------------------------------------------------------------------------- evaluation
class Context:
    def __init__(self, engine, loop_items=None, item=None):
        self.engine, self.loop_items, self.item = engine, loop_items or {}, item

    def with_item(self, it):
        return Context(self.engine, self.loop_items, it)


def evaluate(node, ctx):
    kind = node[0]
    if kind == 'lit':
        return node[1]
    if kind == 'idx':
        base = evaluate(node[1], ctx)
        key = evaluate(node[2], ctx)
        if base is None:
            if node[3]:
                return None
            raise ExprError('property {0} of null'.format(key))
        if isinstance(base, dict):
            if key in base:
                return base[key]
            if '/' in str(key):  # outputs()?['body/value'] style
                cur = base
                for part in str(key).split('/'):
                    cur = cur.get(part) if isinstance(cur, dict) else None
                return cur
            if node[3]:
                return None
            raise ExprError('property {0} missing'.format(key))
        if isinstance(base, list) and isinstance(key, int):
            return base[key] if key < len(base) else (None if node[3] else (_ for _ in ()).throw(ExprError('index')))
        raise ExprError('cannot index {0} with {1}'.format(type(base).__name__, key))
    name, args = node[1], node[2]
    # Conservative: every argument is evaluated, even for if/and/or, so an expression is only accepted if it is
    # safe whether or not the real engine short-circuits.
    vals = [evaluate(a, ctx) for a in args]
    if name == 'if':
        return vals[1] if truthy(vals[0]) else vals[2]
    if name == 'and':
        return all([truthy(v) for v in vals])
    if name == 'or':
        return any([truthy(v) for v in vals])
    if name == 'coalesce':
        return next((v for v in vals if v is not None), None)
    return call(name, vals, ctx)


def truthy(v):
    if not isinstance(v, bool):
        raise ExprError('expected boolean, got {0!r}'.format(v))
    return v


def call(name, a, ctx):
    eng = ctx.engine
    if name in ('outputs', 'body', 'actions'):
        res = eng.result(a[0])
        if name == 'outputs':
            return res.get('outputs')
        if name == 'body':
            out = res.get('outputs')
            return out.get('body') if isinstance(out, dict) and 'body' in out and res.get('kind') == 'api' else out
        return res
    if name == 'items':
        if a[0] not in ctx.loop_items:
            raise ExprError("items('{0}') outside loop".format(a[0]))
        return ctx.loop_items[a[0]]
    if name == 'item':
        return ctx.item
    if name == 'variables':
        if a[0] not in eng.vars:
            raise ExprError('variable ' + a[0])
        return eng.vars[a[0]]
    if name == 'parameters':
        return eng.params[a[0]]
    if name == 'triggerBody':
        return eng.trigger_body
    if name == 'triggerOutputs':
        return {'body': eng.trigger_body}
    if name == 'workflow':
        return {'name': 'flow-id', 'tags': {'environmentName': 'env-id'}, 'run': {'name': 'run-id'}}
    if name == 'utcNow':
        return iso(eng.now)
    if name == 'concat':
        return ''.join(to_str(x) for x in a)
    if name == 'equals':
        x, y = a[0], a[1]
        num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
        if num(x) and num(y):
            return x == y
        return type(x) is type(y) and x == y
    if name == 'not':
        return not truthy(a[0])
    if name == 'empty':
        if a[0] is None:
            return True
        if isinstance(a[0], (str, list, dict)):
            return len(a[0]) == 0
        raise ExprError('empty() expects a string, array or object, got {0!r}'.format(a[0]))
    if name == 'contains':
        if isinstance(a[0], str):
            return to_str(a[1]) in a[0]
        if isinstance(a[0], list):
            return a[1] in a[0]
        if isinstance(a[0], dict):
            return a[1] in a[0]
        raise ExprError('contains() on {0!r}'.format(a[0]))
    if name == 'first':
        if isinstance(a[0], (list, str)):
            return a[0][0] if a[0] else None
        raise ExprError('first() on {0!r}'.format(a[0]))
    if name == 'last':
        if isinstance(a[0], (list, str)):
            return a[0][-1] if a[0] else None
        raise ExprError('last() on {0!r}'.format(a[0]))
    if name == 'take':
        return a[0][:a[1]]
    if name == 'length':
        if isinstance(a[0], (list, str, dict)):
            return len(a[0])
        raise ExprError('length() on {0!r}'.format(a[0]))
    if name == 'string':
        return to_str(a[0])
    if name == 'int':
        try:
            return int(a[0])
        except (TypeError, ValueError):
            raise ExprError("int('{0}') failed".format(a[0]))
    if name == 'json':
        try:
            return json.loads(a[0])
        except (TypeError, ValueError):
            raise ExprError('json() failed')
    if name == 'toLower':
        return to_str(a[0]).lower()
    if name == 'startsWith':
        return to_str(a[0]).startswith(to_str(a[1]))
    if name == 'endsWith':
        return to_str(a[0]).endswith(to_str(a[1]))
    if name == 'substring':
        return to_str(a[0])[a[1]:a[1] + (a[2] if len(a) > 2 else len(to_str(a[0])))]
    if name == 'sub':
        return a[0] - a[1]
    if name == 'add':
        return a[0] + a[1]
    if name == 'max':
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in a):
            raise ExprError('max needs numbers')
        return max(a)
    if name == 'trim':
        return to_str(a[0]).strip()
    if name == 'split':
        return to_str(a[0]).split(a[1])
    if name == 'join':
        return a[1].join(to_str(x) for x in a[0])
    if name == 'createArray':
        return list(a)
    if name in ('greater', 'less'):
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in a):
            raise ExprError(name + ' needs numbers')
        return a[0] > a[1] if name == 'greater' else a[0] < a[1]
    if name == 'ticks':
        dt = parse_ts(a[0])
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int((dt - TICK_EPOCH).total_seconds() * 10 ** 7)
    if name == 'convertFromUtc':
        dt = parse_ts(a[0]).replace(tzinfo=timezone.utc).astimezone(TZ[a[1]]).replace(tzinfo=None)
        return fmt(dt, a[2]) if len(a) > 2 else iso(dt)
    if name == 'convertToUtc':
        dt = parse_ts(a[0]).replace(tzinfo=TZ[a[1]]).astimezone(timezone.utc)
        return iso(dt)
    if name == 'formatDateTime':
        return fmt(parse_ts(a[0]), a[1])
    if name == 'startOfMonth':
        dt = parse_ts(a[0])
        return iso(dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
    if name == 'addDays':
        return iso(parse_ts(a[0]) + timedelta(days=a[1]))
    if name == 'addToTime':
        dt = parse_ts(a[0])
        if a[2] != 'Month':
            raise ExprError('unit ' + a[2])
        m = dt.month - 1 + a[1]
        return iso(dt.replace(year=dt.year + m // 12, month=m % 12 + 1))
    if name == 'dayOfMonth':
        return parse_ts(a[0]).day
    raise ExprError('function not implemented in simulator: ' + name)


def eval_expr(text, ctx):
    return evaluate(Parser(text).parse(), ctx)


def resolve(value, ctx):
    """Evaluate a workflow input value (strings with @ / @{...}, nested dicts and lists)."""
    if isinstance(value, dict):
        return {k: resolve(v, ctx) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(v, ctx) for v in value]
    if not isinstance(value, str):
        return value
    if value.startswith('@@'):
        return value[1:]
    if value.startswith('@') and not value.startswith('@{'):
        return eval_expr(value[1:], ctx)
    if '@{' not in value:
        return value
    from validate import expressions
    out, i = [], 0
    for e in expressions(value):
        j = value.find('@{' + e + '}', i)
        out.append(value[i:j])
        out.append(to_str(eval_expr(e, ctx)))
        i = j + len(e) + 3
    out.append(value[i:])
    return ''.join(out)


# --------------------------------------------------------------------------------------------- engine
class Engine:
    def __init__(self, definition, connectors, params, now, trigger_body=None, var_overrides=None):
        self.defn, self.connectors, self.params = definition, connectors, params
        self.now, self.trigger_body = now, trigger_body
        self.vars, self.results, self.var_overrides, self.var_types = {}, {}, var_overrides or {}, {}
        self.log = []

    def typed(self, name, val):
        t = self.var_types.get(name)
        ok = {'integer': lambda x: isinstance(x, int) and not isinstance(x, bool), 'string': lambda x: isinstance(x, str),
              'array': lambda x: isinstance(x, list), 'boolean': lambda x: isinstance(x, bool), 'object': lambda x: isinstance(x, dict),
              'float': lambda x: isinstance(x, (int, float))}.get(t)
        if ok and val is not None and not ok(val):
            raise ExprError("variable '{0}' of type '{1}' cannot be set to {2!r}".format(name, t, val))
        return val

    def result(self, name):
        if name not in self.results:
            raise ExprError("action '{0}' has not run".format(name))
        return self.results[name]

    def run(self):
        try:
            status = self.run_container(self.defn['actions'], Context(self))
            return 'Failed' if status == 'Failed' else 'Succeeded'
        except Terminated as t:
            return t.status

    def run_container(self, actions, ctx):
        status = {}
        pending = dict(actions)
        while pending:
            progressed = False
            for name, act in list(pending.items()):
                deps = act.get('runAfter') or {}
                if any(d not in status for d in deps):
                    continue
                del pending[name]
                progressed = True
                if all(status[d] in want for d, want in deps.items()):
                    status[name] = self.run_action(name, act, ctx)
                else:
                    status[name] = 'Skipped'
                    self.results[name] = {'status': 'Skipped', 'outputs': None}
            if not progressed:
                raise ExprError('runAfter deadlock in container')
        # Documented Logic Apps rule (error-exception-handling): the container's status comes from its branch ends
        # (actions nothing else runs after). A branch ending in a Skipped action takes that action's predecessor
        # status; if any branch ends in failure, the container is Failed.
        def end_status(n, seen=()):
            st = status[n]
            if st != 'Skipped':
                return st
            preds = list((actions[n].get('runAfter') or {}).keys())
            if not preds or n in seen:
                return 'Succeeded'
            sts = [end_status(p, seen + (n,)) for p in preds]
            return 'Failed' if any(x in ('Failed', 'TimedOut') for x in sts) else 'Succeeded'
        ends = [n for n in actions if not any(n in (a.get('runAfter') or {}) for a in actions.values())]
        if any(end_status(n) in ('Failed', 'TimedOut') for n in ends):
            return 'Failed'
        return 'Succeeded'

    def run_action(self, name, act, ctx):
        t = act['type']
        try:
            if t == 'Scope':
                st = self.run_container(act['actions'], ctx)
                self.results[name] = {'status': st, 'outputs': None}
                return st
            if t == 'If':
                branch = act['actions'] if truthy(eval_expr(act['expression'][1:], ctx)) else act.get('else', {}).get('actions', {})
                st = self.run_container(branch, ctx)
                self.results[name] = {'status': st, 'outputs': None}
                return st
            if t == 'Foreach':
                items = resolve(act['foreach'], ctx)
                if not isinstance(items, list):
                    raise ExprError('foreach over non-array')
                st = 'Succeeded'
                for it in items:
                    sub = Context(self, dict(ctx.loop_items, **{name: it}))
                    if self.run_container(act['actions'], sub) == 'Failed':
                        st = 'Failed'
                self.results[name] = {'status': st, 'outputs': None}
                return st
            if t == 'Terminate':
                raise Terminated(act['inputs']['runStatus'], act['inputs'].get('runError', {}).get('message', ''))
            out, kind = self.simple(name, act, t, ctx), 'plain'
            if t == 'OpenApiConnection':
                kind = 'api'
            self.results[name] = {'status': 'Succeeded', 'outputs': out, 'kind': kind}
            return 'Succeeded'
        except (ExprError, ActionFailed) as e:
            self.log.append('{0} FAILED: {1}'.format(name, e))
            self.results[name] = {'status': 'Failed', 'outputs': {'error': str(e)}, 'kind': 'api'}
            return 'Failed'

    def simple(self, name, act, t, ctx):
        if t == 'Compose':
            return resolve(act['inputs'], ctx)
        if t == 'InitializeVariable':
            for v in act['inputs']['variables']:
                val = self.var_overrides.get(v['name'], resolve(v.get('value'), ctx))
                self.var_types[v['name']] = v['type']
                self.vars[v['name']] = self.typed(v['name'], val)
            return None
        if t == 'SetVariable':
            self.vars[act['inputs']['name']] = self.typed(act['inputs']['name'], resolve(act['inputs']['value'], ctx))
            return None
        if t == 'AppendToArrayVariable':
            self.vars[act['inputs']['name']].append(resolve(act['inputs']['value'], ctx))
            return None
        if t == 'Query':
            src = resolve(act['inputs']['from'], ctx)
            return [x for x in src if truthy(eval_expr(act['inputs']['where'][1:], ctx.with_item(x)))]
        if t == 'Select':
            src = resolve(act['inputs']['from'], ctx)
            return [resolve(act['inputs']['select'], ctx.with_item(x)) for x in src]
        if t == 'OpenApiConnection':
            host = act['inputs']['host']
            params = resolve(act['inputs']['parameters'], ctx)
            return {'statusCode': 200, 'body': self.connectors(host['apiId'].split('/')[-1], host['operationId'], params)}
        raise ExprError('action type not simulated: ' + t)
