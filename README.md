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
   # Download YOLOv8 weights (run inside the backend folder that has main.py)
   curl -L -o yolov8n.pt https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt
   curl -L -o yolov8m.pt https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8m.pt
   curl -L -o yolov8l.pt https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8l.pt
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
2. **Frontend**
   ```bash
   cd CountGFront
   npm install
   ```
   Configure o arquivo `.env` para apontar para o backend local:
   ```bash
   EXPO_PUBLIC_API_URL="http://<seu-ip-local>:8000"
   ```

## Media Dependencies

The app manipulates audio and video and relies on a few extra packages:

- [`expo-av`](https://docs.expo.dev/versions/latest/sdk/av/) for playback and
  preview.
- [`@react-native-community/slider`](https://github.com/callstack/react-native-slider)
  for trim selection UI.
- [`ffmpeg-kit-react-native`](https://github.com/arthenica/ffmpeg-kit)
  for on-device trimming (requires a dev client or EAS build).
- [`@config-plugins/ffmpeg-kit-react-native`](https://github.com/expo/config-plugins)
  to wire the native build step.

Local trimming runs on-device and the backend receives the already-cut segment.

Install the packages:

```bash
npx expo install expo-av @react-native-community/slider
npm install ffmpeg-kit-react-native
npm install -D @config-plugins/ffmpeg-kit-react-native
```

After installing, keep the config plugin in `app.json` and rebuild the dev
client or EAS build (Expo Go does not include ffmpeg).
If npm blocks on peer deps, retry with `--legacy-peer-deps`.

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
