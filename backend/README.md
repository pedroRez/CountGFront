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
BACKEND_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
BACKEND_API_KEY=
```

Quando `CREATE_ANNOTATED_VIDEO` está ativado, o vídeo anotado (com linha e contador) é salvo. Se `USE_SFTP=false`, o arquivo ficará disponível localmente em `videos_processados/`.

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

### Persistência de jobs/fila

A fila de processamento agora salva estado durável em `data/video_queue_state.json`.
Após reinício do backend, jobs não-terminais (`queued`/`running`) são marcados como
`failed` com mensagem de recuperação para que continuem rastreáveis.

### CORS por ambiente

- `BACKEND_ENV=development`: se `CORS_ALLOWED_ORIGINS` estiver vazio, o backend usa `*`.
- `BACKEND_ENV=production`: `*` e bloqueado; defina origens explicitas em `CORS_ALLOWED_ORIGINS` (separadas por virgula).

Validacao rapida:

```bash
# origem permitida (deve retornar Access-Control-Allow-Origin)
curl -i -X OPTIONS \
  -H "Origin: http://localhost:19006" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:8000/upload-video/

# origem nao permitida em producao (nao deve retornar o mesmo header)
curl -i -X OPTIONS \
  -H "Origin: https://not-allowed.example" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:8000/upload-video/
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
BACKEND_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
BACKEND_API_KEY=
```

When `CREATE_ANNOTATED_VIDEO` is enabled, the service saves the annotated video (with line and counter). If `USE_SFTP=false`, the file is kept locally in `videos_processados/`.

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

### Job/queue persistence

The processing queue now stores durable state in `data/video_queue_state.json`.
After backend restart, non-terminal jobs (`queued`/`running`) are marked as
`failed` with a recovery message so they remain traceable.

### Environment-based CORS

- `BACKEND_ENV=development`: if `CORS_ALLOWED_ORIGINS` is empty, the backend falls back to `*`.
- `BACKEND_ENV=production`: `*` is blocked; define explicit origins in `CORS_ALLOWED_ORIGINS` (comma-separated).

Quick validation:

```bash
# allowed origin (should return Access-Control-Allow-Origin)
curl -i -X OPTIONS \
  -H "Origin: http://localhost:19006" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:8000/upload-video/

# non-allowed origin in production (should not return the same header)
curl -i -X OPTIONS \
  -H "Origin: https://not-allowed.example" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:8000/upload-video/
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
