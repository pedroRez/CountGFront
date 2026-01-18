import logging
import os
import re
import shutil
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from schemas import VideoRequest
from utils.contagem_video import contar_gado_em_video, get_line_and_direction_config
from utils.gerenciador_progresso import ProgressoManager
from utils.task_queue import TaskQueue

router = APIRouter()
DATA_DIR = os.getenv("RENDER_DATA_DIR", "data")
UPLOAD_FOLDER = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

progresso_manager = ProgressoManager()

logger = logging.getLogger(__name__)


def _get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


VIDEO_QUEUE_WORKERS = _get_env_int("VIDEO_QUEUE_WORKERS", 1)
video_queue = TaskQueue(name="video-processing", max_workers=VIDEO_QUEUE_WORKERS)

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
async def upload_video_endpoint(file: UploadFile = File(...)):
    """Português:
        Recebe um vídeo do frontend, valida e salva temporariamente no servidor.

        Parâmetros:
            file (UploadFile): vídeo enviado pelo cliente.

        Retorna:
            dict: mensagem de sucesso e o nome único gerado para o vídeo.

        Exemplo:
            >>> curl -X POST -F "file=@meu_video.mp4" \\
            ...     http://localhost:8000/upload-video/

    English:
        Receives a video from the frontend, validates it and stores it temporarily.

        Parameters:
            file (UploadFile): video provided by the client.

        Returns:
            dict: success message and the unique server-side filename.

        Example:
            >>> curl -X POST -F "file=@my_video.mp4" \\
            ...     http://localhost:8000/upload-video/
    """
    file_extension = os.path.splitext(file.filename)[1].lower()

    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extensão '{file_extension}' não permitida. Use: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo excede o tamanho máximo de {MAX_FILE_SIZE_MB}MB.",
        )

    unique_filename = f"{uuid.uuid4()}{file_extension}"
    temp_local_path = os.path.join(UPLOAD_FOLDER, unique_filename)

    logger.info(
        f"[UPLOAD] Recebendo '{file.filename}', salvando como '{unique_filename}'..."
    )

    try:
        with open(temp_local_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.debug(
            f"[UPLOAD] Saved size: {os.path.getsize(temp_local_path)} bytes"
        )
        logger.info(f"[UPLOAD] Vídeo salvo temporariamente em: {temp_local_path}")
    except Exception as e:
        logger.error(f"[UPLOAD ERRO] Falha ao salvar o arquivo temporariamente: {e}")
        raise HTTPException(
            status_code=500, detail=f"Falha ao salvar o arquivo no servidor: {str(e)}"
        )

    # O upload para a HostGator e a limpeza foram movidos para dentro de 'contar_gado_em_video'.
    # Este endpoint agora é muito mais rápido e simples.

    return {
        "message": f"Arquivo '{file.filename}' recebido com sucesso.",
        "nome_arquivo": unique_filename,  # Retorna o nome único usado no servidor
    }


@router.post("/predict-video/")
async def predict_video_endpoint(request: VideoRequest):
    """Português:
        Inicia o processamento de um vídeo previamente enviado para contar o gado.

        Parâmetros:
            request (VideoRequest): dados do vídeo e opções de processamento.

        Retorna:
            dict: status indicando que o processamento foi iniciado.

        Exemplo:
            >>> curl -X POST -H "Content-Type: application/json" \\
            ...     -d '{"nome_arquivo":"video.mp4"}' \\
            ...     http://localhost:8000/predict-video/

    English:
        Starts cattle counting for a previously uploaded video.

        Parameters:
            request (VideoRequest): video data and processing options.

        Returns:
            dict: status informing that processing has begun.

        Example:
            >>> curl -X POST -H "Content-Type: application/json" \\
            ...     -d '{"nome_arquivo":"video.mp4"}' \\
            ...     http://localhost:8000/predict-video/
    """
    video_name_on_server = request.nome_arquivo

    # Validação do nome do arquivo para evitar path traversal e caracteres inválidos
    if (
        ".." in video_name_on_server
        or "/" in video_name_on_server
        or "\\" in video_name_on_server
    ):
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")

    if not re.fullmatch(r"[\w.-]+", video_name_on_server):
        raise HTTPException(
            status_code=400, detail="Nome de arquivo contém caracteres inválidos."
        )

    expected_path = os.path.join(UPLOAD_FOLDER, video_name_on_server)
    abs_path = os.path.abspath(expected_path)
    upload_folder_abs = os.path.abspath(UPLOAD_FOLDER)
    if not abs_path.startswith(upload_folder_abs + os.sep):
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")

    try:
        get_line_and_direction_config(request.orientation, 1, 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid orientation code.")

    trim_start_ms = request.trim_start_ms
    trim_end_ms = request.trim_end_ms
    if trim_start_ms is not None and trim_end_ms is not None:
        if trim_end_ms <= trim_start_ms:
            raise HTTPException(status_code=400, detail="Invalid trim range.")

    if progresso_manager.is_processing(video_name_on_server):
        logger.warning(
            f"[PREDICT AVISO] Vídeo {video_name_on_server} já está sendo processado."
        )
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
        "target_classes": request.target_classes,
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
async def progresso_endpoint(video_name: str):
    """Português:
        Consulta o progresso do processamento de um vídeo.

        Parâmetros:
            video_name (str): nome do arquivo do vídeo no servidor.

        Retorna:
            dict: dados de status e porcentagem de conclusão.

        Exemplo:
            >>> curl http://localhost:8000/progresso/video.mp4

    English:
        Retrieves the processing progress for a video.

        Parameters:
            video_name (str): name of the video file on the server.

        Returns:
            dict: status data including completion percentage.

        Example:
            >>> curl http://localhost:8000/progresso/video.mp4
    """
    status = progresso_manager.status(video_name)
    job = video_queue.get(video_name)
    if job:
        status["queue_position"] = video_queue.position(video_name)
        status["queue_status"] = job.status
        status["queue_size"] = video_queue.queued_count()
    return status


@router.get("/cancelar-processamento/{video_name}")
async def cancelar_endpoint(video_name: str):
    """Português:
        Solicita o cancelamento do processamento de um vídeo.

        Parâmetros:
            video_name (str): nome do arquivo do vídeo no servidor.

        Retorna:
            dict: mensagem indicando se o cancelamento foi enviado.

        Exemplo:
            >>> curl http://localhost:8000/cancelar-processamento/video.mp4

    English:
        Requests cancellation of video processing.

        Parameters:
            video_name (str): name of the video file on the server.

        Returns:
            dict: message stating whether cancellation was issued.

        Example:
            >>> curl http://localhost:8000/cancelar-processamento/video.mp4
    """
    queue_cancelled = video_queue.cancel(video_name)
    db_cancelled = progresso_manager.cancelar(video_name)
    if db_cancelled or queue_cancelled:
        return {"message": f"Solicitação de cancelamento para {video_name} enviada."}
    return {
        "message": f"Não foi possível cancelar ou o processo para {video_name} não está ativo."
    }
