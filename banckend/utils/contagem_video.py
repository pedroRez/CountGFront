from __future__ import annotations

import logging
import os
import subprocess
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# --- Constantes para Clareza ---
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
LINE_HORIZONTAL: str = "horizontal"
LINE_VERTICAL: str = "vertical"
MOVE_TB: str = "top_bottom"
MOVE_BT: str = "bottom_top"
MOVE_LR: str = "left_right"
MOVE_RL: str = "right_left"


def _get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def get_video_rotation(video_path: str) -> int:
    """Retrieve rotation metadata / Obtém metadados de rotação.

    English:
        Runs ``ffprobe`` to read the ``rotate`` tag from the first video
        stream. Returns the rotation angle in degrees (0, 90, 180 or 270).

    Português:
        Executa ``ffprobe`` para ler a tag ``rotate`` do primeiro stream de
        vídeo. Retorna o ângulo de rotação em graus (0, 90, 180 ou 270).
    """

    try:
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream_tags=rotate",
            "-of",
            "default=nw=1:nk=1",
            video_path,
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        rotation = int(result.stdout.strip())
        return rotation % 360
    except Exception as e:  # pragma: no cover - fallback in case of failure
        logger.debug("Rotation metadata not found or ffprobe failed: %s", e)
        return 0


def apply_rotation(frame: np.ndarray, rotation: int) -> np.ndarray:
    """Rotate frame according to metadata / Rotaciona frame de acordo com metadados.

    English:
        Rotates the frame using OpenCV based on the rotation angle.

    Português:
        Rotaciona o frame utilizando OpenCV conforme o ângulo informado.
    """

    if rotation == 90:
        return cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    if rotation == 180:
        return cv2.rotate(frame, cv2.ROTATE_180)
    if rotation == 270:
        return cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return frame


def get_line_and_direction_config(
    orientation_code: str, width: int, height: int, line_ratio: float = 0.5
) -> Tuple[
    Optional[str], Optional[str], Optional[Tuple], Optional[int], Optional[Tuple]
]:
    """Determina tipo de linha, posição e direção com base na orientação.

    Determine the line type, its position and the movement direction from an
    orientation code.

    Parâmetros / Parameters:
        orientation_code (str): Código da orientação (``"N"``, ``"E"``,
            ``"S"`` ou ``"W"``).
            Orientation code, must be one of ``"N"``, ``"E"``, ``"S"`` or
            ``"W"``.
        width (int): Largura do frame do vídeo.
            Video frame width.
        height (int): Altura do frame do vídeo.
            Video frame height.
        line_ratio (float, opcional): Posição relativa da linha dentro do
            frame, variando de ``0`` a ``1``. Relative position of the line in
            the frame, ranging from ``0`` to ``1``.

    Retorno / Returns:
        tuple: ``(line_type, direction, line_points, line_pos_value,
        arrow_points)`` contendo o tipo e a orientação da linha.
        Tuple describing line type and orientation as
        ``(line_type, direction, line_points, line_pos_value, arrow_points)``.

    Efeitos colaterais / Side Effects:
        Nenhum.
        None.

    Exceções / Exceptions:
        ValueError: Lançada quando ``orientation_code`` não está entre
            ``"N"``, ``"E"``, ``"S"`` ou ``"W"``.
        ValueError: Raised when ``orientation_code`` is not one of
            ``"N"``, ``"E"``, ``"S"`` or ``"W"``.
    """
    (
        line_type,
        effective_counting_direction,
        line_points,
        line_pos_value,
        arrow_points,
    ) = (None, None, None, None, None)
    orientation_code = str(orientation_code).upper()
    arrow_offset = 60

    if orientation_code not in {"N", "E", "S", "W"}:
        msg = (
            f"[AVISO get_line_config] Orientação '{orientation_code}' inválida. "
            "Use apenas N, E, S ou W."
        )
        logger.warning(msg)
        raise ValueError(msg)

    if orientation_code == "S":
        line_type, effective_counting_direction = LINE_HORIZONTAL, MOVE_TB
        line_pos_value = int(height * line_ratio)
        line_points = ((0, line_pos_value), (width, line_pos_value))
        arrow_points = (
            (width // 2, line_pos_value - arrow_offset),
            (width // 2, line_pos_value + arrow_offset),
        )
    elif orientation_code == "N":
        line_type, effective_counting_direction = LINE_HORIZONTAL, MOVE_BT
        line_pos_value = int(height * line_ratio)
        line_points = ((0, line_pos_value), (width, line_pos_value))
        arrow_points = (
            (width // 2, line_pos_value + arrow_offset),
            (width // 2, line_pos_value - arrow_offset),
        )
    elif orientation_code == "E":
        line_type, effective_counting_direction = LINE_VERTICAL, MOVE_LR
        line_pos_value = int(width * line_ratio)
        line_points = ((line_pos_value, 0), (line_pos_value, height))
        arrow_points = (
            (line_pos_value - arrow_offset, height // 2),
            (line_pos_value + arrow_offset, height // 2),
        )
    else:  # orientation_code == "W"
        line_type, effective_counting_direction = LINE_VERTICAL, MOVE_RL
        line_pos_value = int(width * line_ratio)
        line_points = ((line_pos_value, 0), (line_pos_value, height))
        arrow_points = (
            (line_pos_value + arrow_offset, height // 2),
            (line_pos_value - arrow_offset, height // 2),
        )

    logger.debug(
        f"[get_line_config] Para '{orientation_code}': tipo={line_type}, dir={effective_counting_direction}"
    )
    return (
        line_type,
        effective_counting_direction,
        line_points,
        line_pos_value,
        arrow_points,
    )

def contar_gado_em_video(
    video_path: str,
    video_name: str,
    progresso_manager: Any,
    model_choice: str = "l",
    frame_skip: int = 1,
    orientation: str = "S",
    target_classes: Optional[List[str]] = None,
    line_position_ratio: float = 0.5,
    trim_start_ms: Optional[int] = None,
    trim_end_ms: Optional[int] = None,
    status_check_interval: int = 30,
    cancel_callback: Optional[Callable[[], bool]] = None,
) -> Optional[Dict[str, Any]]:
    """Realiza a contagem de gado em um arquivo de vídeo.

    Count cattle in a video file. Frames are rotated according to rotation
    metadata before processing.

    Os frames são rotacionados conforme metadados de rotação antes do
    processamento.

    Parâmetros / Parameters:
        video_path (str): Caminho local para o vídeo.
            Local path to the video file.
        video_name (str): Nome do vídeo usado para logs e SFTP.
            Video name used for logs and SFTP operations.
        progresso_manager (Any): Instância que gerencia o progresso de
            processamento. Instance that manages processing progress.
        model_choice (str, opcional): Variante do modelo YOLO a ser usada
            (``"n"``, ``"m"``, ``"l"`` ou ``"p"``). YOLO model variant to use.
        frame_skip (int, opcional): Número de frames a pular entre análises.
            Number of frames skipped between analyses.
        orientation (str, opcional): Código da orientação da linha de
            contagem. Line orientation code.
        target_classes (List[str], opcional): Classes de interesse para
            detecção. Target classes for detection.
        line_position_ratio (float): Posição relativa da linha de
            contagem. Relative position of the counting line.
        trim_start_ms (int, opcional): Inicio do corte em milissegundos.
            Trim start in milliseconds.
        trim_end_ms (int, opcional): Fim do corte em milissegundos.
            Trim end in milliseconds.
        status_check_interval (int, opcional): Intervalo em segundos para
            verificar cancelamentos. Interval in seconds to check for
            cancellation requests.
        cancel_callback (Callable, opcional): Função que retorna ``True``
            quando o processamento deve ser cancelado. Callback returning
            ``True`` when the process should be cancelled.

    Retorno / Returns:
        dict | None: Dicionário com estatísticas da contagem ou ``None`` em
        caso de erro ou cancelamento.
        Dictionary with counting statistics or ``None`` if an error or
        cancellation occurs.

    Efeitos colaterais / Side Effects:
        Pode enviar e deletar arquivos via SFTP, atualizar o progresso no
        banco de dados e gerar vídeos anotados.
        May upload/delete files over SFTP, update database progress and
        generate annotated videos.

    Exceções / Exceptions:
        Erros são capturados internamente; em caso de falha a função retorna
        ``None`` e registra o erro.
        Exceptions are handled internally; on failure ``None`` is returned and
        the error is logged.
    """

    USE_SFTP = os.getenv("USE_SFTP", "false").lower() == "true"
    if USE_SFTP:
        try:
            from utils.sftp_handler import delete_file_sftp, upload_file_sftp
        except Exception as exc:  # pragma: no cover - log path
            logger.warning(
                f"[CONFIG] Módulo SFTP não disponível ({exc}). Continuando sem SFTP."
            )
            USE_SFTP = False
    CREATE_ANNOTATED_VIDEO = (
        os.getenv("CREATE_ANNOTATED_VIDEO", "false").lower() == "true"
    )

    logger.info(f"[CONFIG] Modo SFTP Ativado: {USE_SFTP}")
    logger.info(f"[CONFIG] Gerar Vídeo Anotado: {CREATE_ANNOTATED_VIDEO}")

    sftp_current_action = ""

    def sftp_progress_callback(bytes_transferred: int, total_bytes: int):
        if total_bytes > 0:
            percentage = (bytes_transferred / total_bytes) * 100
            status_message = f"{sftp_current_action}: {percentage:.0f}%"
            progresso_manager.update_status_message(video_name, status_message)

    local_video_path = video_path
    if not os.path.exists(local_video_path):
        error_msg = f"Arquivo de vídeo local não encontrado em '{local_video_path}'. O upload inicial pode ter falhado."
        if progresso_manager:
            progresso_manager.erro(video_name, error_msg)
        return None

    remote_video_original = f"public_html/kyoday_videos/uploads/{video_name}"
    if USE_SFTP:
        sftp_current_action = "Enviando p/ Servidor"
        if not upload_file_sftp(
            local_video_path,
            remote_video_original,
            progress_callback=sftp_progress_callback,
        ):
            error_msg = "Falha ao enviar o vídeo original para a HostGator."
            if progresso_manager:
                progresso_manager.erro(video_name, error_msg)
            if os.path.exists(local_video_path):
                os.remove(local_video_path)
            return None
    else:
        progresso_manager.update_status_message(
            video_name, "Iniciando processamento..."
        )

    model_files = {
        "n": "yolov8n.pt",
        "m": "yolov8m.pt",
        "l": "yolov8l.pt",
        "p": "best.pt",
    }
    actual_model_path = model_files.get(str(model_choice).lower(), "yolov8l.pt")

    try:
        model = YOLO(actual_model_path)
    except Exception as e:
        if progresso_manager:
            progresso_manager.erro(video_name, f"Falha ao carregar modelo: {e}")
        return None

    cap = cv2.VideoCapture(local_video_path)
    if not cap.isOpened():
        if progresso_manager:
            progresso_manager.erro(video_name, "Falha ao abrir o arquivo de vídeo.")
        return None

    rotation = get_video_rotation(local_video_path)
    total_frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    _fps = fps if fps > 0 else 30.0
    imgsz = _get_env_int("YOLO_IMG_SIZE", 512)
    if imgsz <= 0:
        imgsz = 512
    logger.info(f"[CONFIG] YOLO imgsz: {imgsz}")

    start_frame = 0
    end_frame = max(total_frame_count - 1, 0) if total_frame_count > 0 else 0
    if trim_start_ms is not None:
        start_frame = int((_fps * max(trim_start_ms, 0)) / 1000)
    if trim_end_ms is not None:
        end_frame = int((_fps * max(trim_end_ms, 0)) / 1000)

    if total_frame_count > 0:
        start_frame = min(max(start_frame, 0), total_frame_count - 1)
        end_frame = min(max(end_frame, start_frame), total_frame_count - 1)
    else:
        start_frame = max(start_frame, 0)
        end_frame = max(end_frame, start_frame)

    trimmed_frame_count = end_frame - start_frame + 1
    if trimmed_frame_count <= 0:
        if progresso_manager:
            progresso_manager.erro(video_name, 'Intervalo de corte invalido.')
        cap.release()
        return None

    if start_frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    original_frame_count = trimmed_frame_count
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if rotation in (90, 270):
        width, height = height, width

    if width == 0 or height == 0:
        if progresso_manager:
            progresso_manager.erro(video_name, "Dimensões do vídeo inválidas.")
        cap.release()
        return None

    if line_position_ratio is None:
        line_position_ratio = 0.5

    line_type, effective_counting_dir, line_points, line_coord_val, arrow_points = (
        get_line_and_direction_config(orientation, width, height, line_position_ratio)
    )

    if line_points is None:
        if progresso_manager:
            progresso_manager.erro(
                video_name,
                f"Configuração de linha inválida para orientação '{orientation}'.",
            )
        cap.release()
        return None

    current_total_count = 0
    current_por_classe = defaultdict(int)
    track_ids_contados = set()
    track_previous_x = {}
    track_previous_y = {}

    out = None
    local_output_path = ""
    processed_fn = ""
    if CREATE_ANNOTATED_VIDEO:
        output_dir_name = (
            "videos_processados_temp" if USE_SFTP else "videos_processados"
        )
        output_dir_local = os.path.join(BASE_DIR, output_dir_name)
        os.makedirs(output_dir_local, exist_ok=True)
        base_name, vid_ext = os.path.splitext(video_name)
        processed_fn = f"processed_{base_name}{vid_ext}"
        local_output_path = os.path.join(output_dir_local, processed_fn)
        try:
            out = cv2.VideoWriter(
                local_output_path,
                cv2.VideoWriter_fourcc(*"mp4v"),
                _fps,
                (width, height),
            )
            if not out.isOpened():
                raise IOError(f"VideoWriter falhou para {local_output_path}")
        except Exception as e:
            if progresso_manager:
                progresso_manager.erro(video_name, f"VideoWriter: {e}")
            cap.release()
            return None

    frame_atual = 0
    cancelado_cache = False
    last_status_check_frame = -status_check_interval
    while cap.isOpened() and frame_atual < original_frame_count:
        if cancel_callback:
            cancelado_cache = cancel_callback()
        elif frame_atual - last_status_check_frame >= status_check_interval:
            cancelado_cache = progresso_manager.status(video_name).get("cancelado")
            last_status_check_frame = frame_atual
        if cancelado_cache:
            break
        ret, frame = cap.read()
        if not ret:
            break

        if rotation:
            frame = apply_rotation(frame, rotation)

        if frame_atual % frame_skip == 0:
            if not progresso_manager.atualizar(
                video_name, frame_atual, original_frame_count
            ):
                break

            try:
                results = model.track(
                    frame, persist=True, verbose=False, conf=0.3, imgsz=imgsz
                )
            except RuntimeError as exc:
                if "not enough memory" in str(exc).lower():
                    if progresso_manager:
                        progresso_manager.erro(
                            video_name,
                            "Memoria insuficiente para processar o video. Use modelo menor (n/m) ou reduza YOLO_IMG_SIZE.",
                        )
                    if cap.isOpened():
                        cap.release()
                    if out and out.isOpened():
                        out.release()
                    return None
                raise

            annotated_frame = frame.copy() if CREATE_ANNOTATED_VIDEO else None
            if results[0].boxes is not None and results[0].boxes.id is not None:
                current_tracked_ids = set(results[0].boxes.id.cpu().numpy().astype(int))
                for r_id, cls_id, box_coord in zip(
                    current_tracked_ids,
                    results[0].boxes.cls.cpu().numpy(),
                    results[0].boxes.xyxy.cpu().numpy(),
                ):
                    track_id = int(r_id)
                    x1, y1, x2, y2 = map(int, box_coord)
                    curr_x, curr_y = (x1 + x2) // 2, (y1 + y2) // 2
                    nome_cls = model.names[int(cls_id)]

                    if track_id not in track_ids_contados:
                        crossed = False
                        has_prev_pos = (
                            track_id in track_previous_x
                            and track_id in track_previous_y
                        )
                        if (
                            line_type == LINE_HORIZONTAL
                            and has_prev_pos
                            and line_coord_val is not None
                        ):
                            prev_y = track_previous_y[track_id]
                            if (
                                effective_counting_dir == MOVE_TB
                                and prev_y < line_coord_val
                                and curr_y >= line_coord_val
                            ) or (
                                effective_counting_dir == MOVE_BT
                                and prev_y > line_coord_val
                                and curr_y <= line_coord_val
                            ):
                                crossed = True
                        elif (
                            line_type == LINE_VERTICAL
                            and has_prev_pos
                            and line_coord_val is not None
                        ):
                            prev_x = track_previous_x[track_id]
                            if (
                                effective_counting_dir == MOVE_LR
                                and prev_x < line_coord_val
                                and curr_x >= line_coord_val
                            ) or (
                                effective_counting_dir == MOVE_RL
                                and prev_x > line_coord_val
                                and curr_x <= line_coord_val
                            ):
                                crossed = True
                        if crossed and (
                            target_classes is None or nome_cls in target_classes
                        ):
                            track_ids_contados.add(track_id)
                            current_total_count += 1
                            current_por_classe[nome_cls] += 1

                    track_previous_x[track_id], track_previous_y[track_id] = (
                        curr_x,
                        curr_y,
                    )
                    if CREATE_ANNOTATED_VIDEO and annotated_frame is not None:
                        color = (
                            (0, 165, 255)
                            if track_id in track_ids_contados
                            else (
                                (200, 200, 200)
                                if target_classes and nome_cls not in target_classes
                                else (0, 255, 0)
                            )
                        )
                        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(
                            annotated_frame,
                            f"{nome_cls} ID:{track_id}",
                            (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.6,
                            color,
                            2,
                        )

            for tid_set in [track_previous_x, track_previous_y]:
                for tid in list(tid_set.keys()):
                    if tid not in current_tracked_ids:
                        del tid_set[tid]

            if (
                CREATE_ANNOTATED_VIDEO
                and out is not None
                and annotated_frame is not None
            ):
                if line_points:
                    cv2.line(
                        annotated_frame, line_points[0], line_points[1], (0, 0, 255), 3
                    )
                if arrow_points:
                    cv2.arrowedLine(
                        annotated_frame,
                        arrow_points[0],
                        arrow_points[1],
                        (0, 255, 0),
                        2,
                        tipLength=0.4,
                    )
                info_txt = f"Contagem: {current_total_count}"
                cv2.putText(
                    annotated_frame,
                    info_txt,
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    (0, 0, 0),
                    3,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    annotated_frame,
                    info_txt,
                    (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    (255, 255, 255),
                    2,
                    cv2.LINE_AA,
                )
                out.write(annotated_frame)
        frame_atual += 1

    if cap.isOpened():
        cap.release()
    if out and out.isOpened():
        out.release()

    cancelado_final = cancelado_cache
    if progresso_manager and not cancelado_final:
        cancelado_final = progresso_manager.status(video_name).get("cancelado")
    if cancelado_final:
        if os.path.exists(local_video_path):
            os.remove(local_video_path)
        if CREATE_ANNOTATED_VIDEO and os.path.exists(local_output_path):
            os.remove(local_output_path)
        return None

    public_url = "Vídeo processado não foi gerado (opção desabilitada)."
    if CREATE_ANNOTATED_VIDEO:
        if USE_SFTP:
            sftp_current_action = "Enviando resultado"
            remote_processed_path = (
                f"public_html/kyoday_videos/processados/{processed_fn}"
            )
            if upload_file_sftp(
                local_output_path,
                remote_processed_path,
                progress_callback=sftp_progress_callback,
            ):
                base_url = os.getenv("HG_DOMAIN")
                public_url = (
                    f"{base_url}/kyoday_videos/processados/{processed_fn}"
                    if base_url
                    else "ERRO: HG_DOMAIN não configurado"
                )
            else:
                public_url = "ERRO AO FAZER UPLOAD DO VÍDEO PROCESSADO"
                if progresso_manager:
                    progresso_manager.erro(video_name, public_url)
        else:
            # Store the processed video locally and expose it via the static mount.
            public_url = f"/videos_processados/{processed_fn}"
            logger.info(f"[INFO] Processed video saved at {local_output_path}.")

    if USE_SFTP:
        if CREATE_ANNOTATED_VIDEO and os.path.exists(local_output_path):
            os.remove(local_output_path)
    if os.path.exists(local_video_path):
        os.remove(local_video_path)
    if USE_SFTP:
        delete_file_sftp(remote_video_original)

    logger.info(
        f"[INFO CONTAGEM] Contagem finalizada: {current_total_count} para {video_name}"
    )

    return {
        "video": video_name,
        "video_processado": public_url,
        "total_frames": original_frame_count,
        "total_count": current_total_count,
        "por_classe": dict(current_por_classe),
    }
