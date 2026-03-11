from utils.contagem_video import normalize_bovine_target_classes


def test_normalize_bovine_target_classes_defaults_to_cow():
    assert normalize_bovine_target_classes(None) == ["cow"]
    assert normalize_bovine_target_classes([]) == ["cow"]


def test_normalize_bovine_target_classes_maps_synonyms_and_filters_non_bovine():
    classes = ["crow", "gado", "BOVINO", "cow", "bird", "boi", "cow"]
    assert normalize_bovine_target_classes(classes) == ["cow"]


def test_normalize_bovine_target_classes_fallback_when_no_bovine_entries():
    assert normalize_bovine_target_classes(["crow", "person"]) == ["cow"]
