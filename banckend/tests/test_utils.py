"""Testes para utilidades de contagem de vídeo.

O módulo valida a configuração de linhas e direções e a detecção de
cruzamentos de linhas diagonais.

Tests for video counting utilities.

The module validates line and direction configuration and detection of
diagonal line crossings.
"""

from utils.contagem_video import (
    get_line_and_direction_config,
    LINE_VERTICAL,
    MOVE_LR,
    is_crossing_diagonal_line,
    MOVE_TL_BR,
)


def test_get_line_and_direction_config_east():
    """Return a centered vertical line moving from left to right for east."""

    line_type, direction, line_points, pos, _ = get_line_and_direction_config(
        'E', width=100, height=50
    )
    assert line_type == LINE_VERTICAL
    assert direction == MOVE_LR
    assert line_points == ((50, 0), (50, 50))
    assert pos == 50


def test_is_crossing_diagonal_line():
    """Detect crossing of a top-left to bottom-right diagonal line."""

    p_prev = (10, 20)
    p_curr = (30, 25)
    line_p1 = (0, 0)
    line_p2 = (100, 100)
    crossed = is_crossing_diagonal_line(
        p_prev[0], p_prev[1],
        p_curr[0], p_curr[1],
        line_p1, line_p2, MOVE_TL_BR,
    )
    assert crossed is True
