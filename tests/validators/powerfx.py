"""A small three-valued evaluator for the Power Fx subset used in this app.

Static geometry checks were not enough for 1.1.0.5 because the interesting
formulas are conditional:

    Visible: =varView="InstrumentEdit" && varDraftPairRequired
    X:       =If(varView="Map", 60, 320)

Reducing those to a single number is impossible; refusing to look at them at
all is how a full-screen panel covering a form got shipped. So this module
evaluates an expression under an *assignment* of variables and returns one of
three answers: a value, `FALSE`, or `UNKNOWN`.

`UNKNOWN` is the important one. Anything reaching into a collection
(`LookUp`, `CountRows`, `Filter`) is not decidable without runtime data and
must never be guessed. Three-valued logic then keeps the useful cases:

    false && UNKNOWN  ->  false      (definitely hidden)
    true  || UNKNOWN  ->  true       (definitely shown)
    true  && UNKNOWN  ->  UNKNOWN    (may be shown — report as a maybe)

Callers distinguish "definitely" from "maybe" and report accordingly, so a
finding is never asserted on an expression this module could not resolve.
"""
from __future__ import annotations

import re
from typing import Any


class _Unknown:
    """Not decidable statically. Never equal to anything, including itself."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __repr__(self) -> str:
        return "UNKNOWN"

    def __bool__(self) -> bool:                      # pragma: no cover
        raise TypeError("UNKNOWN has no truth value; use is_true/is_false")


UNKNOWN = _Unknown()

# Functions whose result depends on runtime collection data.
_OPAQUE_FUNCTIONS = {
    "lookup", "countrows", "filter", "first", "last", "sort", "sortbycolumns",
    "search", "distinct", "addcolumns", "groupby", "sum", "average", "max",
    "min", "concat", "user", "now", "today", "guid", "rand", "datevalue",
    "iferror", "self", "parent", "thisitem",
}

_TOKEN = re.compile(
    r"""
      (?P<ws>\s+)
    | (?P<number>\d+(?:\.\d+)?)
    | (?P<string>"(?:[^"]|"")*")
    | (?P<op><>|<=|>=|&&|\|\||[-+*/&<>=!(),.;:\[\]{}])
    | (?P<ident>[A-Za-z_][A-Za-z0-9_]*)
    """,
    re.VERBOSE,
)


def tokenize(text: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    pos = 0
    while pos < len(text):
        match = _TOKEN.match(text, pos)
        if match is None:
            raise ValueError(f"unexpected character {text[pos]!r} at {pos}")
        pos = match.end()
        kind = match.lastgroup
        if kind == "ws":
            continue
        tokens.append((kind, match.group()))
    return tokens


def is_true(value: Any) -> bool:
    return value is True


def is_false(value: Any) -> bool:
    return value is False


def truthy(value: Any) -> Any:
    """Coerce to a three-valued boolean."""
    if value is UNKNOWN or isinstance(value, bool):
        return value
    if value is None or value == "":
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return UNKNOWN


class Parser:
    """Recursive-descent parser and evaluator over one variable assignment."""

    def __init__(self, tokens: list[tuple[str, str]], env: dict[str, Any]):
        self.tokens = tokens
        self.pos = 0
        self.env = env

    # --- token helpers ----------------------------------------------------
    def peek(self) -> tuple[str, str] | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def take(self) -> tuple[str, str]:
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def accept(self, value: str) -> bool:
        token = self.peek()
        if token and token[1].lower() == value.lower():
            self.pos += 1
            return True
        return False

    def expect(self, value: str) -> None:
        if not self.accept(value):
            raise ValueError(f"expected {value!r} at token {self.pos}")

    # --- grammar ----------------------------------------------------------
    def expression(self) -> Any:
        return self.or_expr()

    def or_expr(self) -> Any:
        value = self.and_expr()
        while True:
            token = self.peek()
            if not token or token[1] not in ("||",):
                return value
            self.take()
            right = self.and_expr()
            value = self._or(value, right)

    def and_expr(self) -> Any:
        value = self.not_expr()
        while True:
            token = self.peek()
            if not token or token[1] not in ("&&",):
                return value
            self.take()
            right = self.not_expr()
            value = self._and(value, right)

    def not_expr(self) -> Any:
        if self.accept("!"):
            inner = truthy(self.not_expr())
            return UNKNOWN if inner is UNKNOWN else not inner
        return self.comparison()

    def comparison(self) -> Any:
        left = self.additive()
        token = self.peek()
        if token and token[0] == "ident" and token[1].lower() in ("in", "exactin"):
            self.take()
            right = self.additive()
            return self._member(left, right)
        if token and token[1] in ("=", "<>", "<", ">", "<=", ">="):
            op = self.take()[1]
            right = self.additive()
            return self._compare(op, left, right)
        return left

    def additive(self) -> Any:
        value = self.multiplicative()
        while True:
            token = self.peek()
            if not token or token[1] not in ("+", "-", "&"):
                return value
            op = self.take()[1]
            right = self.multiplicative()
            value = self._arith(op, value, right)

    def multiplicative(self) -> Any:
        value = self.unary()
        while True:
            token = self.peek()
            if not token or token[1] not in ("*", "/"):
                return value
            op = self.take()[1]
            right = self.unary()
            value = self._arith(op, value, right)

    def unary(self) -> Any:
        if self.accept("-"):
            inner = self.unary()
            return UNKNOWN if not isinstance(inner, (int, float)) else -inner
        if self.accept("+"):
            return self.unary()
        return self.postfix()

    def postfix(self) -> Any:
        value = self.primary()
        while self.accept("."):
            self.take()                      # field name; result is unknowable
            value = UNKNOWN
        return value

    def primary(self) -> Any:
        token = self.peek()
        if token is None:
            raise ValueError("unexpected end of expression")
        kind, text = token

        if text == "(":
            self.take()
            value = self.expression()
            self.expect(")")
            return value

        if text == "[":                      # table literal: ["a", "b", 3]
            self.take()
            items: list[Any] = []
            if not self.accept("]"):
                while True:
                    try:
                        items.append(self.expression())
                    except ValueError:
                        items.append(UNKNOWN)
                        self._skip_argument()
                    if self.accept(","):
                        continue
                    self.expect("]")
                    break
            return tuple(items)

        if text == "{":                      # record literal: not modelled
            self.take()
            depth = 1
            while self.pos < len(self.tokens) and depth:
                nxt = self.take()[1]
                depth += (nxt == "{") - (nxt == "}")
            return UNKNOWN

        if kind == "number":
            self.take()
            return float(text)

        if kind == "string":
            self.take()
            return text[1:-1].replace('""', '"')

        if kind == "ident":
            self.take()
            lowered = text.lower()
            following = self.peek()
            if following and following[1] == "(":
                args = self.arguments()
                return self.call(text, args)
            if lowered == "true":
                return True
            if lowered == "false":
                return False
            if lowered == "blank":
                return None
            return self.env.get(text, UNKNOWN)

        raise ValueError(f"unexpected token {text!r}")

    def arguments(self) -> list[Any]:
        self.expect("(")
        args: list[Any] = []
        if self.accept(")"):
            return args
        while True:
            try:
                args.append(self.expression())
            except ValueError:
                # An argument this grammar cannot model (a record literal, a
                # predicate over a collection). Skip to the matching comma or
                # close paren so the *call* still evaluates to UNKNOWN rather
                # than aborting the whole expression.
                args.append(UNKNOWN)
                self._skip_argument()
            if self.accept(","):
                continue
            self.expect(")")
            return args

    def _skip_argument(self) -> None:
        depth = 0
        while self.pos < len(self.tokens):
            text = self.tokens[self.pos][1]
            if text in ("(", "{", "["):
                depth += 1
            elif text in (")", "}", "]"):
                if depth == 0:
                    return
                depth -= 1
            elif text == "," and depth == 0:
                return
            self.pos += 1

    # --- semantics --------------------------------------------------------
    def call(self, name: str, args: list[Any]) -> Any:
        lowered = name.lower()
        if lowered == "if":
            return self._if(args)
        if lowered == "not" and len(args) == 1:
            inner = truthy(args[0])
            return UNKNOWN if inner is UNKNOWN else not inner
        if lowered == "and":
            value: Any = True
            for arg in args:
                value = self._and(value, arg)
            return value
        if lowered == "or":
            value = False
            for arg in args:
                value = self._or(value, arg)
            return value
        if lowered == "isblank":
            if len(args) == 1:
                arg = args[0]
                if arg is UNKNOWN:
                    return UNKNOWN
                return arg is None or arg == ""
            return UNKNOWN
        if lowered == "rgba" and len(args) == 4:
            return tuple(args)
        if lowered in _OPAQUE_FUNCTIONS:
            return UNKNOWN
        return UNKNOWN

    def _if(self, args: list[Any]) -> Any:
        index = 0
        while index + 1 < len(args):
            condition = truthy(args[index])
            if is_true(condition):
                return args[index + 1]
            if condition is UNKNOWN:
                return UNKNOWN
            index += 2
        return args[index] if index < len(args) else None

    @staticmethod
    def _and(left: Any, right: Any) -> Any:
        left, right = truthy(left), truthy(right)
        if is_false(left) or is_false(right):
            return False
        if left is UNKNOWN or right is UNKNOWN:
            return UNKNOWN
        return True

    @staticmethod
    def _or(left: Any, right: Any) -> Any:
        left, right = truthy(left), truthy(right)
        if is_true(left) or is_true(right):
            return True
        if left is UNKNOWN or right is UNKNOWN:
            return UNKNOWN
        return False

    @staticmethod
    def _member(left: Any, right: Any) -> Any:
        """`x in [a, b]`. UNKNOWN unless the whole table is known."""
        if left is UNKNOWN or right is UNKNOWN:
            return UNKNOWN
        if not isinstance(right, tuple):
            return UNKNOWN
        if any(item is UNKNOWN for item in right):
            return True if left in right else UNKNOWN
        return left in right

    @staticmethod
    def _compare(op: str, left: Any, right: Any) -> Any:
        if left is UNKNOWN or right is UNKNOWN:
            return UNKNOWN
        try:
            if op == "=":
                return left == right
            if op == "<>":
                return left != right
            if op == "<":
                return left < right
            if op == ">":
                return left > right
            if op == "<=":
                return left <= right
            if op == ">=":
                return left >= right
        except TypeError:
            return UNKNOWN
        return UNKNOWN

    @staticmethod
    def _arith(op: str, left: Any, right: Any) -> Any:
        if op == "&":                        # string concatenation
            if left is UNKNOWN or right is UNKNOWN:
                return UNKNOWN
            return f"{left}{right}"
        if not isinstance(left, (int, float)) or not isinstance(right, (int, float)):
            return UNKNOWN
        if isinstance(left, bool) or isinstance(right, bool):
            return UNKNOWN
        if op == "+":
            return left + right
        if op == "-":
            return left - right
        if op == "*":
            return left * right
        if op == "/":
            return UNKNOWN if right == 0 else left / right
        return UNKNOWN


def evaluate(expression: str, env: dict[str, Any] | None = None) -> Any:
    """Evaluate a Power Fx expression, returning a value, False, or UNKNOWN.

    A leading '=' is optional. An expression this module cannot parse yields
    UNKNOWN rather than raising, so one exotic formula never stops a scan.
    """
    text = (expression or "").strip()
    if text.startswith("="):
        text = text[1:]
    text = text.strip()
    if not text:
        return None
    # Only the first statement of a sequence matters for a value property.
    try:
        tokens = tokenize(text)
    except ValueError:
        return UNKNOWN
    if not tokens:
        return None
    parser = Parser(tokens, env or {})
    try:
        value = parser.expression()
    except (ValueError, IndexError, RecursionError):
        return UNKNOWN
    return value


def visibility(expression: str | None, env: dict[str, Any]) -> Any:
    """Three-valued visibility. A missing Visible property means visible."""
    if expression is None:
        return True
    return truthy(evaluate(expression, env))


def alpha(fill_expression: str | None, env: dict[str, Any] | None = None) -> Any:
    """The alpha channel of a Fill, or UNKNOWN.

    A conditional Fill is opaque only if *every* branch it can take is opaque,
    so a control is never called a cover on the strength of one branch.
    """
    if not fill_expression:
        return UNKNOWN
    text = fill_expression.strip().lstrip("=").strip()
    alphas = [float(m.group(1)) for m in re.finditer(
        r"RGBA\s*\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)", text)]
    if not alphas:
        value = evaluate(fill_expression, env or {})
        if isinstance(value, tuple) and len(value) == 4 and isinstance(value[3], (int, float)):
            return float(value[3])
        return UNKNOWN
    if all(a > 0 for a in alphas):
        return min(alphas)
    if all(a == 0 for a in alphas):
        return 0.0
    return UNKNOWN


# --- pairwise satisfiability ------------------------------------------------
# Two controls may legitimately share pixels when they can never be visible at
# the same time. Deciding that needs more than a single assignment: it needs to
# know whether *any* assignment satisfies both. So the free symbols of the two
# expressions are enumerated over the literals they are actually compared
# against, and both formulas evaluated under each combination.
#
# Opaque subexpressions (`CountRows(...)`, `StartsWith(...)`) are canonicalised
# to a symbol first, so the *same* runtime quantity appearing in both formulas
# is treated as one unknown rather than two independent ones. That is what lets
# `count = 0` and `count >= 2` be recognised as disjoint.

_VARIABLE = re.compile(r"\b((?:var|col|loc)[A-Z]\w*)\b")
_OPAQUE_CALL = re.compile(
    r"\b(?P<fn>[A-Za-z_]\w*)\s*\(", re.IGNORECASE)
_COMPARED_LITERAL = re.compile(
    r"""(?P<sym>[A-Za-z_]\w*)\s*(?:=|<>|<=|>=|<|>)\s*
        (?:"(?P<string>[^"]*)"|(?P<number>\d+(?:\.\d+)?))
      | (?:"(?P<string2>[^"]*)"|(?P<number2>\d+(?:\.\d+)?))\s*
        (?:=|<>|<=|>=|<|>)\s*(?P<sym2>[A-Za-z_]\w*)""",
    re.VERBOSE,
)


class _Sentinel(str):
    """A value equal to nothing else, standing for "some other value"."""


def _match_paren(text: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                return index
    return -1


def canonicalise(*expressions: str) -> tuple[list[str], dict[str, str]]:
    """Replace opaque calls with shared symbols, one per distinct call text."""
    symbols: dict[str, str] = {}
    out: list[str] = []
    for expression in expressions:
        text = (expression or "").strip().lstrip("=")
        changed = True
        while changed:
            changed = False
            for match in _OPAQUE_CALL.finditer(text):
                name = match.group("fn")
                if name.lower() not in _OPAQUE_CALL_NAMES:
                    continue
                close = _match_paren(text, match.end() - 1)
                if close < 0:
                    continue
                whole = text[match.start():close + 1]
                # A trailing field access belongs to the opaque value.
                tail = re.match(r"\s*\.\s*[A-Za-z_]\w*", text[close + 1:])
                if tail:
                    whole = text[match.start():close + 1 + tail.end()]
                symbol = symbols.get(whole)
                if symbol is None:
                    symbol = f"_opq{len(symbols)}"
                    symbols[whole] = symbol
                text = text[:match.start()] + symbol + text[match.start() + len(whole):]
                changed = True
                break
        out.append(text)
    return out, symbols


_OPAQUE_CALL_NAMES = _OPAQUE_FUNCTIONS | {
    "startswith", "endswith", "isempty", "istype", "coalesce", "text", "value",
    "len", "trim", "upper", "lower", "substitute", "left", "right", "mid",
    "firstn", "lastn", "with", "round", "abs", "int", "if",
}
# `If` and `With` are only treated as opaque when they wrap collection work;
# handled by attempting a normal parse first in can_coexist().


def _candidates(texts: list[str], extra_symbols: set[str],
                invariants: dict | None = None) -> dict[str, list]:
    """Candidate values per free symbol: literals it meets, plus true/false.

    `invariants` narrows a symbol's domain where the application guarantees
    one — a page counter that starts at 1 and is only ever incremented or
    `Max(1, n-1)`'d can never be 0, and offering 0 as a candidate would
    manufacture a state the app cannot reach.
    """
    joined = " ".join(texts)
    names: set[str] = set(_VARIABLE.findall(joined)) | extra_symbols
    values: dict[str, set] = {name: set() for name in names}
    for match in _COMPARED_LITERAL.finditer(joined):
        symbol = match.group("sym") or match.group("sym2")
        if symbol not in values:
            continue
        if (text := match.group("string") or match.group("string2")) is not None:
            values[symbol].add(text)
        elif (number := match.group("number") or match.group("number2")) is not None:
            values[symbol].add(float(number))
    result: dict[str, list] = {}
    for name in sorted(names):
        literals = values[name]
        options: list = sorted(literals, key=repr)
        # Comparisons are usually boundaries, so the neighbours of a numeric
        # literal matter as much as the literal: `n >= 2` needs a 2 to be true.
        for value in list(literals):
            if isinstance(value, float):
                options += [value - 1, value + 1]
        options += [0.0, 1.0, 2.0, True, False]
        # The sentinel stands for "a value unlike any compared literal". It is
        # only meaningful where literals exist; on a symbol used as a boolean it
        # would merely poison the expression to UNKNOWN.
        if any(isinstance(value, str) for value in literals):
            options.append(_Sentinel("\x00other"))
        bounds = (invariants or {}).get(name) or {}
        low, high = bounds.get("min"), bounds.get("max")
        if bounds:
            # A declared numeric domain also says the symbol is a number, so
            # boolean candidates would only poison arithmetic to UNKNOWN.
            options = [value for value in options if isinstance(value, float)]
        seen: list = []
        for value in options:
            if isinstance(value, float):
                if low is not None and value < low:
                    continue
                if high is not None and value > high:
                    continue
            if not any(type(value) is type(other) and value == other for other in seen):
                seen.append(value)
        result[name] = seen
    return result


def can_coexist(first: str | None, second: str | None, base: dict | None = None,
                limit: int = 20000, invariants: dict | None = None) -> bool:
    """Cached front door; see `_can_coexist` for the search itself."""
    # repr() rather than the mappings themselves: both carry nested dicts,
    # which are unhashable, and both are small and stable within a run.
    key = (first, second, repr(sorted((base or {}).items(), key=repr)),
           limit, repr(sorted((invariants or {}).items(), key=repr)))
    cached = _COEXIST_CACHE.get(key)
    if cached is None:
        cached = _can_coexist(first, second, base, limit, invariants)
        _COEXIST_CACHE[key] = cached
    return cached


_COEXIST_CACHE: dict = {}


def _can_coexist(first: str | None, second: str | None, base: dict | None = None,
                 limit: int = 20000, invariants: dict | None = None) -> bool:
    """True when some assignment makes both expressions non-false.

    Conservative by construction: if the search space is too large, or an
    expression cannot be modelled, the answer is True — the pair is treated as
    able to appear together and gets reported.
    """
    if first is None or second is None:
        return True
    texts, symbols = canonicalise(first, second)
    base = base or {}
    space = _candidates(texts, set(symbols.values()), invariants)
    # Anything already bound by the caller is not a free symbol.
    for name in list(space):
        if name in base:
            del space[name]
    if not space:
        return not (
            is_false(truthy(evaluate(texts[0], base)))
            or is_false(truthy(evaluate(texts[1], base)))
        )

    names = sorted(space)
    total = 1
    for name in names:
        total *= len(space[name])
        if total > limit:
            return True

    import itertools
    for combination in itertools.product(*(space[name] for name in names)):
        env = dict(base)
        env.update(dict(zip(names, combination)))
        left = truthy(evaluate(texts[0], env))
        right = truthy(evaluate(texts[1], env))
        if not is_false(left) and not is_false(right):
            return True
    return False
