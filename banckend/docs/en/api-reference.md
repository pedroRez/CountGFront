# API Reference

All endpoints return JSON.

You can download the full OpenAPI schema as JSON for use with tools like Swagger
or Postman. [Download the schema](../openapi.json) or paste the link into your
favorite API explorer.

## `GET /`
**Response**
```json
{
  "status": "KYO DAY Backend is running!",
  "database_url_loaded": true
}
```
```bash
curl http://localhost:8000/
```

## `POST /upload-video/`
Upload a video file. Supported formats: `.mp4`, `.mov`, `.avi`, `.mkv`. The
maximum allowed size is **500 MB**.

**Request** (multipart)
- `file`: video file in one of the allowed formats (max 500 MB)

**Response**
```json
{
  "message": "Arquivo 'video.mp4' recebido com sucesso.",
  "nome_arquivo": "<generated-name>.mp4"
}
```
```bash
curl -X POST -F "file=@my_video.mp4" http://localhost:8000/upload-video/
```

## `POST /predict-video/`
Start processing a previously uploaded video.

**Request Body**

Required fields:

- `nome_arquivo` (string): unique filename returned by `/upload-video/`.
- `orientation` (string): one of `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`.
- `line_position_ratio` (number between `0.0` and `1.0`, default `0.5`):
  counting line position for horizontal/vertical lines.

Optional fields:

- `model_choice` (string, default `"l"`): choose YOLO model `"n"` (nano),
  `"m"` (medium), `"l"` (large), or `"p"` (custom/best.pt).
- `target_classes` (array of strings, default `null`): list of classes to count;
  counts all detected classes when `null`.

```json
{
  "nome_arquivo": "<generated-name>.mp4",
  "orientation": "S",
  "model_choice": "l",
  "target_classes": ["cow"],
  "line_position_ratio": 0.5
}
```

**Response**
```json
{
  "status": "iniciado",
  "message": "Processamento para '<generated-name>.mp4' iniciado.",
  "video_name": "<generated-name>.mp4"
}
```
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"nome_arquivo":"<generated-name>.mp4","orientation":"S","line_position_ratio":0.5}' \
  http://localhost:8000/predict-video/
```

## `GET /progresso/{video_name}`
Check processing progress.

**Response**
```json
{
  "video_name": "<generated-name>.mp4",
  "frame_atual": 120,
  "total_frames_estimado": 300,
  "tempo_inicio": 1721823374.123,
  "tempo_restante": "00:01:23",
  "finalizado": false,
  "resultado": null,
  "erro": null,
  "cancelado": false
}
```
```bash
curl http://localhost:8000/progresso/<generated-name>.mp4
```

## `GET /cancelar-processamento/{video_name}`
Cancel processing of a video.

**Response**

Success:
```json
{
  "message": "Solicitação de cancelamento para <generated-name>.mp4 enviada."
}
```

Failure:
```json
{
  "message": "Não foi possível cancelar ou o processo para <generated-name>.mp4 não está ativo."
}
```

```bash
curl http://localhost:8000/cancelar-processamento/<generated-name>.mp4
```
