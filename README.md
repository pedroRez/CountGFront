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

## Media Dependencies

The app manipulates audio and video and relies on a few extra packages:

- [`expo-av`](https://docs.expo.dev/versions/latest/sdk/av/) for playback and
  recording.
- [`expo-video-manipulator`](https://docs.expo.dev/versions/latest/sdk/video-manipulator/)
  for simple trimming in a fully managed workflow.
- [`ffmpeg-kit-react-native`](https://github.com/arthenica/ffmpeg-kit)
  when advanced processing is needed.

Install the packages with Expo's helper, choosing either `expo-video-manipulator`
or `ffmpeg-kit-react-native` depending on the desired workflow:

```bash
npx expo install expo-av

# Expo managed workflow (lightweight)
npx expo install expo-video-manipulator

# Bare / prebuild workflow with full FFmpeg
npm install ffmpeg-kit-react-native
```

Using `ffmpeg-kit-react-native` requires generating the native project with
`npx expo prebuild` and building through `expo run:android` or `expo run:ios`.

### Hermes

Hermes is enabled by default in recent React Native versions. If build issues
occur with `ffmpeg-kit-react-native`, disable Hermes by setting
`"jsEngine": "jsc"` in `app.json` or by toggling `hermesEnabled=false` in
`android/gradle.properties`.

### ffmpeg-kit package size and build flags

`ffmpeg-kit-react-native` ships in different variants that impact the final
binary size:

- `min` / `min-gpl` – smaller, with a reduced codec set.
- `full` / `full-gpl` – include most codecs but can push the APK/IPA well above
  typical store limits.

Select a variant during the native build:

```gradle
// android/build.gradle
ext.ffmpegKitPackage = "min-gpl"  // or "full-gpl"
```

```ruby
# ios/Podfile
pod 'ffmpeg-kit-react-native/full-gpl'
```

The `*-gpl` variants include GPL components and are built with the
`--enable-gpl` flag. Other compile-time flags may be added following the
[ffmpeg-kit documentation](https://github.com/arthenica/ffmpeg-kit#configure-ffmpeg).

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

- The trimming screen is built on `react-native-video-processing` and provides
  only a basic timeline. Frame-precise control and visual thumbnails are not yet
  available.
- The current UI may feel clunky for long videos and lacks accessibility
  features.

Future work:

- Implement a custom dual-thumb slider for start/end selection with preview
  thumbnails.
- Integrate trimming directly with `ffmpeg-kit` or `expo-video-manipulator` for
  better performance and cross-platform consistency.
- Extend the editor to support additional operations such as rotation or
  multiple segments.

## Contribution Guidelines

1. Fork the repository.
2. Create a feature branch: `git checkout -b my-feature`.
3. Commit your changes and push to your branch.
4. Open a Pull Request.
