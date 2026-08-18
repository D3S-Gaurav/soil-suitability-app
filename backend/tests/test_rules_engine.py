"""Boundary tests for the rules engine.

The engine does not compare a reading against a crop's raw min/max. It widens
each band by a tolerance buffer first:

    buffer = (max - min) * 0.10          for N, P and K
    buffer = 0.3 (absolute)              for pH

and only flags a value when it falls *strictly* outside the widened band:

    low   when  val <  min - buffer
    high  when  val >  max + buffer

So the widened edge itself still counts as optimal. For rice
(N 60-99, P 35-60, K 35-45) that gives:

    N: buffer 3.9 -> flagged below 56.1, flagged above 102.9
    P: buffer 2.5 -> flagged below 32.5, flagged above  62.5
    K: buffer 1.0 -> flagged below 34.0, flagged above  46.0

These tests pin that behaviour from both sides of each edge.
"""

import pytest

from app.data.loader import get_crop_requirements, load_crop_data
from app.services.rules_engine import TOLERANCE, evaluate_all_crops, evaluate_soil


@pytest.fixture(scope="module")
def df():
    return load_crop_data()


@pytest.fixture(scope="module")
def rice(df):
    return get_crop_requirements("rice", df)


def reading(**overrides):
    """A reading comfortably inside rice's band, with named fields overridden."""
    base = {"N": 80, "P": 48, "K": 40, "pH": 6.5, "moisture": 45}
    base.update(overrides)
    return base


# --------------------------------------------------------------------------
# The tolerance band itself
# --------------------------------------------------------------------------

def test_tolerance_is_ten_percent():
    assert TOLERANCE == 0.10


def test_rice_band_matches_the_documented_edges(rice):
    assert rice["N"]["min"] == 60.0 and rice["N"]["max"] == 99.0
    assert rice["P"]["min"] == 35.0 and rice["P"]["max"] == 60.0
    assert rice["K"]["min"] == 35.0 and rice["K"]["max"] == 45.0


@pytest.mark.parametrize("param", ["N", "P", "K"])
def test_value_just_inside_the_low_edge_is_optimal(df, rice, param):
    buffer = (rice[param]["max"] - rice[param]["min"]) * TOLERANCE
    just_inside = rice[param]["min"] - buffer + 0.01

    result = evaluate_soil(reading(**{param: just_inside}), "rice", df)

    assert result["params"][param]["status"] == "optimal"
    assert result["suitable"] is True


@pytest.mark.parametrize("param", ["N", "P", "K"])
def test_value_just_outside_the_low_edge_is_flagged_low(df, rice, param):
    buffer = (rice[param]["max"] - rice[param]["min"]) * TOLERANCE
    just_outside = rice[param]["min"] - buffer - 0.01

    result = evaluate_soil(reading(**{param: just_outside}), "rice", df)

    assert result["params"][param]["status"] == "low"
    assert result["suitable"] is False
    assert any(f"{param} is too low" in issue for issue in result["issues"])


@pytest.mark.parametrize("param", ["N", "P", "K"])
def test_value_just_inside_the_high_edge_is_optimal(df, rice, param):
    buffer = (rice[param]["max"] - rice[param]["min"]) * TOLERANCE
    just_inside = rice[param]["max"] + buffer - 0.01

    result = evaluate_soil(reading(**{param: just_inside}), "rice", df)

    assert result["params"][param]["status"] == "optimal"


@pytest.mark.parametrize("param", ["N", "P", "K"])
def test_value_just_outside_the_high_edge_is_flagged_high(df, rice, param):
    buffer = (rice[param]["max"] - rice[param]["min"]) * TOLERANCE
    just_outside = rice[param]["max"] + buffer + 0.01

    result = evaluate_soil(reading(**{param: just_outside}), "rice", df)

    assert result["params"][param]["status"] == "high"
    assert any(f"{param} is too high" in issue for issue in result["issues"])


@pytest.mark.parametrize("param", ["N", "P", "K"])
def test_the_widened_edge_itself_counts_as_optimal(df, rice, param):
    """The comparison is strict (`<`), so the edge value is not flagged."""
    buffer = (rice[param]["max"] - rice[param]["min"]) * TOLERANCE

    low_edge = evaluate_soil(reading(**{param: rice[param]["min"] - buffer}), "rice", df)
    high_edge = evaluate_soil(reading(**{param: rice[param]["max"] + buffer}), "rice", df)

    assert low_edge["params"][param]["status"] == "optimal"
    assert high_edge["params"][param]["status"] == "optimal"


def test_raw_min_max_would_flag_but_tolerance_rescues_it(df, rice):
    """A value below the crop's raw minimum can still pass, thanks to the buffer.

    This is the whole point of the tolerance band, and the behaviour most likely
    to be questioned: rice's raw N minimum is 60, but N=57 still passes because
    the band is widened to 56.1.
    """
    assert rice["N"]["min"] == 60.0
    below_raw_min = 57

    result = evaluate_soil(reading(N=below_raw_min), "rice", df)

    assert below_raw_min < rice["N"]["min"]
    assert result["params"]["N"]["status"] == "optimal"


# --------------------------------------------------------------------------
# pH uses a fixed +/-0.3 buffer, not a percentage
# --------------------------------------------------------------------------

def test_ph_just_inside_the_acidic_edge_is_optimal(df, rice):
    just_inside = rice["pH"]["min"] - 0.3 + 0.01
    result = evaluate_soil(reading(pH=just_inside), "rice", df)
    assert result["params"]["pH"]["status"] == "optimal"


def test_ph_just_outside_the_acidic_edge_is_flagged(df, rice):
    just_outside = rice["pH"]["min"] - 0.3 - 0.01
    result = evaluate_soil(reading(pH=just_outside), "rice", df)

    assert result["params"]["pH"]["status"] == "acidic"
    assert any("too acidic" in issue for issue in result["issues"])
    # Liming products are the documented remedy for acidic soil.
    assert any("Lime" in s for s in result["suggestions"])


def test_ph_just_outside_the_alkaline_edge_is_flagged(df, rice):
    just_outside = rice["pH"]["max"] + 0.3 + 0.01
    result = evaluate_soil(reading(pH=just_outside), "rice", df)

    assert result["params"]["pH"]["status"] == "alkaline"
    assert any("Sulfur" in s for s in result["suggestions"])


def test_ph_buffer_is_absolute_not_proportional(df, rice):
    """pH is flagged 0.3 outside the band regardless of how wide the band is."""
    inside = evaluate_soil(reading(pH=rice["pH"]["min"] - 0.29), "rice", df)
    outside = evaluate_soil(reading(pH=rice["pH"]["min"] - 0.31), "rice", df)

    assert inside["params"]["pH"]["status"] == "optimal"
    assert outside["params"]["pH"]["status"] == "acidic"


# --------------------------------------------------------------------------
# Verdict assembly
# --------------------------------------------------------------------------

def test_suitable_only_when_no_issues_at_all(df):
    result = evaluate_soil(reading(), "rice", df)
    assert result["issues"] == []
    assert result["suitable"] is True
    assert "SUITABLE" in result["verdict"]


def test_multiple_out_of_band_params_all_get_reported(df):
    result = evaluate_soil(reading(N=0, P=0, K=0), "rice", df)

    assert len(result["issues"]) == 3
    assert result["suitable"] is False


def test_suggestions_are_deduplicated(df):
    result = evaluate_soil(reading(N=0, P=0, K=0), "rice", df)
    assert len(result["suggestions"]) == len(set(result["suggestions"]))


def test_unknown_crop_returns_an_error(df):
    result = evaluate_soil(reading(), "not-a-real-crop", df)
    assert "error" in result


def test_missing_parameters_default_to_zero_and_flag_low(df):
    """An empty reading defaults N/P/K to 0, which is below every band."""
    result = evaluate_soil({}, "rice", df)

    assert result["suitable"] is False
    for param in ("N", "P", "K"):
        assert result["params"][param]["value"] == 0


def test_evaluate_all_agrees_with_individual_evaluation(df):
    soil = reading()
    suitable = evaluate_all_crops(soil)

    assert suitable == sorted(suitable)
    for crop in suitable:
        assert evaluate_soil(soil, crop, df)["suitable"] is True


def test_evaluate_all_includes_rice_for_rice_friendly_soil():
    assert "rice" in evaluate_all_crops(reading())
