import logging
import os
import re
import shutil
import uuid
from typing import Optional

from fastapi import APIRouter, File, Header, UploadFile
from fastapi.responses import JSONResponse

from schemas import VideoRequest
from utils.contagem_video import (
    contar_gado_em_video,
    get_line_and_direction_config,
    normalize_bovine_target_classes,
)
from utils.gerenciador_progresso import ProgressoManager
from utils.task_queue import TaskQueue

router = APIRouter()
DATA_DIR = os.getenv("RENDER_DATA_DIR", "data")
UPLOAD_FOLDER = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

progresso_manager = ProgressoManager()

logger = logging.getLogger(__name__)

API_KEY_HEADER_NAME = "X-API-Key"


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "code": code,
            "message": message,
            "request_id": str(uuid.uuid4()),
        },
    )


def _get_expected_api_key() -> str:
    return (os.getenv("BACKEND_API_KEY") or os.getenv("API_KEY") or "").strip()


def _validate_api_key(x_api_key: Optional[str]) -> Optional[JSONResponse]:
    expected_api_key = _get_expected_api_key()
    if not expected_api_key:
        logger.warning(
            "[SECURITY] BACKEND_API_KEY/API_KEY not configured; skipping API key protection."
        )
        return None
    if not x_api_key:
        return _error_response(401, "missing_api_key", "Missing API key.")
    if x_api_key != expected_api_key:
        return _error_response(403, "invalid_api_key", "Invalid API key.")
    return None


def _get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


VIDEO_QUEUE_WORKERS = _get_env_int("VIDEO_QUEUE_WORKERS", 1)
VIDEO_QUEUE_STATE_PATH = os.path.join(DATA_DIR, "video_queue_state.json")
video_queue = TaskQueue(
    name="video-processing",
    max_workers=VIDEO_QUEUE_WORKERS,
    persistence_path=VIDEO_QUEUE_STATE_PATH,
)

# Configurações de upload
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
MAX_FILE_SIZE_MB = 500
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


def _process_video_job(video_name: str, request_payload: dict) -> None:
    try:
        status = progresso_manager.status(video_name)
        if status and status.get("cancelado"):
            logger.info("[QUEUE] Skipping canceled job: %s", video_name)
            return
        resultado = contar_gado_em_video(
            video_path=os.path.join(UPLOAD_FOLDER, video_name),
            video_name=video_name,
            progresso_manager=progresso_manager,
            model_choice=request_payload.get("model_choice"),
            orientation=request_payload.get("orientation"),
            target_classes=request_payload.get("target_classes"),
            line_position_ratio=request_payload.get("line_position_ratio"),
            trim_start_ms=request_payload.get("trim_start_ms"),
            trim_end_ms=request_payload.get("trim_end_ms"),
        )
        if resultado is not None:
            logger.info("[QUEUE] Job finished for: %s", video_name)
            progresso_manager.finalizar(video_name, resultado)
        else:
            logger.info("[QUEUE] Job returned no result for: %s", video_name)
    except Exception as exc:
        logger.exception("[QUEUE] Job failed for %s: %s", video_name, exc)
        progresso_manager.erro(video_name, f"Erro critico na fila: {str(exc)}")
        raise


@router.post("/upload-video/")
async def upload_video_endpoint(
    file: UploadFile = File(...),
    x_api_key: Optional[str] = Header(default=None, alias=API_KEY_HEADER_NAME),
):
    auth_error = _validate_api_key(x_api_key)
    if auth_error:
        return auth_error

    file_extension = os.path.splitext(file.filename)[1].lower()

    if file_extension not in ALLOWED_EXTENSIONS:
        return _error_response(
            400,
            "invalid_file_extension",
            f"Extensão '{file_extension}' não permitida. Use: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE_BYTES:
        return _error_response(
            400,
            "file_too_large",
            f"Arquivo excede o tamanho máximo de {MAX_FILE_SIZE_MB}MB.",
        )

    unique_filename = f"{uuid.uuid4()}{file_extension}"
    temp_local_path = os.path.join(UPLOAD_FOLDER, unique_filename)

    logger.info(
        "[UPLOAD] Recebendo '%s', salvando como '%s'...", file.filename, unique_filename
    )

    try:
        with open(temp_local_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.debug("[UPLOAD] Saved size: %s bytes", os.path.getsize(temp_local_path))
        logger.info("[UPLOAD] Vídeo salvo temporariamente em: %s", temp_local_path)
    except Exception as exc:
        logger.error("[UPLOAD ERRO] Falha ao salvar o arquivo temporariamente: %s", exc)
        return _error_response(
            500,
            "upload_save_failed",
            f"Falha ao salvar o arquivo no servidor: {str(exc)}",
        )

    return {
        "message": f"Arquivo '{file.filename}' recebido com sucesso.",
        "nome_arquivo": unique_filename,
    }


@router.post("/predict-video/")
async def predict_video_endpoint(
    request: VideoRequest,
    x_api_key: Optional[str] = Header(default=None, alias=API_KEY_HEADER_NAME),
):
    auth_error = _validate_api_key(x_api_key)
    if auth_error:
        return auth_error

    video_name_on_server = request.nome_arquivo

    if (
        ".." in video_name_on_server
        or "/" in video_name_on_server
        or "\\" in video_name_on_server
    ):
        return _error_response(400, "invalid_filename", "Nome de arquivo inválido.")

    if not re.fullmatch(r"[\w.-]+", video_name_on_server):
        return _error_response(
            400,
            "invalid_filename_characters",
            "Nome de arquivo contém caracteres inválidos.",
        )

    expected_path = os.path.join(UPLOAD_FOLDER, video_name_on_server)
    abs_path = os.path.abspath(expected_path)
    upload_folder_abs = os.path.abspath(UPLOAD_FOLDER)
    if not abs_path.startswith(upload_folder_abs + os.sep):
        return _error_response(400, "invalid_filename", "Nome de arquivo inválido.")

    try:
        get_line_and_direction_config(request.orientation, 1, 1)
    except ValueError:
        return _error_response(400, "invalid_orientation", "Invalid orientation code.")

    trim_start_ms = request.trim_start_ms
    trim_end_ms = request.trim_end_ms
    if trim_start_ms is not None and trim_end_ms is not None and trim_end_ms <= trim_start_ms:
        return _error_response(400, "invalid_trim_range", "Invalid trim range.")

    if progresso_manager.is_processing(video_name_on_server):
        logger.warning("[PREDICT AVISO] Vídeo %s já está sendo processado.", video_name_on_server)
        return JSONResponse(
            status_code=409,
            content={
                "status": "em_processamento",
                "message": "Este vídeo já está sendo processado.",
            },
        )

    progresso_manager.iniciar(video_name_on_server)

    request_payload = {
        "model_choice": request.model_choice,
        "orientation": request.orientation,
        "target_classes": normalize_bovine_target_classes(request.target_classes),
        "line_position_ratio": request.line_position_ratio,
        "trim_start_ms": trim_start_ms,
        "trim_end_ms": trim_end_ms,
    }

    job, _ = video_queue.enqueue(
        video_name_on_server, _process_video_job, video_name_on_server, request_payload
    )
    queue_position = video_queue.position(video_name_on_server)
    queue_status = job.status
    queue_size = video_queue.queued_count()

    return {
        "status": "iniciado",
        "message": f"Processamento para '{video_name_on_server}' iniciado.",
        "video_name": video_name_on_server,
        "queue_position": queue_position,
        "queue_status": queue_status,
        "queue_size": queue_size,
    }


@router.get("/progresso/{video_name}")
async def progresso_endpoint(
    video_name: str,
    x_api_key: Optional[str] = Header(default=None, alias=API_KEY_HEADER_NAME),
):
    auth_error = _validate_api_key(x_api_key)
    if auth_error:
        return auth_error

    status = progresso_manager.status(video_name)
    job = video_queue.get(video_name)
    if job:
        status["queue_position"] = video_queue.position(video_name)
        status["queue_status"] = job.status
        status["queue_size"] = video_queue.queued_count()
    return status


@router.get("/cancelar-processamento/{video_name}")
async def cancelar_endpoint(
    video_name: str,
    x_api_key: Optional[str] = Header(default=None, alias=API_KEY_HEADER_NAME),
):
    auth_error = _validate_api_key(x_api_key)
    if auth_error:
        return auth_error

    queue_cancelled = video_queue.cancel(video_name)
    db_cancelled = progresso_manager.cancelar(video_name)
    if db_cancelled or queue_cancelled:
        return {"message": f"Solicitação de cancelamento para {video_name} enviada."}
    return {
        "message": f"Não foi possível cancelar ou o processo para {video_name} não está ativo."
    }
