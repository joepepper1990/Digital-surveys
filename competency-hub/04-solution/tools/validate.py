"""Static checks for the generated Competency Hub flows – catches the mistakes that would otherwise only show up in the
tenant. (Adapted from the validator written for the ESG 1-to-1 flows, whose import and run-time lessons it keeps.)

Checks, per flow:
  * action names unique; every runAfter points at a sibling in the same container; each container has a start
  * every expression parses (balanced parentheses / quotes / brackets) and uses only known functions
  * outputs()/body()/actions() name an existing action, never one hidden inside a loop the caller is not in
  * items() names an enclosing Apply to each; item() only inside Filter array / Select
  * variables() were initialised at the top level; parameters() are declared
  * SharePoint actions carry their required parameters; the trigger's list exists in the schema
  * REST URIs and request bodies name only columns that exist in the schema (schema.json, shared with Setup)
  * HTTP request bodies are valid JSON once expressions are substituted
  * standard connectors only; no secure inputs/outputs where Power Automate rejects them; nesting and size limits
"""
import json
import re
import xml.dom.minidom
from hub_schema import LISTS, LIST_FIELDS

FUNCS = set('''
actions add addDays addHours addMinutes addSeconds addToTime and array base64 body bool coalesce concat contains convertFromUtc
convertTimeZone convertToUtc createArray dataUri dayOfMonth dayOfWeek dayOfYear decodeBase64 decodeUriComponent div empty endsWith
equals first float formatDateTime formatNumber getFutureTime getPastTime greater greaterOrEquals guid if indexOf int item items
join json last lastIndexOf length less lessOrEquals listCallbackUrl max min mod mul not null or outputs parameters rand range
removeProperty replace result select setProperty skip split startOfDay startOfHour startOfMonth startsWith string sub substring take ticks toLower
toUpper trigger triggerBody triggerOutputs trim union uriComponent uriPath utcNow variables workflow xml xpath
'''.split())
REQUIRED = {
    'HttpRequest': ['dataset', 'parameters/method', 'parameters/uri'], 'GetOnUpdatedItems': ['dataset', 'table'],
    'SendEmailV2': ['emailMessage/To', 'emailMessage/Subject', 'emailMessage/Body'],
    'CreateFile': ['folderPath', 'name', 'body'], 'ConvertFile': ['id', 'type'], 'DeleteFile': ['id'],
}


MAX_EXPRESSION = 8192


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
            for dep, sts in (a.get('runAfter') or {}).items():
                if dep not in names:
                    self.p('{0} runs after {1}, which is not in the same container'.format(n, dep))
            ra = a.get('runAfter') or {}
            # An upstream failure skips every predecessor. If ALL predecessors may be Skipped, this action would still
            # run and hide that failure – except a join() after a Log_/Warn_ pair, one of which always runs.
            if ra and all('Skipped' in v for v in ra.values()) and \
                    not all(d.startswith(('Log_', 'Warn_', 'Is_')) for d in ra):
                self.p('{0} runs even when all its predecessors were skipped – an upstream failure would be hidden'.format(n))
            t = a.get('type')
            if t in ('Scope', 'Foreach'):
                self.collect(a.get('actions', {}), path + [(n, t)])
            elif t == 'If':
                self.collect(a.get('actions', {}), path + [(n, 'If')])
                self.collect(a.get('else', {}).get('actions', {}), path + [(n, 'Else')])
            elif t == 'Switch':
                for case in (a.get('cases') or {}).values():
                    self.collect(case.get('actions', {}), path + [(n, 'Case')])
                self.collect((a.get('default') or {}).get('actions', {}), path + [(n, 'Default')])
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
            # Power Automate refuses to save a flow with an expression longer than 8,192 characters
            if len(node) > MAX_EXPRESSION and any(True for _ in expressions(node)):
                self.p('{0}: expression is {1} characters, over the {2} Power Automate allows'.format(where, len(node), MAX_EXPRESSION))
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
            if a.get('type') in ('SetVariable', 'AppendToArrayVariable', 'AppendToStringVariable') and \
                    "variables('{0}')".format(a['inputs']['name']) in json.dumps(a['inputs'].get('value'), ensure_ascii=False):
                self.p("{0}: Self reference is not supported when updating the value of variable '{1}'".format(n, a['inputs']['name']))
            body = {k: v for k, v in a.items() if k not in ('actions', 'else', 'cases', 'default')}
            if a.get('type') == 'Foreach':
                self.check_strings(a['foreach'], path, n)
                body = {k: v for k, v in body.items() if k != 'foreach'}
            self.check_strings(body, path + ([(n, 'Foreach')] if a.get('type') == 'Foreach' else []), n)
            if a.get('type') in ('If', 'Switch'):
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
        tz = params.get('item/timeZone')
        if op in ('V4CalendarPostItem', 'V4CalendarPatchItem') and isinstance(tz, str) and not tz.startswith('@') and not tz.startswith('(UTC'):
            self.p("{0}: The API operation '{1}' requires the property 'item/timeZone' to be set to one of its defined enum values "
                   "(e.g. '(UTC+00:00) Dublin, Edinburgh, Lisbon, London') but is set to '{2}'".format(n, op, tz))
        if op in ('GetItems', 'PatchItem', 'PostItem'):
            self.p('{0}: {1} – write and read lists by REST (1-to-1 lessons 1.3.0.2 and 1.5.0.1)'.format(n, op))
        if op == 'GetOnUpdatedItems':
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


def check_secure(f):
    """Run history: the trigger is secured, so a request's text is not shown on the run list. The steps themselves stay
    readable, because the run history is how a failed request is diagnosed (only the flow's owner can open it)."""
    probs, defn = [], f['json']['properties']['definition']
    def secured(a):
        return set((a.get('runtimeConfiguration') or {}).get('secureData', {}).get('properties', [])) >= {'inputs', 'outputs'}
    for n, t in defn['triggers'].items():
        if t.get('type') == 'OpenApiConnection' and not secured(t):
            probs.append('[{0}] trigger {1} is not secured'.format(f['name'], n))
    return probs


def secured_inputs(a):
    return 'inputs' in (a.get('runtimeConfiguration') or {}).get('secureData', {}).get('properties', [])


STANDARD_APIS = {'shared_sharepointonline', 'shared_office365', 'shared_onedriveforbusiness'}
# Secure inputs/outputs aren't available on these (a secureData setting on Set variable stopped Flow 1 importing: 1.3.0.1)
NO_SECURE_TYPES = {'SetVariable', 'InitializeVariable', 'AppendToArrayVariable', 'AppendToStringVariable', 'IncrementVariable',
                   'DecrementVariable', 'If', 'Foreach', 'Scope', 'Terminate', 'Switch', 'Until'}


def check_platform(f):
    """Standard connectors only, and no secureData where Power Automate doesn't support it."""
    probs = []
    def walk(o, name):
        if isinstance(o, dict):
            if o.get('type') in NO_SECURE_TYPES and 'secureData' in json.dumps(o.get('runtimeConfiguration') or {}):
                probs.append('[{0}] {1}: secure inputs/outputs are not supported on a {2} action'.format(f['name'], name, o['type']))
            api = ((o.get('inputs') or {}).get('host') or {}).get('connectionName') if o.get('type') in ('OpenApiConnection', 'OpenApiConnectionWebhook') else None
            if api is not None and api not in STANDARD_APIS:
                probs.append('[{0}] {1} uses {2}, which is not one of the standard connectors this solution allows'.format(f['name'], name, api))
            if o.get('type') in ('Http', 'HttpWebhook', 'ApiConnection'):
                probs.append('[{0}] {1} is a {2} action – premium or not allowed; use the SharePoint connector'.format(f['name'], name, o['type']))
            for k, v in o.items():
                walk(v, k if isinstance(v, dict) and 'type' in v else name)
        elif isinstance(o, list):
            for v in o:
                walk(v, name)
    walk(f['json']['properties']['definition'], 'definition')
    return probs


def check_array_outputs(f):
    """outputs() of a Filter array, Select or Join step is an object; a step that needs the list must use body()."""
    kinds = {}
    def walk(actions):
        for n, a in (actions or {}).items():
            kinds[n] = a.get('type')
            walk(a.get('actions'))
            walk((a.get('else') or {}).get('actions'))
            for c in (a.get('cases') or {}).values():
                walk(c.get('actions'))
            walk((a.get('default') or {}).get('actions'))
    walk(f['json']['properties']['definition'].get('actions'))
    text = json.dumps(f['json']['properties']['definition'])
    bad = sorted({n for n in re.findall(r"outputs\('([^']+)'\)", text) if kinds.get(n) in ('Query', 'Select', 'Join')})
    return ['[{0}] outputs(\'{1}\') is an object, not a list ("The \'from\' property value ... is of type \'Object\'"); use body(\'{1}\')'
            .format(f['name'], n) for n in bad]


MAX_NESTING = 8      # Power Automate: an action may be nested at most 8 levels deep (top-level actions are level 0)
MAX_ACTIONS = 500    # Power Automate: actions per workflow


def nesting_levels(definition):
    """Every action with its nesting level as Power Automate counts it (top level 0; each Scope / Foreach / Until body,
    If branch – then or else – and Switch case or default adds one), and the path to it."""
    out = []

    def walk(actions, level, path):
        for name, a in (actions or {}).items():
            out.append((level, name, path))
            t = a.get('type')
            if t in ('Scope', 'Foreach', 'Until'):
                walk(a.get('actions'), level + 1, path + [name])
            elif t == 'If':
                walk(a.get('actions'), level + 1, path + [name])
                walk((a.get('else') or {}).get('actions'), level + 1, path + [name + ' (else)'])
            elif t == 'Switch':
                for case, body in (a.get('cases') or {}).items():
                    walk(body.get('actions'), level + 1, path + [name + ' / ' + case])
                walk((a.get('default') or {}).get('actions'), level + 1, path + [name + ' (default)'])
    walk(definition.get('actions'), 0, [])
    return out


def check_nesting(name, definition, limit=MAX_NESTING):
    """Power Automate refuses to save or turn on a flow with an action nested deeper than 8 levels
    (TemplateValidationError), or with more than 500 actions."""
    probs, levels = [], nesting_levels(definition)
    for level, action, path in levels:
        if level > limit:
            probs.append('[{0}] {1} is nested at level {2} (Power Automate allows {3}): {4}'.format(name, action, level, limit, ' > '.join(path)))
    if len(levels) > MAX_ACTIONS:
        probs.append('[{0}] {1} actions – Power Automate allows {2} per flow'.format(name, len(levels), MAX_ACTIONS))
    return probs


def max_nesting(definition):
    return max((lv for lv, _, _ in nesting_levels(definition)), default=0)


def validate_all(flows, raw=None):
    """All checks. The checks that look for particular steps by name (email text, list addresses) run on `raw`, the
    same flows with their short names, when given."""
    probs = []
    for f in raw or []:
        probs += check_rest_columns(f)
        probs += check_email_escaping(f)
    for f in flows:
        names = []

        def walk(actions):
            for n, a in actions.items():
                names.append(n)
                for k in ('actions',):
                    if k in a:
                        walk(a[k])
                if a.get('else'):
                    walk(a['else']['actions'])
                for c in (a.get('cases') or {}).values():
                    walk(c['actions'])
                if a.get('default'):
                    walk(a['default']['actions'])
        walk(f['json']['properties']['definition']['actions'])
        bad = [n for n in names if len(n) > 80 or not re.match(r'^[A-Za-z0-9_()]+$', n)]
        if bad:
            probs.append('[{0}] step names Power Automate would not accept: {1}'.format(f['name'], bad[:5]))
        if len(names) != len(set(names)):
            probs.append('[{0}] step names used twice: {1}'.format(f['name'], sorted({n for n in names if names.count(n) > 1})[:5]))
    for f in flows:
        probs += Flow(f['name'], f['json']['properties']['definition']).run()
        probs += check_secure(f)
        if raw is None:
            probs += check_rest_columns(f)
            probs += check_email_escaping(f)
        probs += check_platform(f)
        probs += check_array_outputs(f)
        probs += check_nesting(f['name'], f['json']['properties']['definition'])
        refs = f['json']['properties']['connectionReferences']
        used = set(re.findall(r'"connectionName": "([^"]+)"', json.dumps(f['json'])))
        if used - set(refs):
            probs.append('[{0}] connection(s) used but not referenced: {1}'.format(f['name'], used - set(refs)))
        if set(refs) - used:
            probs.append('[{0}] connection reference(s) declared but unused: {1}'.format(f['name'], set(refs) - used))
    return probs


TYPED = ("['title']", "['area']", "['actor']", "['note']")


def check_email_escaping(f):
    """An email body (a Compose named Html...) may show what people typed only through the HTML escaping chain."""
    probs = []

    def walk(actions):
        for n, a in actions.items():
            if a.get('type') == 'Compose' and n.startswith('Html') and isinstance(a.get('inputs'), str):
                for e in expressions(a['inputs']):
                    if any(t in e for t in TYPED) and "'&amp;'" not in e:
                        probs.append('[{0}] {1}: a typed value is not HTML-escaped: {2}'.format(f['name'], n, e[:80]))
            for k in ('actions',):
                if k in a:
                    walk(a[k])
            if 'else' in a:
                walk(a['else']['actions'])
            for c in (a.get('cases') or {}).values():
                walk(c['actions'])
            if a.get('default'):
                walk(a['default']['actions'])
    walk(f['json']['properties']['definition']['actions'])
    return probs


def check_rest_columns(f):
    """Every column a REST call selects, filters on or writes must exist in the list the call names (by its URL key,
    e.g. GetList('@{outputs('Ids')?['act']}')). Catches a misspelt column before the tenant does."""
    from flows import LIST_KEYS
    probs = []

    def walk(o, name):
        if isinstance(o, dict):
            if o.get('type') == 'OpenApiConnection' and o['inputs']['host']['operationId'] == 'HttpRequest':
                p = o['inputs']['parameters']
                uri = p['parameters/uri']
                m = re.search(r"GetList\('@\{outputs\('Ids'\)\?\['(\w+)'\]\}'\)", uri)
                if m and m.group(1) in LIST_KEYS:
                    fields = LIST_FIELDS[LIST_KEYS[m.group(1)]]
                    qs = re.sub(r'@\{[^}]*\}', 'X', uri).partition('?')[2]   # expressions hold ?[...] too
                    cols = []
                    for part in qs.split('&'):
                        k, _, v = part.partition('=')
                        v = re.sub(r'@\{[^}]*\}', 'X', v)
                        if k == '$select':
                            cols += [c.split('/')[0] for c in v.split(',')]
                        elif k == '$filter':
                            cols += re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s+(?:eq|ne|lt|gt|le|ge)\b", v)
                    for c in cols:
                        if c and c not in fields:
                            probs.append('[{0}] {1}: column {2} is not in {3}'.format(f['name'], name, c, LIST_KEYS[m.group(1)]))
            for k, v in o.items():
                walk(v, k if isinstance(v, dict) and 'type' in v else name)
        elif isinstance(o, list):
            for v in o:
                walk(v, name)
    walk(f['json']['properties']['definition'], 'definition')
    return probs
