"""Testes das rotas de upload de vídeo.

O objetivo é confirmar que a API recusa arquivos com extensões inválidas e aceita
vídeos com extensões permitidas.

Tests for the video upload routes.

The goal is to confirm the API rejects files with invalid extensions and
accepts videos with permitted extensions.
"""

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.orientation_routes import router as orientation_router
from routes.video_routes import router as video_router

app = FastAPI()
app.include_router(video_router)
app.include_router(orientation_router)


def test_upload_video_endpoint_rejects_invalid_extension():
    """Return a 400 error when a file with an unsupported extension is uploaded."""

    client = TestClient(app)
    response = client.post(
        "/upload-video/",
        files={"file": ("video.txt", b"content", "text/plain")},
    )
    assert response.status_code == 400
    assert "Extensão" in response.json()["detail"]


def test_upload_video_endpoint_accepts_valid_extension(tmp_path):
    """Accept a valid video file and store it in the uploads directory."""

    # Ensure uploads go to a temporary directory
    data_dir = tmp_path / "data"
    uploads_dir = data_dir / "uploads"
    uploads_dir.mkdir(parents=True)
    os.environ["RENDER_DATA_DIR"] = str(data_dir)

    # Reload module to apply new DATA_DIR
    from importlib import reload

    import routes.video_routes as video_routes

    reload(video_routes)

    app = FastAPI()
    app.include_router(video_routes.router)
    client = TestClient(app)

    response = client.post(
        "/upload-video/",
        files={"file": ("video.mp4", b"data", "video/mp4")},
    )
    assert response.status_code == 200
    nome_arquivo = response.json()["nome_arquivo"]
    saved_path = uploads_dir / nome_arquivo
    assert saved_path.exists()


@pytest.mark.parametrize("orientation", ["INVALID", "NE"])
def test_predict_video_endpoint_rejects_invalid_orientation(orientation):
    """Return 400 when orientation code is invalid or diagonal."""

    client = TestClient(app)
    response = client.post(
        "/predict-video/",
        json={"nome_arquivo": "video.mp4", "orientation": orientation},
    )
    assert response.status_code == 400


def test_predict_video_endpoint_accepts_valid_orientation(monkeypatch):
    """Accept a valid orientation and start processing."""

    client = TestClient(app)

    def fake_contar_gado_em_video(**kwargs):
        return {}

    monkeypatch.setattr(
        "routes.video_routes.contar_gado_em_video", fake_contar_gado_em_video
    )

    response = client.post(
        "/predict-video/",
        json={"nome_arquivo": "video.mp4", "orientation": "N"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "iniciado"


def test_orientation_map_endpoint_returns_map():
    """Orientation map endpoint should return mapping with arrow symbols."""
    client = TestClient(app)
    response = client.get("/orientation-map")
    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) == {"N", "E", "S", "W"}
    assert data["N"]["label"] == "North"
    assert data["S"]["arrow"] == "\u2193"
