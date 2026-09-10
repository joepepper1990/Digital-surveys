"""The runtime-defect analysers must fire on the defect fixture and stay silent
on the clean one.

Both defects confirmed in Power Apps Studio on 1.1.0.5 — the Survey Plan header
overlap and the blank Sign Out Instrument screen — are defect *classes*, not two
formulas. These tests assert the class is detected, including on instances that
appear in neither screenshot.
"""
import pathlib

import pytest

from validators import pa_source, rules_runtime, rules_static
from validators.model import Severity

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="module")
def defective():
    return rules_runtime.run_all(pa_source.load(FIXTURES / "runtime-defective"))


@pytest.fixture(scope="module")
def clean():
    return rules_runtime.run_all(pa_source.load(FIXTURES / "runtime-clean"))


def _rules(findings):
    return {f.rule.split()[0] for f in findings}


def _actionable(findings):
    return [f for f in findings if f.severity is not Severity.INFO]


# --- the clean fixture is the acceptance shape ------------------------------

def test_clean_fixture_is_silent(clean):
    actionable = _actionable(clean)
    assert actionable == [], "\n".join(f.render() for f in actionable)


def test_clean_fixture_actually_has_content():
    # Guards against the clean fixture passing because nothing parsed.
    source = pa_source.load(FIXTURES / "runtime-clean")
    assert len(source.controls) >= 10
    assert not source.parse_errors


def test_clean_fixture_geometry_was_actually_checked(clean):
    # A silent geometry result is only meaningful if the rects were evaluable.
    coverage = [f for f in clean if f.rule.startswith("R020")]
    assert coverage, "R020 did not report geometry coverage"
    assert "NOT checked" in coverage[0].message


# --- every rule fires on the defect fixture ---------------------------------

@pytest.mark.parametrize(
    "rule,description",
    [
        ("R014", "header shape: two navigation buttons occupying the same pixels"),
        ("R015", "header shape: HOME pushed past the right edge of the canvas"),
        ("R016", "touch target below the gloved-use minimum"),
        ("R017", "sign-out shape: no control on the screen is unconditionally visible"),
        ("R018", "sign-out shape: the visibility gate is never written anywhere"),
        ("R019", "sign-out shape: draft field read under a name no write supplies"),
    ],
)
def test_rule_fires_on_defective_fixture(defective, rule, description):
    assert rule in _rules(defective), f"{rule} did not fire for: {description}"


def test_header_collision_names_both_controls(defective):
    collisions = [f for f in defective if f.rule.startswith("R014")]
    assert any(
        "btnHandover" in f.message and "btnInstruments" in f.message for f in collisions
    ), "\n".join(f.render() for f in collisions)


def test_status_text_colliding_with_nav_band_is_caught(defective):
    # The defect in the screenshot is not button-vs-button alone: the status
    # line sits inside the navigation band. That instance must be reported too.
    collisions = [f for f in defective if f.rule.startswith("R014")]
    assert any("lblSurveyStatus" in f.message for f in collisions)


# --- R014: geometry collision ------------------------------------------------

def _screen(children):
    source = pa_source.CanvasSource(root=pathlib.Path("."))
    source.controls.append(
        pa_source.Control(name="Scr", path="Scr", type="Screen", file="synthetic")
    )
    for name, formulas in children.items():
        source.controls.append(
            pa_source.Control(
                name=name, path=f"Scr/{name}", type=formulas.pop("_type", "Label"),
                file="synthetic", formulas=formulas,
            )
        )
    return source


RULES = rules_static.load_rules()


def test_adjacent_controls_do_not_collide():
    # Touching edges is a layout, not a defect: 100+200 == 300.
    source = _screen({
        "a": {"X": "=100", "Y": "=0", "Width": "=200", "Height": "=48"},
        "b": {"X": "=300", "Y": "=0", "Width": "=200", "Height": "=48"},
    })
    assert rules_runtime.geometry_collisions(source, RULES) == []


def test_one_pixel_overlap_is_reported():
    source = _screen({
        "a": {"X": "=100", "Y": "=0", "Width": "=200", "Height": "=48"},
        "b": {"X": "=299", "Y": "=0", "Width": "=200", "Height": "=48"},
    })
    assert len(rules_runtime.geometry_collisions(source, RULES)) == 1


def test_containment_is_layering_not_collision():
    # A card behind its own label must never be reported.
    source = _screen({
        "card": {"X": "=0", "Y": "=0", "Width": "=400", "Height": "=200"},
        "label": {"X": "=16", "Y": "=16", "Width": "=200", "Height": "=32"},
    })
    assert rules_runtime.geometry_collisions(source, RULES) == []


def test_mutually_exclusive_controls_may_share_pixels():
    # Two views of the same panel, never on screen together.
    source = _screen({
        "a": {"X": "=0", "Y": "=0", "Width": "=400", "Height": "=200",
              "Visible": '=varView = "list"'},
        "b": {"X": "=0", "Y": "=0", "Width": "=400", "Height": "=200",
              "Visible": '=varView = "detail"'},
    })
    assert rules_runtime.geometry_collisions(source, RULES) == []


def test_same_gate_on_both_controls_still_collides():
    # Same condition means both appear together; overlap is real.
    source = _screen({
        "a": {"X": "=0", "Y": "=0", "Width": "=400", "Height": "=200",
              "Visible": '=varView = "list"'},
        "b": {"X": "=100", "Y": "=0", "Width": "=400", "Height": "=200",
              "Visible": '=varView = "list"'},
    })
    assert len(rules_runtime.geometry_collisions(source, RULES)) == 1


def test_non_static_geometry_is_not_guessed():
    # Parent-relative positioning is not decidable here and must not be
    # reported either way. R020 reports it as unchecked instead.
    source = _screen({
        "a": {"X": "=Parent.X + 8", "Y": "=0", "Width": "=200", "Height": "=48"},
        "b": {"X": "=100", "Y": "=0", "Width": "=200", "Height": "=48"},
    })
    assert rules_runtime.geometry_collisions(source, RULES) == []
    coverage = rules_runtime.geometry_coverage(source, RULES)
    assert "1 of 2" in coverage[0].message


def test_controls_in_different_containers_are_not_compared():
    source = pa_source.CanvasSource(root=pathlib.Path("."))
    for path in ("Scr/grpLeft/a", "Scr/grpRight/b"):
        source.controls.append(
            pa_source.Control(
                name=path.rsplit("/", 1)[1], path=path, type="Label", file="synthetic",
                formulas={"X": "=0", "Y": "=0", "Width": "=200", "Height": "=48"},
            )
        )
    assert rules_runtime.geometry_collisions(source, RULES) == []


# --- R017/R018: the blank-screen class --------------------------------------

def test_screen_with_one_always_visible_control_is_not_blank():
    source = _screen({
        "heading": {"X": "=0", "Y": "=0", "Width": "=200", "Height": "=48",
                    "Visible": "=true"},
        "body": {"X": "=0", "Y": "=60", "Width": "=200", "Height": "=48",
                 "Visible": "=varReady"},
    })
    assert rules_runtime.screens_that_can_render_blank(source, RULES) == []


def test_screen_with_every_control_gated_is_reported():
    source = _screen({
        "body": {"X": "=0", "Y": "=60", "Width": "=200", "Height": "=48",
                 "Visible": "=varReady"},
    })
    assert len(rules_runtime.screens_that_can_render_blank(source, RULES)) == 1


def test_written_state_is_not_reported():
    source = _screen({
        "btn": {"OnSelect": "=Set(varReady, true)"},
        "body": {"Visible": "=varReady"},
    })
    assert rules_runtime.state_never_written(source, RULES) == []


def test_state_written_only_by_updatecontext_is_not_reported():
    source = _screen({
        "btn": {"OnSelect": "=UpdateContext({ varReady: true })"},
        "body": {"Visible": "=varReady"},
    })
    assert rules_runtime.state_never_written(source, RULES) == []


def test_collection_written_by_clearcollect_is_not_reported():
    source = _screen({
        "btn": {"OnSelect": '=ClearCollect(colDraft, { Serial: "" })'},
        "body": {"Text": "=First(colDraft).Serial"},
    })
    assert rules_runtime.state_never_written(source, RULES) == []


def test_unwritten_state_fires_on_an_instance_from_neither_screenshot():
    # Proves R018 detects the class, not the two names in the Studio session.
    source = _screen({
        "lblDose": {"Text": "=varPostDeconResult & \" mSv\""},
    })
    findings = rules_runtime.state_never_written(source, RULES)
    assert [f.rule.split()[0] for f in findings] == ["R018"]
    assert "varPostDeconResult" in findings[0].message


def test_externally_provided_state_can_be_documented():
    rules = dict(RULES, externallyProvidedState=["varLaunchContext"])
    source = _screen({"body": {"Visible": "=varLaunchContext"}})
    assert rules_runtime.state_never_written(source, rules) == []


# --- R019: draft field name mismatch ----------------------------------------

def test_field_supplied_by_the_write_is_not_reported():
    source = _screen({
        "btn": {"OnSelect": '=Collect(colDraft, { Serial: "", CalDue: Blank() })'},
        "lbl": {"Text": "=LookUp(colDraft, Slot = 1).Serial"},
    })
    assert rules_runtime.record_field_never_written(source, RULES) == []


def test_field_no_write_supplies_is_reported():
    source = _screen({
        "btn": {"OnSelect": '=Collect(colDraft, { Serial: "", CalDue: Blank() })'},
        "lbl": {"Text": "=LookUp(colDraft, Slot = 1).SerialNumber"},
    })
    findings = rules_runtime.record_field_never_written(source, RULES)
    assert len(findings) == 1
    assert "colDraft.SerialNumber" in findings[0].message


def test_collection_with_no_record_literal_write_is_left_alone():
    # Shape unknown, so nothing is claimed about it either way.
    source = _screen({
        "btn": {"OnSelect": "=ClearCollect(colDraft, Filter(colRegister, true))"},
        "lbl": {"Text": "=First(colDraft).AnyFieldAtAll"},
    })
    assert rules_runtime.record_field_never_written(source, RULES) == []
