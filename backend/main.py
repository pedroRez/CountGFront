import logging
import os

from dotenv import load_dotenv

# any other module that uses these variables.
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routes import orientation_routes, video_routes

# --- CRITICAL STEP: LOAD ENVIRONMENT VARIABLES FIRST! ---
# This call must be one of the first lines of your entry point before importing


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# Create the FastAPI application instance
app = FastAPI(
    title="CountG API",
    version="0.1.0",
    description="FastAPI backend for counting and tracking objects in video.",
)


BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROCESSED_VIDEOS_DIR = os.getenv("PROCESSED_VIDEOS_DIR")
if PROCESSED_VIDEOS_DIR:
    PROCESSED_VIDEOS_DIR = os.path.abspath(PROCESSED_VIDEOS_DIR)
else:
    PROCESSED_VIDEOS_DIR = os.path.abspath(os.path.join(BASE_DIR, "videos_processados"))
logger.info("[CONFIG] Processed videos dir: %s", PROCESSED_VIDEOS_DIR)
os.makedirs(PROCESSED_VIDEOS_DIR, exist_ok=True)
app.mount(
    "/videos_processados",
    StaticFiles(directory=PROCESSED_VIDEOS_DIR),
    name="videos_processados",
)


def _is_production_env(env_value: str | None) -> bool:
    normalized = (env_value or "").strip().lower()
    return normalized in {"prod", "production"}


def _parse_allowed_origins(raw_origins: str | None) -> list[str]:
    if not raw_origins:
        return []
    values = [origin.strip() for origin in raw_origins.split(",")]
    return [origin for origin in values if origin]


backend_env = os.getenv("BACKEND_ENV", "development")
allowed_origins = _parse_allowed_origins(os.getenv("CORS_ALLOWED_ORIGINS"))

if _is_production_env(backend_env):
    if "*" in allowed_origins:
        logger.warning(
            "[CORS] Ignoring '*' origin in production. Set explicit CORS_ALLOWED_ORIGINS."
        )
        allowed_origins = [origin for origin in allowed_origins if origin != "*"]
    logger.info("[CORS] Production mode enabled. Origins: %s", allowed_origins)
else:
    if not allowed_origins:
        allowed_origins = ["*"]
    logger.info("[CORS] Development mode enabled. Origins: %s", allowed_origins)

# CORS configuration (allows frontend to communicate with backend)
# Allows a React Native app (running on a different origin) to talk to the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Include routes from video_routes.py
app.include_router(video_routes.router)
app.include_router(orientation_routes.router)


# Root endpoint for health check
@app.get("/")
def read_root():
    """Health check endpoint / Endpoint de verificação de saúde.

    English:
        Provides a quick indication that the backend is running and reports
        whether the ``DATABASE_URL`` environment variable has been loaded.
        ``database_url_loaded`` is ``True`` when ``DATABASE_URL`` is set,
        otherwise ``False``.

    Português:
        Fornece uma indicação rápida de que o backend está ativo e informa
        se a variável de ambiente ``DATABASE_URL`` foi carregada.
        ``database_url_loaded`` é ``True`` quando ``DATABASE_URL`` está definida,
        caso contrário ``False``.

    Example/Exemplo:
        {
            "status": "KYO DAY Backend is running!",
            "database_url_loaded": true
        }
    """
    db_url_loaded = bool(os.getenv("DATABASE_URL"))
    logger.debug("Root endpoint accessed; DATABASE_URL loaded: %s", db_url_loaded)
    return {
        "status": "KYO DAY Backend is running!",
        "database_url_loaded": db_url_loaded,
    }


# Remember to run:
# uvicorn main:app --host 0.0.0.0 --port 8000 --reload
