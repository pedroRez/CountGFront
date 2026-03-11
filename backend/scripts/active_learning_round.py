from __future__ import annotations

import argparse
import csv
import json
import logging
import random
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

import cv2
from ultralytics import YOLO

LOGGER = logging.getLogger("active_learning_round")

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}

BOVINE_ALIASES = {
    "cow",
    "cattle",
    "bovine",
    "bovino",
    "bovinos",
    "gado",
    "boi",
    "vaca",
    "bull",
    "ox",
    "calf",
}


@dataclass
class FrameSample:
    image_path: Path
    video_name: str
    frame_index: int
    fps: float


@dataclass
class Detection:
    class_id: int
    class_name: str
    confidence: float
    x_center: float
    y_center: float
    width: float
    height: float
    is_bovine: bool


@dataclass
class HardSample:
    frame: FrameSample
    reasons: List[str]
    bovine_count: int
    non_bovine_count: int
    max_confidence: float


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be > 0")
    return parsed


def _non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be >= 0")
    return parsed


def _ratio(value: str) -> float:
    parsed = float(value)
    if parsed < 0.0 or parsed > 1.0:
        raise argparse.ArgumentTypeError("value must be between 0 and 1")
    return parsed


def _optional_device(device: Optional[str]) -> Optional[str]:
    if not device:
        return None
    cleaned = str(device).strip()
    return cleaned if cleaned else None


def _iter_video_files(videos_dir: Path) -> Iterable[Path]:
    for path in sorted(videos_dir.rglob("*")):
        if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS:
            yield path


def _iter_image_files(images_dir: Path) -> List[Path]:
    files = []
    for path in sorted(images_dir.glob("*")):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            files.append(path)
    return files


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _is_bovine_class(name: str) -> bool:
    return name.strip().lower() in BOVINE_ALIASES


def _class_name_from_names(names: object, class_id: int) -> str:
    if isinstance(names, dict):
        return str(names.get(class_id, class_id))
    if isinstance(names, list):
        if 0 <= class_id < len(names):
            return str(names[class_id])
    return str(class_id)


def _extract_frames_from_video(
    video_path: Path,
    output_images_dir: Path,
    video_index: int,
    frame_step: int,
    max_frames_per_video: Optional[int],
) -> List[FrameSample]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        LOGGER.warning("Nao foi possivel abrir o video: %s", video_path)
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frame_idx = 0
    saved = 0
    samples: List[FrameSample] = []
    video_stem = video_path.stem.replace(" ", "_")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if frame_idx % frame_step == 0:
            image_name = f"v{video_index:03d}_{video_stem}_f{frame_idx:08d}.jpg"
            image_path = output_images_dir / image_name
            cv2.imwrite(str(image_path), frame)
            samples.append(
                FrameSample(
                    image_path=image_path,
                    video_name=video_path.name,
                    frame_index=frame_idx,
                    fps=float(fps),
                )
            )
            saved += 1
            if max_frames_per_video is not None and saved >= max_frames_per_video:
                break
        frame_idx += 1

    cap.release()
    return samples


def _extract_detections(model: YOLO, image_path: Path, conf: float, iou: float, imgsz: int, device: Optional[str]) -> List[Detection]:
    kwargs = {
        "source": str(image_path),
        "conf": conf,
        "iou": iou,
        "imgsz": imgsz,
        "verbose": False,
    }
    if device:
        kwargs["device"] = device

    results = model.predict(**kwargs)
    if not results:
        return []

    result = results[0]
    boxes = getattr(result, "boxes", None)
    if boxes is None or len(boxes) == 0:
        return []

    names = getattr(result, "names", getattr(model, "names", {}))
    class_ids = boxes.cls.tolist()
    confs = boxes.conf.tolist()
    xywhn = boxes.xywhn.tolist()

    detections: List[Detection] = []
    for class_id, score, box in zip(class_ids, confs, xywhn):
        cid = int(class_id)
        class_name = _class_name_from_names(names, cid).strip().lower()
        x_center, y_center, width, height = [float(v) for v in box]
        detections.append(
            Detection(
                class_id=cid,
                class_name=class_name,
                confidence=float(score),
                x_center=x_center,
                y_center=y_center,
                width=width,
                height=height,
                is_bovine=_is_bovine_class(class_name),
            )
        )
    return detections


def _write_yolo_label_file(label_path: Path, bovine_detections: Sequence[Detection]) -> None:
    lines = []
    for det in bovine_detections:
        lines.append(
            f"0 {det.x_center:.6f} {det.y_center:.6f} {det.width:.6f} {det.height:.6f}"
        )
    label_path.write_text("\n".join(lines), encoding="utf-8")


def _evaluate_hard_sample(
    detections: Sequence[Detection],
    line_axis: str,
    line_ratio: float,
    line_margin: float,
    hard_bovine_conf: float,
    hard_non_bovine_conf: float,
    min_bovine_box_area: float,
) -> List[str]:
    bovine = [d for d in detections if d.is_bovine]
    non_bovine = [d for d in detections if not d.is_bovine]

    reasons: List[str] = []

    if any(d.confidence < hard_bovine_conf for d in bovine):
        reasons.append("low_conf_bovine")

    if any((d.width * d.height) <= min_bovine_box_area for d in bovine):
        reasons.append("tiny_bovine_box")

    ref_fn = (lambda d: d.x_center) if line_axis == "x" else (lambda d: d.y_center)
    if any(abs(ref_fn(d) - line_ratio) <= line_margin for d in detections):
        reasons.append("near_count_line")

    if any(d.confidence >= hard_non_bovine_conf for d in non_bovine):
        reasons.append("high_conf_non_bovine")

    return reasons


def _write_review_queue_csv(queue: Sequence[HardSample], csv_path: Path) -> None:
    headers = [
        "image_name",
        "video_name",
        "frame_index",
        "reasons",
        "bovine_count",
        "non_bovine_count",
        "max_confidence",
    ]
    with csv_path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=headers)
        writer.writeheader()
        for item in queue:
            writer.writerow(
                {
                    "image_name": item.frame.image_path.name,
                    "video_name": item.frame.video_name,
                    "frame_index": item.frame.frame_index,
                    "reasons": ",".join(item.reasons),
                    "bovine_count": item.bovine_count,
                    "non_bovine_count": item.non_bovine_count,
                    "max_confidence": f"{item.max_confidence:.6f}",
                }
            )


def _write_review_instructions(review_dir: Path) -> None:
    readme = review_dir / "README.txt"
    readme.write_text(
        (
            "Review queue instructions\n"
            "1) Open images in review/images.\n"
            "2) Edit YOLO labels in review/labels using class 0 for cattle.\n"
            "3) Keep the same filename (.txt) as the image.\n"
            "4) Use empty label file when image has no cattle.\n"
            "5) After review, run: python scripts/active_learning_round.py train --work-dir <round_dir>\n"
        ),
        encoding="utf-8",
    )


def _copy_or_create_label(source_label: Path, target_label: Path) -> None:
    if source_label.exists():
        shutil.copy2(source_label, target_label)
    else:
        target_label.write_text("", encoding="utf-8")


def _build_dataset_split(work_dir: Path, val_split: float, seed: int) -> dict:
    pseudo_images_dir = work_dir / "pseudo" / "images"
    pseudo_labels_dir = work_dir / "pseudo" / "labels"
    review_labels_dir = work_dir / "review" / "labels"
    dataset_dir = work_dir / "dataset"

    train_images_dir = dataset_dir / "images" / "train"
    val_images_dir = dataset_dir / "images" / "val"
    train_labels_dir = dataset_dir / "labels" / "train"
    val_labels_dir = dataset_dir / "labels" / "val"

    for directory in [train_images_dir, val_images_dir, train_labels_dir, val_labels_dir]:
        _reset_dir(directory)

    all_images = _iter_image_files(pseudo_images_dir)
    rng = random.Random(seed)
    rng.shuffle(all_images)

    total = len(all_images)
    if total <= 1:
        val_count = 0
    else:
        val_count = max(1, int(total * val_split))
        val_count = min(val_count, total - 1)

    val_set = set(all_images[:val_count])

    for image_path in all_images:
        name = image_path.stem
        pseudo_label = pseudo_labels_dir / f"{name}.txt"
        review_label = review_labels_dir / f"{name}.txt"
        source_label = review_label if review_label.exists() else pseudo_label

        if image_path in val_set:
            image_dest = val_images_dir / image_path.name
            label_dest = val_labels_dir / f"{name}.txt"
        else:
            image_dest = train_images_dir / image_path.name
            label_dest = train_labels_dir / f"{name}.txt"

        shutil.copy2(image_path, image_dest)
        _copy_or_create_label(source_label, label_dest)

    data_yaml_path = dataset_dir / "data.yaml"
    data_yaml_path.write_text(
        (
            f"path: {dataset_dir.as_posix()}\n"
            "train: images/train\n"
            "val: images/val\n"
            "names:\n"
            "  0: cattle\n"
        ),
        encoding="utf-8",
    )

    return {
        "dataset_dir": str(dataset_dir),
        "data_yaml": str(data_yaml_path),
        "total_images": total,
        "train_images": total - val_count,
        "val_images": val_count,
    }


def _run_prepare(args: argparse.Namespace) -> int:
    videos_dir = Path(args.videos_dir).resolve()
    if not videos_dir.exists():
        raise FileNotFoundError(f"videos directory not found: {videos_dir}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    default_round = Path("training_rounds") / f"round_{timestamp}"
    work_dir = Path(args.work_dir).resolve() if args.work_dir else (Path.cwd() / default_round).resolve()

    pseudo_images_dir = work_dir / "pseudo" / "images"
    pseudo_labels_dir = work_dir / "pseudo" / "labels"
    review_images_dir = work_dir / "review" / "images"
    review_labels_dir = work_dir / "review" / "labels"
    reports_dir = work_dir / "reports"

    for directory in [pseudo_images_dir, pseudo_labels_dir, review_images_dir, review_labels_dir, reports_dir]:
        _ensure_dir(directory)

    video_files = list(_iter_video_files(videos_dir))
    if not video_files:
        raise RuntimeError(f"no video files found in: {videos_dir}")

    LOGGER.info("Videos encontrados: %d", len(video_files))
    frames: List[FrameSample] = []
    for idx, video_path in enumerate(video_files, start=1):
        extracted = _extract_frames_from_video(
            video_path=video_path,
            output_images_dir=pseudo_images_dir,
            video_index=idx,
            frame_step=args.frame_step,
            max_frames_per_video=args.max_frames_per_video,
        )
        frames.extend(extracted)
        LOGGER.info("Frames extraidos de %s: %d", video_path.name, len(extracted))

    if not frames:
        raise RuntimeError("no frames extracted")

    LOGGER.info("Inicializando modelo para pseudo-label: %s", args.base_model)
    model = YOLO(args.base_model)
    device = _optional_device(args.device)

    hard_candidates: List[HardSample] = []
    counts = {
        "images_processed": 0,
        "images_with_bovine": 0,
        "bovine_boxes": 0,
        "non_bovine_boxes": 0,
    }

    for sample in frames:
        detections = _extract_detections(
            model=model,
            image_path=sample.image_path,
            conf=args.conf,
            iou=args.iou,
            imgsz=args.imgsz,
            device=device,
        )

        bovine = [d for d in detections if d.is_bovine]
        non_bovine = [d for d in detections if not d.is_bovine]
        counts["images_processed"] += 1
        counts["bovine_boxes"] += len(bovine)
        counts["non_bovine_boxes"] += len(non_bovine)
        if bovine:
            counts["images_with_bovine"] += 1

        label_path = pseudo_labels_dir / f"{sample.image_path.stem}.txt"
        _write_yolo_label_file(label_path, bovine)

        reasons = _evaluate_hard_sample(
            detections=detections,
            line_axis=args.line_axis,
            line_ratio=args.line_ratio,
            line_margin=args.line_margin,
            hard_bovine_conf=args.hard_bovine_conf,
            hard_non_bovine_conf=args.hard_non_bovine_conf,
            min_bovine_box_area=args.min_bovine_box_area,
        )
        if reasons:
            max_conf = max((d.confidence for d in detections), default=0.0)
            hard_candidates.append(
                HardSample(
                    frame=sample,
                    reasons=reasons,
                    bovine_count=len(bovine),
                    non_bovine_count=len(non_bovine),
                    max_confidence=max_conf,
                )
            )

    selected_hard = hard_candidates
    if args.max_review is not None and len(selected_hard) > args.max_review:
        rng = random.Random(args.seed)
        selected_hard = rng.sample(selected_hard, args.max_review)

    _reset_dir(review_images_dir)
    _reset_dir(review_labels_dir)
    for item in selected_hard:
        src_img = item.frame.image_path
        src_lbl = pseudo_labels_dir / f"{src_img.stem}.txt"
        shutil.copy2(src_img, review_images_dir / src_img.name)
        _copy_or_create_label(src_lbl, review_labels_dir / src_lbl.name)

    _write_review_queue_csv(selected_hard, work_dir / "review" / "review_queue.csv")
    _write_review_instructions(work_dir / "review")

    split_stats = _build_dataset_split(work_dir=work_dir, val_split=args.val_split, seed=args.seed)
    summary = {
        "work_dir": str(work_dir),
        "videos_dir": str(videos_dir),
        "model_used_for_pseudo_labels": args.base_model,
        "counts": counts,
        "hard_samples_total": len(hard_candidates),
        "hard_samples_selected_for_review": len(selected_hard),
        "dataset": split_stats,
    }
    summary_path = reports_dir / "prepare_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    LOGGER.info("Round preparada em: %s", work_dir)
    LOGGER.info("Fila de revisao: %s", work_dir / "review" / "review_queue.csv")
    LOGGER.info("Resumo: %s", summary_path)
    return 0


def _train_yolo(
    base_model: str,
    data_yaml: Path,
    epochs: int,
    batch: int,
    imgsz: int,
    device: Optional[str],
    workers: int,
    patience: int,
    project_dir: Path,
) -> dict:
    model = YOLO(base_model)
    kwargs = {
        "data": str(data_yaml),
        "epochs": epochs,
        "imgsz": imgsz,
        "batch": batch,
        "workers": workers,
        "patience": patience,
        "project": str(project_dir),
        "name": "train",
    }
    if device:
        kwargs["device"] = device

    model.train(**kwargs)
    trainer = getattr(model, "trainer", None)
    save_dir = Path(str(trainer.save_dir)) if trainer and getattr(trainer, "save_dir", None) else project_dir / "train"
    best_weights = save_dir / "weights" / "best.pt"
    last_weights = save_dir / "weights" / "last.pt"
    return {
        "save_dir": str(save_dir),
        "best_weights": str(best_weights),
        "last_weights": str(last_weights),
        "best_exists": best_weights.exists(),
    }


def _run_train(args: argparse.Namespace) -> int:
    work_dir = Path(args.work_dir).resolve()
    if not work_dir.exists():
        raise FileNotFoundError(f"round directory not found: {work_dir}")

    reports_dir = work_dir / "reports"
    _ensure_dir(reports_dir)

    split_stats = _build_dataset_split(work_dir=work_dir, val_split=args.val_split, seed=args.seed)
    data_yaml = Path(split_stats["data_yaml"])
    train_runs_dir = work_dir / "runs"
    _ensure_dir(train_runs_dir)

    train_stats = _train_yolo(
        base_model=args.base_model,
        data_yaml=data_yaml,
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        device=_optional_device(args.device),
        workers=args.workers,
        patience=args.patience,
        project_dir=train_runs_dir,
    )

    exported_best = None
    if args.export_best_path:
        export_path = Path(args.export_best_path).resolve()
        best_path = Path(train_stats["best_weights"])
        if best_path.exists():
            _ensure_dir(export_path.parent)
            shutil.copy2(best_path, export_path)
            exported_best = str(export_path)

    summary = {
        "work_dir": str(work_dir),
        "dataset": split_stats,
        "train": train_stats,
        "exported_best": exported_best,
    }
    summary_path = reports_dir / "train_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    LOGGER.info("Treino finalizado. Resumo: %s", summary_path)
    if exported_best:
        LOGGER.info("Novo best.pt exportado para: %s", exported_best)
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Active-learning pipeline for cattle detection (prepare + train)."
    )
    parser.add_argument("--verbose", action="store_true", help="enable debug logs")

    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare", help="extract frames + pseudo-label + review queue")
    prepare.add_argument("--videos-dir", required=True, help="directory containing source videos")
    prepare.add_argument("--work-dir", default=None, help="output round directory")
    prepare.add_argument("--base-model", default="yolov8l.pt", help="base model for pseudo-labeling")
    prepare.add_argument("--frame-step", type=_positive_int, default=15, help="extract 1 frame every N frames")
    prepare.add_argument("--max-frames-per-video", type=_positive_int, default=None, help="cap extracted frames per video")
    prepare.add_argument("--imgsz", type=_positive_int, default=960, help="inference image size")
    prepare.add_argument("--conf", type=_ratio, default=0.15, help="pseudo-label confidence threshold")
    prepare.add_argument("--iou", type=_ratio, default=0.5, help="pseudo-label IoU threshold")
    prepare.add_argument("--device", default=None, help='device for inference, e.g. "cuda" or "0"')
    prepare.add_argument("--line-axis", choices=["x", "y"], default="y", help="counting line axis")
    prepare.add_argument("--line-ratio", type=_ratio, default=0.5, help="normalized line position")
    prepare.add_argument("--line-margin", type=_ratio, default=0.08, help="margin around line considered critical")
    prepare.add_argument("--hard-bovine-conf", type=_ratio, default=0.55, help="bovine below this confidence enters review queue")
    prepare.add_argument("--hard-non-bovine-conf", type=_ratio, default=0.35, help="non-bovine above this confidence enters review queue")
    prepare.add_argument("--min-bovine-box-area", type=_ratio, default=0.003, help="normalized area threshold for tiny cattle boxes")
    prepare.add_argument("--max-review", type=_positive_int, default=None, help="max number of hard samples for manual review")
    prepare.add_argument("--val-split", type=_ratio, default=0.2, help="validation split ratio")
    prepare.add_argument("--seed", type=int, default=42, help="random seed")

    train = subparsers.add_parser("train", help="rebuild dataset from reviewed labels and train model")
    train.add_argument("--work-dir", required=True, help="round directory created by prepare")
    train.add_argument("--base-model", default="yolov8l.pt", help="model checkpoint used for fine-tuning")
    train.add_argument("--epochs", type=_positive_int, default=80, help="training epochs")
    train.add_argument("--batch", type=_positive_int, default=8, help="batch size")
    train.add_argument("--imgsz", type=_positive_int, default=960, help="training image size")
    train.add_argument(
        "--workers",
        type=_non_negative_int,
        default=4,
        help="number of dataloader workers (0 disables worker subprocesses)",
    )
    train.add_argument("--patience", type=_positive_int, default=20, help="early stopping patience")
    train.add_argument("--device", default=None, help='device for training, e.g. "cuda" or "0"')
    train.add_argument("--val-split", type=_ratio, default=0.2, help="validation split ratio")
    train.add_argument("--seed", type=int, default=42, help="random seed")
    train.add_argument("--export-best-path", default="best.pt", help="where to copy trained best.pt")

    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    _configure_logging(args.verbose)

    if args.command == "prepare":
        return _run_prepare(args)
    if args.command == "train":
        return _run_train(args)
    parser.error("unknown command")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
