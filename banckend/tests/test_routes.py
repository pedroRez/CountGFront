"""Testes das rotas de upload de vídeo.

O objetivo é confirmar que a API recusa arquivos com extensões inválidas e aceita
vídeos com extensões permitidas.

Tests for the video upload routes.

The goal is to confirm the API rejects files with invalid extensions and
accepts videos with permitted extensions.
"""

import os
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.video_routes import router

app = FastAPI()
app.include_router(router)


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
