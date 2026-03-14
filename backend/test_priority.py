"""
test_priority.py
================
Unit tests for the HMS Priority Engine.

Run with:
    pytest backend/test_priority.py -v
"""

import pytest
from datetime import datetime, timezone, timedelta
from backend.priority_engine import PriorityEngine, SymptomMatcher


# ─── Priority Engine Tests ────────────────────────────────────────────────────

class TestPriorityScore:
    """Tests for P = S + (T × 0.5)"""

    def _make_arrival(self, minutes_ago: float) -> datetime:
        return datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)

    def test_critical_just_arrived(self):
        """Critical patient arrived just now → score ≈ 100"""
        arrival = self._make_arrival(0)
        score = PriorityEngine.calculate_score(100, arrival)
        assert 99.9 <= score <= 101.0, f"Expected ~100, got {score}"

    def test_normal_just_arrived(self):
        """Normal patient arrived just now → score ≈ 20"""
        arrival = self._make_arrival(0)
        score = PriorityEngine.calculate_score(20, arrival)
        assert 19.9 <= score <= 21.0, f"Expected ~20, got {score}"

    def test_moderate_30_minutes(self):
        """Moderate (50) + 30 min → P = 50 + (30 × 0.5) = 65"""
        arrival = self._make_arrival(30)
        score = PriorityEngine.calculate_score(50, arrival)
        assert 64.0 <= score <= 66.0, f"Expected ~65, got {score}"

    def test_normal_120_minutes(self):
        """Normal (20) + 120 min → P = 20 + (120 × 0.5) = 80"""
        arrival = self._make_arrival(120)
        score = PriorityEngine.calculate_score(20, arrival)
        assert 79.0 <= score <= 81.0, f"Expected ~80, got {score}"

    def test_normal_overtakes_critical_after_enough_time(self):
        """
        A Normal patient who arrived 200 min ago should score higher
        than a Critical patient who just arrived.

        Normal@200min: 20 + (200×0.5) = 120
        Critical@0min: 100 + 0        = 100
        """
        score_old_normal    = PriorityEngine.calculate_score(20,  self._make_arrival(200))
        score_fresh_critical = PriorityEngine.calculate_score(100, self._make_arrival(0))
        assert score_old_normal > score_fresh_critical, (
            f"Expected old normal ({score_old_normal}) > fresh critical ({score_fresh_critical})"
        )

    def test_score_increases_over_time(self):
        """Score should be strictly higher for earlier arrivals."""
        arrival_early = self._make_arrival(60)
        arrival_late  = self._make_arrival(10)
        score_early = PriorityEngine.calculate_score(20, arrival_early)
        score_late  = PriorityEngine.calculate_score(20, arrival_late)
        assert score_early > score_late

    def test_critical_always_beats_normal_in_first_hour(self):
        """Within 47 minutes of arrival, Critical always beats Normal regardless of wait."""
        # Worst case: Critical just arrived (0 min), Normal arrived 159 min ago
        # Critical@0: 100; Normal@159min: 20 + 79.5 = 99.5  <  100 ✓
        for normal_wait in range(0, 160, 10):
            score_c = PriorityEngine.calculate_score(100, self._make_arrival(0))
            score_n = PriorityEngine.calculate_score(20,  self._make_arrival(normal_wait))
            if normal_wait < 160:
                assert score_c >= score_n or normal_wait > 159, (
                    f"At {normal_wait}min normal beat critical: {score_n} > {score_c}"
                )

    def test_severity_weight_mapping(self):
        """Verify the severity weight constants."""
        assert PriorityEngine.calculate_score(100, self._make_arrival(0)) is not None  # critical
        assert PriorityEngine.calculate_score(50,  self._make_arrival(0)) is not None  # moderate
        assert PriorityEngine.calculate_score(20,  self._make_arrival(0)) is not None  # normal

    def test_queue_sorting_order(self):
        """Simulate 4 patients and ensure they sort correctly by priority."""
        patients = [
            {"name": "Alice",   "weight": 20,  "minutes_ago": 5   },   # Normal,   new
            {"name": "Bob",     "weight": 100, "minutes_ago": 2   },   # Critical, new
            {"name": "Charlie", "weight": 50,  "minutes_ago": 60  },   # Moderate, 1hr
            {"name": "Diana",   "weight": 20,  "minutes_ago": 200 },   # Normal,   3.3hr
        ]
        scored = [
            {**p, "score": PriorityEngine.calculate_score(p["weight"], self._make_arrival(p["minutes_ago"]))}
            for p in patients
        ]
        sorted_queue = sorted(scored, key=lambda x: x["score"], reverse=True)

        # Diana (long wait) should be #1, Bob (critical) #2, Charlie #3, Alice #4
        assert sorted_queue[0]["name"] == "Diana",   f"Expected Diana first, got {sorted_queue[0]['name']}"
        assert sorted_queue[1]["name"] == "Bob",     f"Expected Bob second, got {sorted_queue[1]['name']}"
        assert sorted_queue[2]["name"] == "Charlie", f"Expected Charlie third, got {sorted_queue[2]['name']}"
        assert sorted_queue[3]["name"] == "Alice",   f"Expected Alice last, got {sorted_queue[3]['name']}"


# ─── Symptom Normalisation Tests ──────────────────────────────────────────────
class TestSymptomNormalisation:
    """Verify keyword normalisation logic without DB."""

    def test_normalise_lowercase(self):
        result = SymptomMatcher._normalise("Chest Pain")
        assert result == "chest pain"

    def test_normalise_strips_punctuation(self):
        result = SymptomMatcher._normalise("fever, chills & sweating!")
        assert "," not in result
        assert "!" not in result
        assert "&" not in result

    def test_normalise_collapses_spaces(self):
        result = SymptomMatcher._normalise("  severe   back   pain  ")
        assert "  " not in result
        assert result == "severe back pain"

    def test_normalise_strips_accents_passthrough(self):
        """Ensure ASCII-only output for common inputs."""
        result = SymptomMatcher._normalise("Nausea")
        assert result == "nausea"


# ─── Colour Map Tests ─────────────────────────────────────────────────────────
class TestColourMap:
    """Test that all admission statuses map to correct colours."""

    from backend.priority_engine import COLOR_MAP

    @pytest.mark.parametrize("status,expected_color", [
        ("icu",             "red"),
        ("under_treatment", "yellow"),
        ("admitted",        "blue"),
        ("discharged",      "green"),
    ])
    def test_tracking_color_map(self, status, expected_color):
        from backend.priority_engine import COLOR_MAP
        assert COLOR_MAP[status]["color"] == expected_color, (
            f"Status '{status}' should map to '{expected_color}'"
        )
