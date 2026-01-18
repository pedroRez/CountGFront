import sys
from types import SimpleNamespace
from pathlib import Path

# Ensure project root is on sys.path for module imports
ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

# Stub external heavy modules to avoid installing them during tests
cv2_stub = SimpleNamespace(
    VideoCapture=SimpleNamespace,
    VideoWriter=SimpleNamespace,
    VideoWriter_fourcc=lambda *args, **kwargs: None,
    CAP_PROP_FRAME_COUNT=0,
    CAP_PROP_FPS=0,
    CAP_PROP_FRAME_WIDTH=0,
    CAP_PROP_FRAME_HEIGHT=0,
)
sys.modules.setdefault('cv2', cv2_stub)

sys.modules.setdefault(
    'ultralytics', SimpleNamespace(YOLO=lambda *args, **kwargs: None)
)

sys.modules.setdefault(
    'paramiko',
    SimpleNamespace(
        SFTPClient=SimpleNamespace,
        Transport=SimpleNamespace,
    ),
)

psycopg2_pool_stub = SimpleNamespace(
    SimpleConnectionPool=lambda *args, **kwargs: None
)
psycopg2_stub = SimpleNamespace(pool=psycopg2_pool_stub)
sys.modules.setdefault('psycopg2', psycopg2_stub)
sys.modules.setdefault('psycopg2.pool', psycopg2_pool_stub)

# Provide a tiny numpy stub
sys.modules.setdefault(
    'numpy',
    SimpleNamespace(array=lambda *args, **kwargs: None),
)
