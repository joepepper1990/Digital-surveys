"""Static checks for the generated flows – catches the mistakes that would otherwise only show up in the tenant.

Checks, per flow:
  * action names unique; every runAfter points at a sibling in the same container; each container has a start
  * every expression parses (balanced parentheses / quotes / brackets) and uses only known functions
  * outputs()/body()/actions() name an existing action, never one hidden inside a loop the caller is not in
  * items() names an enclosing Apply to each; item() only inside Filter array / Select
  * variables() were initialised at the top level; parameters() are declared
  * SharePoint / Outlook / Users actions carry their required parameters; list titles and column names exist in the schema
  * HTTP request bodies are valid JSON once expressions are substituted; schema text cannot break a JSON body
  * field XML and view CAML are well-formed
"""
import json
import re
import xml.dom.minidom
from schema import LISTS

FUNCS = set('''
actions add addDays addHours addMinutes addSeconds addToTime and array base64 body bool coalesce concat contains convertFromUtc
convertTimeZone convertToUtc createArray dataUri dayOfMonth dayOfWeek dayOfYear decodeBase64 decodeUriComponent div empty endsWith
equals first float formatDateTime formatNumber getFutureTime getPastTime greater greaterOrEquals guid if indexOf int item items
join json last lastIndexOf length less lessOrEquals listCallbackUrl max min mod mul not null or outputs parameters rand range
replace result select setProperty skip split startOfDay startOfHour startOfMonth startsWith string sub substring take ticks toLower
toUpper trigger triggerBody triggerOutputs trim union uriComponent utcNow variables workflow xml xpath
'''.split())
LIST_FIELDS = {l['title']: {'Title', 'ID', 'Id'} | {f['name'] for f in l['fields']} for l in LISTS}
LIST_FIELDS['Technicians'] |= set()
REQUIRED = {
    'GetItems': ['dataset', 'table'], 'PatchItem': ['dataset', 'table', 'id'], 'PostItem': ['dataset', 'table'],
    'HttpRequest': ['dataset', 'parameters/method', 'parameters/uri'], 'GetOnUpdatedItems': ['dataset', 'table'],
    'SendEmailV2': ['emailMessage/To', 'emailMessage/Subject', 'emailMessage/Body'], 'UserProfile_V2': ['id'],
}


def expressions(s):
    """Yield the expressions inside a workflow string value."""
    if not isinstance(s, str):
        return
    if s.startswith('@') and not s.startswith('@@') and not s.startswith('@{'):
        yield s[1:]
        return
    i = 0
    while True:
        j = s.find('@{', i)
        if j < 0:
            return
        k, depth, inq = j + 2, 1, False
        while k < len(s):
            c = s[k]
            if inq:
                if c == "'":
                    if k + 1 < len(s) and s[k + 1] == "'":
                        k += 1
                    else:
                        inq = False
            elif c == "'":
                inq = True
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    break
            k += 1
        yield s[j + 2:k]
        i = k + 1


def parse_check(expr):
    """Return (problems, calls) – calls are (function, first literal arg or None)."""
    probs, calls, stack, inq, i = [], [], [], False, 0
    while i < len(expr):
        c = expr[i]
        if inq:
            if c == "'":
                if i + 1 < len(expr) and expr[i + 1] == "'":
                    i += 1
                else:
                    inq = False
        elif c == "'":
            inq = True
        elif c in '([':
            stack.append(c)
        elif c in ')]':
            if not stack or {')': '(', ']': '['}[c] != stack.pop():
                probs.append('unbalanced brackets')
                break
        i += 1
    if inq:
        probs.append('unterminated quote')
    if stack:
        probs.append('unclosed bracket')
    stripped = re.sub(r"'(?:[^']|'')*'", "''", expr)
    for m in re.finditer(r'([A-Za-z_][A-Za-z0-9_]*)\s*\(', stripped):
        if m.group(1) not in FUNCS:
            probs.append('unknown function ' + m.group(1))
    for m in re.finditer(r"\b(outputs|body|actions|items|variables|parameters|result)\(\s*'((?:[^']|'')*)'\s*\)", expr):
        calls.append((m.group(1), m.group(2).replace("''", "'")))
    for m in re.finditer(r'\b(item|triggerBody|triggerOutputs|utcNow|workflow)\(\s*\)', expr):
        calls.append((m.group(1), None))
    if re.search(r'\?\s*\[', expr) is None and '?.' in expr:
        probs.append('suspicious ?. syntax')
    return probs, calls


class Flow:
    def __init__(self, name, defn):
        self.name, self.defn = name, defn
        self.actions = {}   # name -> (action, container_path list of (owner, kind))
        self.problems = []

    def p(self, msg):
        self.problems.append('[{0}] {1}'.format(self.name, msg))

    def collect(self, container, path):
        names = set(container)
        starts = [n for n, a in container.items() if not a.get('runAfter')]
        if container and not starts:
            self.p('container {0} has no starting action'.format(path[-1][0] if path else 'root'))
        for n, a in container.items():
            if n in self.actions:
                self.p('duplicate action name ' + n)
            self.actions[n] = (a, list(path))
            for dep in (a.get('runAfter') or {}):
                if dep not in names:
                    self.p('{0} runs after {1}, which is not in the same container'.format(n, dep))
            t = a.get('type')
            if t in ('Scope', 'Foreach'):
                self.collect(a.get('actions', {}), path + [(n, t)])
            elif t == 'If':
                self.collect(a.get('actions', {}), path + [(n, 'If')])
                self.collect(a.get('else', {}).get('actions', {}), path + [(n, 'Else')])
        # reachability: everything reachable from the starts
        seen, todo = set(starts), list(starts)
        while todo:
            cur = todo.pop()
            for n, a in container.items():
                if cur in (a.get('runAfter') or {}) and n not in seen:
                    seen.add(n)
                    todo.append(n)
        for n in names - seen:
            self.p('action {0} can never run (runAfter chain broken)'.format(n))

    def loops(self, path):
        return [o for o, k in path if k == 'Foreach']

    def check_strings(self, node, path, where, in_query=False):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ('actions', 'else') and where != 'value':
                    continue
                self.check_strings(v, path, where, in_query or k in ('where', 'select'))
        elif isinstance(node, list):
            for v in node:
                self.check_strings(v, path, where, in_query)
        elif isinstance(node, str):
            for e in expressions(node):
                probs, calls = parse_check(e)
                for pr in probs:
                    self.p('{0}: {1} in "{2}"'.format(where, pr, e[:90]))
                for fn, arg in calls:
                    self.check_ref(fn, arg, path, where, in_query)

    def check_ref(self, fn, arg, path, where, in_query):
        if fn in ('outputs', 'body', 'actions', 'result'):
            if arg not in self.actions:
                self.p('{0}: {1}(\'{2}\') – no such action'.format(where, fn, arg))
                return
            target_loops = self.loops(self.actions[arg][1])
            mine = self.loops(path)
            for lp in target_loops:
                if lp not in mine:
                    self.p("{0}: {1}('{2}') is inside loop {3}, which does not enclose this action".format(where, fn, arg, lp))
        elif fn == 'items':
            if arg not in self.loops(path) and not (where == arg):
                self.p("{0}: items('{1}') used outside that Apply to each".format(where, arg))
        elif fn == 'variables':
            if arg not in self.vars:
                self.p("{0}: variables('{1}') not initialised".format(where, arg))
        elif fn == 'parameters':
            if arg not in self.defn['parameters']:
                self.p("{0}: parameters('{1}') not declared".format(where, arg))
        elif fn == 'item' and not in_query:
            self.p('{0}: item() outside Filter array / Select'.format(where))

    def run(self):
        top = self.defn['actions']
        self.collect(top, [])
        self.vars = set()
        for n, (a, path) in self.actions.items():
            if a.get('type') == 'InitializeVariable':
                if path:
                    self.p('Initialize variable {0} is not at the top level'.format(n))
                for v in a['inputs']['variables']:
                    self.vars.add(v['name'])
        for n, (a, path) in self.actions.items():
            if a.get('type') in ('SetVariable', 'AppendToArrayVariable') and a['inputs']['name'] not in self.vars:
                self.p('{0} sets unknown variable {1}'.format(n, a['inputs']['name']))
            body = {k: v for k, v in a.items() if k not in ('actions', 'else')}
            if a.get('type') == 'Foreach':
                self.check_strings(a['foreach'], path, n)
                body = {k: v for k, v in body.items() if k != 'foreach'}
            self.check_strings(body, path + ([(n, 'Foreach')] if a.get('type') == 'Foreach' else []), n)
            if a.get('type') == 'If':
                self.check_strings(a['expression'], path, n)
            self.check_connector(n, a)
        for tn, t in self.defn['triggers'].items():
            rec = t.get('recurrence') or {}
            if rec.get('timeZone') and not rec.get('startTime'):
                self.p(tn + ': timeZone is ignored unless startTime is set (the schedule would run on UTC)')
            if rec.get('schedule') and rec.get('frequency') not in ('Day', 'Week'):
                self.p(tn + ': schedule hours/minutes only apply to Day or Week frequency')
            self.check_strings(t, [], tn)
            self.check_connector(tn, t)
        return self.problems

    def check_connector(self, n, a):
        if a.get('type') != 'OpenApiConnection':
            return
        op = a['inputs']['host']['operationId']
        params = a['inputs']['parameters']
        for r in REQUIRED.get(op, []):
            if r not in params:
                self.p('{0}: {1} missing required parameter {2}'.format(n, op, r))
        if a['inputs'].get('authentication') != "@parameters('$authentication')":
            self.p(n + ': missing authentication')
        table = params.get('table')
        if op in ('GetItems', 'PatchItem', 'PostItem', 'GetOnUpdatedItems'):
            if table not in LIST_FIELDS:
                self.p('{0}: unknown list {1}'.format(n, table))
                return
            for k in params:
                if k.startswith('item/'):
                    col = k[5:].split('/')[0]
                    if col not in LIST_FIELDS[table]:
                        self.p('{0}: column {1} not in list {2}'.format(n, col, table))
            for k in ('$filter', '$orderby'):
                if k in params:
                    for col in re.findall(r"(?:^|\band\b|\bor\b)\s*([A-Za-z_][A-Za-z0-9_]*)\s+(?:eq|ne|lt|gt|le|ge|asc|desc)",
                                          re.sub(r'@\{[^}]*\}', 'X', params[k])):
                        if col not in LIST_FIELDS[table]:
                            self.p('{0}: {1} uses unknown column {2}'.format(n, k, col))
        if op == 'HttpRequest' and 'parameters/body' in params:
            self.check_json_body(n, params['parameters/body'])

    def check_json_body(self, n, body):
        if body.startswith('@{') and body.endswith('}') and body.count('@{') == 1:
            return  # whole body produced by an expression (string(outputs(...)))
        out, i, inq = [], 0, False
        while i < len(body):
            if body.startswith('@{', i):
                seg = next(expressions(body[i:]))
                out.append('x' if inq else '0')
                i += len(seg) + 3
                continue
            c = body[i]
            if c == '"' and (i == 0 or body[i - 1] != '\\'):
                inq = not inq
            out.append(c)
            i += 1
        try:
            json.loads(''.join(out))
        except ValueError as e:
            self.p('{0}: request body is not valid JSON ({1})'.format(n, e))


def check_schema():
    probs = []
    for l in LISTS:
        texts = [l['title'], l['url'], l['description']]
        for f in l['fields']:
            texts.append(f['xml'])
            try:
                xml.dom.minidom.parseString(f['xml'].encode('utf-8'))
            except Exception as e:  # noqa: BLE001
                probs.append('field XML {0}: {1}'.format(f['name'], e))
        for v in l['views']:
            texts += [v['title'], v['query']] + v['fields']
            try:
                xml.dom.minidom.parseString(('<Query>' + v['query'] + '</Query>').encode('utf-8'))
            except Exception as e:  # noqa: BLE001
                probs.append('view CAML {0}: {1}'.format(v['title'], e))
            for fr in re.findall(r"FieldRef Name='([^']+)'", v['query']) + v['fields']:
                if fr not in {'LinkTitle', 'Title'} | {f['name'] for f in l['fields']}:
                    probs.append('view {0} references unknown column {1}'.format(v['title'], fr))
        for t in texts:
            if '"' in t or '\\' in t:
                probs.append('schema text would break a JSON body: ' + t[:60])
    return probs


def validate_all(flows):
    probs = check_schema()
    for f in flows:
        probs += Flow(f['name'], f['json']['properties']['definition']).run()
        refs = f['json']['properties']['connectionReferences']
        used = set(re.findall(r'"connectionName": "([^"]+)"', json.dumps(f['json'])))
        if used - set(refs):
            probs.append('[{0}] connection(s) used but not referenced: {1}'.format(f['name'], used - set(refs)))
        if set(refs) - used:
            probs.append('[{0}] connection reference(s) declared but unused: {1}'.format(f['name'], set(refs) - used))
    return probs
