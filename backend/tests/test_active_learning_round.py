from scripts.active_learning_round import Detection, _evaluate_hard_sample


def _det(
    *,
    class_name: str,
    confidence: float,
    x_center: float = 0.5,
    y_center: float = 0.5,
    width: float = 0.1,
    height: float = 0.1,
    is_bovine: bool = False,
) -> Detection:
    return Detection(
        class_id=0,
        class_name=class_name,
        confidence=confidence,
        x_center=x_center,
        y_center=y_center,
        width=width,
        height=height,
        is_bovine=is_bovine,
    )


def test_evaluate_hard_sample_flags_low_conf_bovine_and_tiny_box():
    detections = [
        _det(class_name="cow", confidence=0.40, width=0.03, height=0.03, is_bovine=True)
    ]
    reasons = _evaluate_hard_sample(
        detections=detections,
        line_axis="y",
        line_ratio=0.5,
        line_margin=0.05,
        hard_bovine_conf=0.55,
        hard_non_bovine_conf=0.35,
        min_bovine_box_area=0.003,
    )
    assert "low_conf_bovine" in reasons
    assert "tiny_bovine_box" in reasons


def test_evaluate_hard_sample_flags_high_conf_non_bovine():
    detections = [
        _det(class_name="bird", confidence=0.80, is_bovine=False),
    ]
    reasons = _evaluate_hard_sample(
        detections=detections,
        line_axis="y",
        line_ratio=0.5,
        line_margin=0.05,
        hard_bovine_conf=0.55,
        hard_non_bovine_conf=0.35,
        min_bovine_box_area=0.003,
    )
    assert "high_conf_non_bovine" in reasons


def test_evaluate_hard_sample_flags_near_count_line_for_x_axis():
    detections = [
        _det(
            class_name="cow",
            confidence=0.90,
            x_center=0.48,
            y_center=0.20,
            is_bovine=True,
        ),
    ]
    reasons = _evaluate_hard_sample(
        detections=detections,
        line_axis="x",
        line_ratio=0.5,
        line_margin=0.05,
        hard_bovine_conf=0.55,
        hard_non_bovine_conf=0.35,
        min_bovine_box_area=0.003,
    )
    assert "near_count_line" in reasons

