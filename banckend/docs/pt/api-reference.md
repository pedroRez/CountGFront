# Referência da API

Todos os endpoints retornam JSON.

Você pode baixar o esquema OpenAPI completo em formato JSON para usar em
ferramentas como Swagger ou Postman. [Baixe o esquema](../openapi.json) ou
utilize o link no seu explorador de APIs preferido.

## `GET /`
**Resposta**
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
Envia um arquivo de vídeo.

Formatos permitidos: `.mp4`, `.mov`, `.avi`, `.mkv`. Tamanho máximo: **500 MB**.

**Requisição** (multipart)
- `file`: arquivo de vídeo

**Resposta**
```json
{
  "message": "Arquivo 'video.mp4' recebido com sucesso.",
  "nome_arquivo": "<nome-gerado>.mp4"
}
```
```bash
curl -X POST -F "file=@meu_video.mp4" http://localhost:8000/upload-video/
```

## `POST /predict-video/`
Inicia o processamento de um vídeo previamente enviado.

**Campos obrigatórios**

- `nome_arquivo` (string): nome único do vídeo enviado.
- `orientation` (string): direção do movimento; valores possíveis: `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`.
- `line_position_ratio` (número entre `0.0` e `1.0`, padrão `0.5`): posição da linha de contagem.

**Campos opcionais**

- `model_choice` (string, padrão `l`): escolha do modelo YOLO (`n`, `m`, `l`, `p`).
- `target_classes` (array de strings, padrão todas): classes alvo para contagem.

**Exemplo de requisição**
```json
{
  "nome_arquivo": "<nome-gerado>.mp4",
  "orientation": "S",
  "model_choice": "l",
  "target_classes": ["cow"],
  "line_position_ratio": 0.5
}
```

**Resposta**
```json
{
  "status": "iniciado",
  "message": "Processamento para '<nome-gerado>.mp4' iniciado.",
  "video_name": "<nome-gerado>.mp4"
}
```
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"nome_arquivo":"<nome-gerado>.mp4","orientation":"S","line_position_ratio":0.5}' \
  http://localhost:8000/predict-video/
```

## `GET /progresso/{video_name}`
Consulta o progresso do processamento.

**Resposta**
```json
{
  "video_name": "<nome-gerado>.mp4",
  "frame_atual": 10,
  "total_frames_estimado": 100,
  "tempo_inicio": "2024-01-01T12:00:00",
  "tempo_restante": 42.5,
  "finalizado": false,
  "resultado": null,
  "erro": null,
  "cancelado": false
}
```
```bash
curl http://localhost:8000/progresso/<nome-gerado>.mp4
```

## `GET /cancelar-processamento/{video_name}`
Cancela o processamento de um vídeo.

**Resposta**

Sucesso:
```json
{
  "message": "Solicitação de cancelamento para <nome-gerado>.mp4 enviada."
}
```

Falha:
```json
{
  "message": "Não foi possível cancelar ou o processo para <nome-gerado>.mp4 não está ativo."
}
```
```bash
curl http://localhost:8000/cancelar-processamento/<nome-gerado>.mp4
```
