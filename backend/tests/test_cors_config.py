from main import _is_production_env, _parse_allowed_origins


def test_parse_allowed_origins_handles_empty_values():
    assert _parse_allowed_origins(None) == []
    assert _parse_allowed_origins('') == []
    assert _parse_allowed_origins(' , ') == []


def test_parse_allowed_origins_splits_and_trims():
    value = 'https://app.example.com, http://localhost:8081,https://admin.example.com'
    assert _parse_allowed_origins(value) == [
        'https://app.example.com',
        'http://localhost:8081',
        'https://admin.example.com',
    ]


def test_is_production_env_variants():
    assert _is_production_env('production') is True
    assert _is_production_env('prod') is True
    assert _is_production_env('Production') is True
    assert _is_production_env('development') is False
    assert _is_production_env(None) is False
