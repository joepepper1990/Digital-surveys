"""Design tokens are checked, not asserted (§8, §45)."""
import copy

import pytest

from validators import design_tokens
from validators.model import Severity


@pytest.fixture(scope="module")
def tokens():
    return design_tokens.load_tokens()


def test_shipped_tokens_are_clean(tokens):
    findings = design_tokens.check(tokens)
    assert findings == [], "\n".join(f.render() for f in findings)


def test_contrast_formula_matches_known_values():
    assert design_tokens.contrast_ratio("#FFFFFF", "#000000") == pytest.approx(21.0, abs=0.01)
    assert design_tokens.contrast_ratio("#FFFFFF", "#FFFFFF") == pytest.approx(1.0, abs=0.01)
    # Reference value from the WCAG 2.1 contrast definition.
    assert design_tokens.contrast_ratio("#767676", "#FFFFFF") == pytest.approx(4.54, abs=0.02)


def test_low_contrast_pair_is_rejected(tokens):
    broken = copy.deepcopy(tokens)
    broken["color"]["inkSecondary"]["hex"] = "#B8C4CE"
    rules = {f.rule.split()[0] for f in design_tokens.check(broken)}
    assert "R303" in rules


def test_status_without_glyph_is_rejected(tokens):
    broken = copy.deepcopy(tokens)
    broken["statusStyles"]["valid"]["glyph"] = ""
    rules = {f.rule.split()[0] for f in design_tokens.check(broken)}
    assert "R304" in rules


def test_small_touch_target_is_rejected(tokens):
    broken = copy.deepcopy(tokens)
    broken["size"]["minTouchTarget"] = 32
    rules = {f.rule.split()[0] for f in design_tokens.check(broken)}
    assert "R306" in rules


def test_small_type_is_rejected(tokens):
    broken = copy.deepcopy(tokens)
    broken["typography"]["scale"]["caption"]["size"] = 10
    rules = {f.rule.split()[0] for f in design_tokens.check(broken)}
    assert "R307" in rules


def test_every_status_resolves_to_real_colour_tokens(tokens):
    colours = set(tokens["color"])
    for group in ("statusStyles", "syncStyles"):
        for name, style in tokens[group].items():
            if name.startswith("_"):
                continue
            assert style["ink"] in colours
            assert style["surface"] in colours


def test_generated_powerfx_is_current():
    """The committed Power Fx must match design/tokens.json."""
    import subprocess
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["python3", str(root / "design" / "emit_powerfx.py"), "--check"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_every_colour_token_is_emitted():
    import json
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    tokens = json.loads((root / "design" / "tokens.json").read_text())
    emitted = (root / "design" / "generated" / "DesignTokens.fx.txt").read_text()
    for name in tokens["color"]:
        formula = "tok" + name[:1].upper() + name[1:]
        assert f"{formula} = RGBA(" in emitted, f"{formula} was not emitted"
