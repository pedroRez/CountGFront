from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Sequence

import cv2

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def _load_classes(classes_path: Path) -> List[str]:
    classes = [line.strip() for line in classes_path.read_text(encoding="utf-8").splitlines()]
    return [c for c in classes if c]


def _iter_images(images_dir: Path) -> Sequence[Path]:
    return sorted(
        p for p in images_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def _parse_yolo_line(line: str):
    parts = line.strip().split()
    if len(parts) != 5:
        return None
    try:
        class_id = int(parts[0])
        x_center = float(parts[1])
        y_center = float(parts[2])
        width = float(parts[3])
        height = float(parts[4])
    except ValueError:
        return None
    return class_id, x_center, y_center, width, height


def _yolo_to_rect_points(
    x_center: float,
    y_center: float,
    width: float,
    height: float,
    image_width: int,
    image_height: int,
):
    box_w = width * image_width
    box_h = height * image_height
    cx = x_center * image_width
    cy = y_center * image_height

    x1 = max(0.0, cx - box_w / 2.0)
    y1 = max(0.0, cy - box_h / 2.0)
    x2 = min(float(image_width), cx + box_w / 2.0)
    y2 = min(float(image_height), cy + box_h / 2.0)
    return [[x1, y1], [x2, y2]]


def convert_dataset(
    images_dir: Path,
    labels_dir: Path,
    classes_path: Path,
    output_dir: Path,
) -> dict:
    classes = _load_classes(classes_path)
    images = _iter_images(images_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    stats = {
        "images_total": 0,
        "json_written": 0,
        "json_with_shapes": 0,
    }

    for image_path in images:
        img = cv2.imread(str(image_path))
        if img is None:
            continue
        image_height, image_width = img.shape[:2]

        label_path = labels_dir / f"{image_path.stem}.txt"
        shapes = []
        if label_path.exists():
            for line in label_path.read_text(encoding="utf-8").splitlines():
                parsed = _parse_yolo_line(line)
                if parsed is None:
                    continue
                class_id, x_center, y_center, width, height = parsed
                if class_id < 0 or class_id >= len(classes):
                    continue
                shapes.append(
                    {
                        "label": classes[class_id],
                        "text": "",
                        "points": _yolo_to_rect_points(
                            x_center=x_center,
                            y_center=y_center,
                            width=width,
                            height=height,
                            image_width=image_width,
                            image_height=image_height,
                        ),
                        "group_id": None,
                        "shape_type": "rectangle",
                        "flags": {},
                    }
                )

        payload = {
            "version": "anylabeling",
            "flags": {},
            "shapes": shapes,
            "imagePath": image_path.name,
            "imageData": None,
            "imageHeight": image_height,
            "imageWidth": image_width,
        }

        json_path = output_dir / f"{image_path.stem}.json"
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        stats["images_total"] += 1
        stats["json_written"] += 1
        if shapes:
            stats["json_with_shapes"] += 1

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert YOLO TXT annotations to AnyLabeling/LabelMe JSON files."
    )
    parser.add_argument("--images-dir", required=True, help="directory with image files")
    parser.add_argument("--labels-dir", required=True, help="directory with YOLO .txt files")
    parser.add_argument("--classes", required=True, help="classes.txt file")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="where to write .json (default: images-dir)",
    )
    args = parser.parse_args()

    images_dir = Path(args.images_dir).resolve()
    labels_dir = Path(args.labels_dir).resolve()
    classes_path = Path(args.classes).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else images_dir

    stats = convert_dataset(
        images_dir=images_dir,
        labels_dir=labels_dir,
        classes_path=classes_path,
        output_dir=output_dir,
    )
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

