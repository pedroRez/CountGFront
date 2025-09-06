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

## Contribution Guidelines

1. Fork the repository.
2. Create a feature branch: `git checkout -b my-feature`.
3. Commit your changes and push to your branch.
4. Open a Pull Request.
