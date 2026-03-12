from utils.contagem_video import (
    normalize_bovine_target_classes,
    normalize_detected_bovine_class,
)


def test_normalize_bovine_target_classes_defaults_to_cow():
    assert normalize_bovine_target_classes(None) == ["cow"]
    assert normalize_bovine_target_classes([]) == ["cow"]


def test_normalize_bovine_target_classes_maps_synonyms_and_filters_non_bovine():
    classes = ["crow", "gado", "BOVINO", "cow", "bird", "boi", "cow"]
    assert normalize_bovine_target_classes(classes) == ["cow"]


def test_normalize_bovine_target_classes_fallback_when_no_bovine_entries():
    assert normalize_bovine_target_classes(["crow", "person"]) == ["cow"]


def test_normalize_detected_bovine_class_maps_variants_to_single_cow_class():
    assert normalize_detected_bovine_class("cow") == "cow"
    assert normalize_detected_bovine_class("CATTLE") == "cow"
    assert normalize_detected_bovine_class("bezerro") == "cow"
    assert normalize_detected_bovine_class("calf") == "cow"
    assert normalize_detected_bovine_class("bull") == "cow"


def test_normalize_detected_bovine_class_keeps_non_bovine_classes():
    assert normalize_detected_bovine_class("bird") == "bird"
    assert normalize_detected_bovine_class("person") == "person"
