import logging
import os
import re
import shutil
import threading
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from schemas import VideoRequest
from utils.contagem_video import contar_gado_em_video
from utils.gerenciador_progresso import ProgressoManager

router = APIRouter()
DATA_DIR = os.getenv("RENDER_DATA_DIR", "data")
UPLOAD_FOLDER = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

progresso_manager = ProgressoManager()
processos_em_andamento = {}

logger = logging.getLogger(__name__)

# Configurações de upload
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv"}
MAX_FILE_SIZE_MB = 500
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


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

    # --- FUNÇÃO DA THREAD CORRIGIDA ---
    def processamento_em_thread():
        try:
            logger.info(
                f"[THREAD] Iniciando a chamada para contar_gado_em_video para: {video_name_on_server}"
            )

            # Chama a função de contagem e armazena o resultado retornado
            resultado = contar_gado_em_video(
                video_path=os.path.join(UPLOAD_FOLDER, video_name_on_server),
                video_name=video_name_on_server,
                progresso_manager=progresso_manager,
                model_choice=request.model_choice,
                orientation=request.orientation,
                target_classes=request.target_classes,
                line_position_ratio=request.line_position_ratio,
            )

            # Se 'resultado' não for None (ou seja, o processamento foi bem-sucedido e não foi cancelado)...
            if resultado is not None:
                # ...chama .finalizar() para atualizar o banco de dados com os resultados.
                logger.info(
                    "[THREAD] contagem_video returned a result. Finalizing progress in the database..."
                )
                progresso_manager.finalizar(video_name_on_server, resultado)
            else:
                # Se resultado for None, o erro ou cancelamento já foi tratado dentro de contar_gado_em_video
                # e o status no banco de dados já foi atualizado para finalizado=True.
                logger.info(
                    "[THREAD] contagem_video returned None. Status should already be error or canceled."
                )

        except Exception as e:
            logger.exception(
                f"[THREAD ERRO FATAL] Um erro inesperado ocorreu na thread para {video_name_on_server}: {e}"
            )
            progresso_manager.erro(
                video_name_on_server, f"Erro crítico na thread: {str(e)}"
            )
        finally:
            # Remover referência à thread após o término para liberar memória
            processos_em_andamento.pop(video_name_on_server, None)

    thread = threading.Thread(target=processamento_em_thread, daemon=True)
    thread.start()
    processos_em_andamento[video_name_on_server] = thread

    return {
        "status": "iniciado",
        "message": f"Processamento para '{video_name_on_server}' iniciado.",
        "video_name": video_name_on_server,
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
    return progresso_manager.status(video_name)


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
    if progresso_manager.cancelar(video_name):
        return {"message": f"Solicitação de cancelamento para {video_name} enviada."}
    return {
        "message": f"Não foi possível cancelar ou o processo para {video_name} não está ativo."
    }
