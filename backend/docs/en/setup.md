# Environment Setup

## Prerequisites
- Python 3.10+
- pip
- Optional: virtualenv

## Installation
```bash
git clone https://github.com/USER/CountG.git
cd CountG
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate    # Windows
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

## Running Locally
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
