# CountGFront

## Project Description

CountGFront is the mobile interface for the CountG project. Built with React Native and Expo, the app connects to a FastAPI backend that runs YOLO models to count objects in images or video streams.

## Features

- React Native + Expo based UI.
- Capture photos or pick files for counting.
- Communicates with a FastAPI backend for training and detection.
- Support for Ngrok when the local IP is not accessible.

## Installation

1. **Backend (optional)**
   ```bash
   cd CountG
   python3.10 -m venv venv
   source venv/bin/activate            # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env                # Windows (PowerShell): Copy-Item .env.example .env
   # Download YOLOv8 weights (run inside the backend folder that has main.py)
   curl -L -o yolov8n.pt https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt
   curl -L -o yolov8m.pt https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8m.pt
   curl -L -o yolov8l.pt https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8l.pt
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

### Banco de dados do backend (PostgreSQL)

O backend usa PostgreSQL para persistir o progresso do processamento de videos
na tabela `video_progress`.

1. Suba um PostgreSQL local (exemplo com Docker):
   ```bash
   docker run --name countg-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
   ```
2. Crie banco/usuario e permissoes usando o script do backend:
   ```bash
   # na raiz do projeto:
   psql -h localhost -U postgres -f backend/setup_db.SQL
   # se voce ja estiver dentro da pasta backend:
   psql -h localhost -U postgres -f setup_db.SQL
   ```
3. No `.env` do backend (`backend/.env`), configure a conexao:
   ```env
   DATABASE_URL=postgresql://kyoday_user:root@localhost:5432/kyoday_db
   ```

Observacoes:

- O backend cria automaticamente a tabela `video_progress` ao iniciar (se o
  usuario do banco tiver permissao de criacao no schema).
- Se `DATABASE_URL` nao estiver definida, as rotas que dependem de progresso no
  banco podem falhar.
- Para validar rapidamente, acesse `GET /` e confira o campo
  `database_url_loaded: true`.

2. **Frontend**
   ```bash
   cd CountGFront
   npm install
   ```
   Configure o arquivo `.env` para apontar para o backend local:

```bash
EXPO_PUBLIC_API_URL="http://<seu-ip-local>:8000"
```

Variaveis publicas do Expo devem usar o prefixo `EXPO_PUBLIC_`. O Expo CLI
carrega automaticamente o `.env` ao rodar `npx expo start`.
Exemplo para habilitar logs de descoberta de camera:

```bash
EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG_LOGS=1
```

Configuracao do wake-up automatico do backend (App lifecycle):

```bash
# 1/true habilita, 0/false desabilita
EXPO_PUBLIC_WAKEUP_ENABLED=1
# Janela minima entre tentativas de wake-up (em ms)
EXPO_PUBLIC_WAKEUP_MIN_INTERVAL_MS=30000
```

No codigo, acesse assim:

```js
const enabled = process.env.EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG_LOGS === '1';
```

## Media Dependencies

The app manipulates audio and video and relies on a few extra packages:

- [`expo-video`](https://docs.expo.dev/versions/latest/sdk/video/) for
  playback and preview.
- [`@react-native-community/slider`](https://github.com/callstack/react-native-slider)
  for trim selection UI.
- [`react-native-vlc-media-player`](https://github.com/razorRun/react-native-vlc-media-player)
  for RTSP preview/recording.

The backend uses trim start/end metadata to process only the selected segment.

Install the packages:

```bash
npx expo install expo-video @react-native-community/slider
npm install react-native-vlc-media-player react-native-udp
```

After installing, rebuild the dev client or EAS build (Expo Go does not include
RTSP preview/recording or UDP discovery).

## Usage

1. Start the Expo server:
   ```bash
   npx expo start
   ```
2. In the Expo terminal press `d` and select **LAN** for local network access.
3. If the device cannot reach your local IP, use Ngrok:
   ```bash
   ngrok http 8000
   ```
   Use the generated URL in the app configuration.

## Wi-Fi Camera Discovery (Incremental)

The Wi-Fi camera scan streams results as soon as a device is detected. You can
connect to any camera while the scan continues in the background, and cancel
the scan instantly with the **Parar busca** button.

Status counters:

- **Found**: total devices detected so far.
- **Checked**: IPs already verified in the RTSP scan.
- **Elapsed**: time since the scan started.

Tips for testing:

- Keep the phone and camera on the same Wi-Fi network (e.g. 192.168.0.x).
- Enable ONVIF on the camera when available.
- If no camera appears, try connecting manually by IP or forcing the prefix
  in the debug panel.

## Screenshots

![Camera positioning](assets/images/camera_positioning.png)
![Counting line setup](assets/images/counting_line.png)

## Known Limitations and Future Improvements

- Trimming uses stream copy for speed, so cut points can align to keyframes.
- Frame-precise control and visual thumbnails are not yet available.

Future work:

- Implement a custom dual-thumb slider for start/end selection with preview
  thumbnails.
- Add an optional re-encode path for frame-accurate trims.
- Extend the editor to support additional operations such as rotation or
  multiple segments.

## Contribution Guidelines

1. Fork the repository.
2. Create a feature branch: `git checkout -b my-feature`.
3. Commit your changes and push to your branch.
4. Open a Pull Request.
