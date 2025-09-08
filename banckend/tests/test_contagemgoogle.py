"""Tests for ``contagemgoogle`` line configuration utilities."""

import pytest

from contagemgoogle import LINE_VERTICAL, MOVE_LR, get_line_and_direction_config


def test_get_line_and_direction_config_east_google():
    """Return a centered vertical line moving left to right for east."""

    line_type, direction, line_points, pos = get_line_and_direction_config(
        "E", width=100, height=50
    )
    assert line_type == LINE_VERTICAL
    assert direction == MOVE_LR
    assert line_points == ((50, 0), (50, 50))
    assert pos == 50


def test_get_line_and_direction_config_invalid_google():
    """Raise ValueError for unsupported orientation codes."""

    with pytest.raises(ValueError):
        get_line_and_direction_config("NE", width=100, height=50)
