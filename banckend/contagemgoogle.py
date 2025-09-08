# Célula 2: Código de Processamento
import logging
import os
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# --- Funções auxiliares (copiadas do seu projeto) ---
LINE_HORIZONTAL, LINE_VERTICAL = "horizontal", "vertical"
MOVE_TB, MOVE_BT, MOVE_LR, MOVE_RL = (
    "top_bottom",
    "bottom_top",
    "left_right",
    "right_left",
)


def get_line_and_direction_config(
    orientation_code: str, width: int, height: int, line_ratio: float = 0.5
):
    orientation_code = str(orientation_code).upper()
    line_pos_value = int(
        (height if orientation_code in ["N", "S"] else width) * line_ratio
    )
    if orientation_code in ["N", "S"]:
        return (
            LINE_HORIZONTAL,
            MOVE_BT if orientation_code == "N" else MOVE_TB,
            ((0, line_pos_value), (width, line_pos_value)),
            line_pos_value,
        )
    else:  # E, W, ou padrão
        return (
            LINE_VERTICAL,
            MOVE_LR if orientation_code == "E" else MOVE_RL,
            ((line_pos_value, 0), (line_pos_value, height)),
            line_pos_value,
        )


def contar_gado_colab(video_path: str, model_path: str, orientation: str):
    logger.info(f"Iniciando processamento para o vídeo: {video_path}")
    logger.info(f"Usando modelo: {model_path}")

    try:
        model = YOLO(model_path)
        logger.info("Modelo YOLO carregado com sucesso.")
    except Exception as e:
        logger.error(f"ERRO: Falha ao carregar o modelo: {e}")
        return

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"ERRO: Não foi possível abrir o vídeo em {video_path}")
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    line_type, counting_direction, line_points, line_coord = (
        get_line_and_direction_config(orientation, width, height)
    )

    # Preparando o vídeo de saída
    output_filename = f"processed_{os.path.basename(video_path)}"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(output_filename, fourcc, fps, (width, height))

    track_history = defaultdict(list)
    counted_ids = set()
    total_count = 0
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        results = model.track(frame, persist=True, verbose=False, conf=0.3)

        if results[0].boxes is not None and results[0].boxes.id is not None:
            boxes = results[0].boxes.xywh.cpu()
            track_ids = results[0].boxes.id.int().cpu().tolist()

            for box, track_id in zip(boxes, track_ids):
                x, y, w, h = box
                center_x, center_y = int(x), int(y)
                track = track_history[track_id]
                track.append((center_x, center_y))

                if len(track) > 1:
                    prev_x, prev_y = track[-2]

                    crossed = False
                    if line_type == LINE_HORIZONTAL:
                        if (
                            counting_direction == MOVE_TB
                            and prev_y < line_coord
                            and center_y >= line_coord
                        ) or (
                            counting_direction == MOVE_BT
                            and prev_y > line_coord
                            and center_y <= line_coord
                        ):
                            crossed = True
                    elif line_type == LINE_VERTICAL:
                        if (
                            counting_direction == MOVE_LR
                            and prev_x < line_coord
                            and center_x >= line_coord
                        ) or (
                            counting_direction == MOVE_RL
                            and prev_x > line_coord
                            and center_x <= line_coord
                        ):
                            crossed = True

                    if crossed and track_id not in counted_ids:
                        total_count += 1
                        counted_ids.add(track_id)
                        cv2.circle(frame, (center_x, center_y), 10, (0, 255, 0), -1)

        # Desenha a linha e a contagem
        cv2.line(frame, line_points[0], line_points[1], (0, 0, 255), 2)
        cv2.putText(
            frame,
            f"Contagem: {total_count}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2,
        )
        out.write(frame)

        frame_idx += 1
        if frame_idx % 30 == 0:
            logger.debug(f"Processando frame {frame_idx}...")

    cap.release()
    out.release()
    logger.info("-" * 20)
    logger.info(f"Processamento concluído! Contagem final: {total_count}")
    logger.info(f"Vídeo processado salvo como: {output_filename}")


# --- EXECUÇÃO DO TESTE ---
# Substitua os nomes de arquivo pelos que você enviou
NOME_DO_VIDEO_DE_TESTE = "curto.mp4"
NOME_DO_MODELO_YOLO = "yolov8l.pt"
ORIENTACAO_DE_TESTE = "E"  # Teste com 'N', 'S', 'E', ou 'W'

contar_gado_colab(
    video_path=NOME_DO_VIDEO_DE_TESTE,
    model_path=NOME_DO_MODELO_YOLO,
    orientation=ORIENTACAO_DE_TESTE,
)
