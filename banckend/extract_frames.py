import logging
import os

import cv2

logger = logging.getLogger(__name__)


def extract_frames(video_path, output_folder, step=30):
    """
    Extrai frames de um vídeo a cada `step` frames e salva em `output_folder`.
    """
    os.makedirs(output_folder, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"[ERRO] Não foi possível abrir o vídeo: {video_path}")
        return

    frame_count = 0
    saved_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_count % step == 0:
            frame_filename = os.path.join(output_folder, f"frame_{saved_count:04d}.jpg")
            cv2.imwrite(frame_filename, frame)
            logger.info(f"[INFO] Frame {frame_count} salvo como {frame_filename}")
            saved_count += 1

        frame_count += 1

    cap.release()
    logger.info(f"[INFO] Extração concluída: {saved_count} frames salvos.")
