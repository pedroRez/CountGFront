# CountG

![License](https://img.shields.io/badge/license-MIT-green)
![Build Status](https://img.shields.io/github/actions/workflow/status/USER/CountG/ci.yml?label=build)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)

![Demonstração](https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif)

## Português

### Visão Geral
CountG é um backend em **FastAPI** para contagem e rastreamento de objetos em vídeo utilizando modelos **YOLOv8**.

### Pré-requisitos
- Python 3.10+
- [pip](https://pip.pypa.io/)
- (Opcional) [virtualenv](https://virtualenv.pypa.io/)
- PostgreSQL para persistência de dados

### Instalação
1. Clone o repositório:
   ```bash
   git clone https://github.com/USER/CountG.git
   cd CountG
   ```
2. Crie e ative um ambiente virtual:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   venv\Scripts\activate    # Windows
   ```
3. Instale as dependências:
   ```bash
   pip install -r requirements.txt  # dependências principais
   pip install -r requirements-dev.txt  # dependências de desenvolvimento
   # ou use Poetry
   poetry install
   ```

### Execução
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Testes
Instale as dependências de desenvolvimento e rode os testes com **pytest**:

```bash
pip install -r requirements-dev.txt
pytest tests
```

### Estrutura do Projeto
```text
.
├── main.py
├── routes/
│   └── video_routes.py
├── models/
├── utils/
├── requirements.txt
├── .env.example
```

### Variáveis de Ambiente
Copie `.env.example` para `.env` e ajuste os valores conforme necessário:
```ini
ROBOFLOW_API_KEY=
DATABASE_URL=
HG_HOST=
HG_USER=
HG_PASS=
HG_PORT=22
HG_DOMAIN=
USE_SFTP=false
CREATE_ANNOTATED_VIDEO=true
OMP_NUM_THREADS=12
```

### Uso da API
Exemplos de requisições:

#### `/upload-video/`
```bash
curl -X POST -F "file=@meu_video.mp4" http://localhost:8000/upload-video/
```

#### `/predict-video/`
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"nome_arquivo":"video.mp4"}' \
  http://localhost:8000/predict-video/
```

#### `/progresso/{video_name}`
```bash
curl http://localhost:8000/progresso/video.mp4
```

#### `/cancelar-processamento/{video_name}`
```bash
curl http://localhost:8000/cancelar-processamento/video.mp4
```

Para mais informações, consulte a [documentação completa](https://USER.github.io/CountG/).

### Documentação
Instale as dependências de documentação e rode localmente:

```bash
pip install mkdocs mkdocs-material mkdocs-static-i18n
mkdocs serve
```

Para publicar no GitHub Pages:

```bash
mkdocs gh-deploy --force
```

### Links Relevantes
- [Documentação FastAPI](https://fastapi.tiangolo.com/)
- [YOLOv8](https://docs.ultralytics.com/)
- [Shields.io](https://shields.io/)

### Licença
Este projeto está licenciado sob os termos da [MIT License](LICENSE).

---

## English

### Overview
CountG is a **FastAPI** backend for object counting and tracking in video using **YOLOv8** models.

### Prerequisites
- Python 3.10+
- [pip](https://pip.pypa.io/)
- (Optional) [virtualenv](https://virtualenv.pypa.io/)
- PostgreSQL for data persistence

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/USER/CountG.git
   cd CountG
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   venv\Scripts\activate    # Windows
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt  # main dependencies
   pip install -r requirements-dev.txt  # development extras
   # or use Poetry
   poetry install
   ```

### Running
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Tests
Install development dependencies and run the test suite with **pytest**:

```bash
pip install -r requirements-dev.txt
pytest tests
```

### Project Structure
```text
.
├── main.py
├── routes/
│   └── video_routes.py
├── models/
├── utils/
├── requirements.txt
├── .env.example
```

### Environment Variables
Copy `.env.example` to `.env` and adjust as needed:
```ini
ROBOFLOW_API_KEY=
DATABASE_URL=
HG_HOST=
HG_USER=
HG_PASS=
HG_PORT=22
HG_DOMAIN=
USE_SFTP=false
CREATE_ANNOTATED_VIDEO=true
OMP_NUM_THREADS=12
```

### API Usage
Request examples:

#### `/upload-video/`
```bash
curl -X POST -F "file=@my_video.mp4" http://localhost:8000/upload-video/
```

#### `/predict-video/`
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"nome_arquivo":"video.mp4"}' \
  http://localhost:8000/predict-video/
```

#### `/progresso/{video_name}`
```bash
curl http://localhost:8000/progresso/video.mp4
```

#### `/cancelar-processamento/{video_name}`
```bash
curl http://localhost:8000/cancelar-processamento/video.mp4
```

Check the [full documentation](https://USER.github.io/CountG/) for more details.

### Documentation
Install the documentation dependencies and run locally:

```bash
pip install mkdocs mkdocs-material mkdocs-static-i18n
mkdocs serve
```

To publish to GitHub Pages:

```bash
mkdocs gh-deploy --force
```

### Useful Links
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [YOLOv8](https://docs.ultralytics.com/)
- [Shields.io](https://shields.io/)

### License
This project is licensed under the terms of the [MIT License](LICENSE).
