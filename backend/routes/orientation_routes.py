import json
import os

from fastapi import APIRouter, HTTPException

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ORIENTATION_FILE = os.path.join(BASE_DIR, "orientation_map.json")


@router.get("/orientation-map")
def get_orientation_map():
    """Return static orientation codes with labels and arrows."""
    try:
        with open(ORIENTATION_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500, detail="orientation_map.json not found"
        ) from exc
    return data
