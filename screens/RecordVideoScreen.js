import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ExpoCameraModule from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';

// Function to format time
const formatSecondsToMMSS = (totalSeconds) => {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
};

// --- NEW ORIENTATION GUIDE CONFIGURATION ---
const buildGuideOrientations = (t) => [
  {
    id: 'E',
    label: t('common.orientation.leftToRight'),
    lineStyle: 'vertical',
    arrowIcon: 'arrow-right-bold-outline',
  },
  {
    id: 'W',
    label: t('common.orientation.rightToLeft'),
    lineStyle: 'vertical',
    arrowIcon: 'arrow-left-bold-outline',
  },
  {
    id: 'S',
    label: t('common.orientation.topToBottom'),
    lineStyle: 'horizontal',
    arrowIcon: 'arrow-down-bold-outline',
  },
  {
    id: 'N',
    label: t('common.orientation.bottomToTop'),
    lineStyle: 'horizontal',
    arrowIcon: 'arrow-up-bold-outline',
  },
];

export default function RecordVideoScreen({ navigation }) {
  const { t } = useLanguage();
  // --- Component state ---
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraType, setCameraType] = useState('back');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  // --- New state for guide orientation ---
  const [guideOrientationIndex, setGuideOrientationIndex] = useState(0);

  const guideOrientations = buildGuideOrientations(t);

  const cameraRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // --- Permission logic ---
  useEffect(() => {
    (async () => {
      const { status: cameraStatus } =
        await ExpoCameraModule.Camera.requestCameraPermissionsAsync();
      const { status: audioStatus } =
        await ExpoCameraModule.Camera.requestMicrophonePermissionsAsync();
      setHasPermission(cameraStatus === 'granted' && audioStatus === 'granted');
    })();
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // --- Control functions (Timer and Camera) ---
  const startRecordingTimer = () => {
    setElapsedTime(0);
    recordingTimerRef.current = setInterval(
      () => setElapsedTime((p) => p + 1),
      1000
    );
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const toggleCameraType = () => {
    if (!isRecording) {
      setIsCameraReady(false); // Force the camera to reinitialize
      setCameraType((currentType) =>
        currentType === 'back' ? 'front' : 'back'
      );
    }
  };

  // --- New function to toggle guide orientation ---
  const toggleGuideOrientation = () => {
    if (!isRecording) {
      setGuideOrientationIndex(
        (prevIndex) => (prevIndex + 1) % guideOrientations.length
      );
    }
  };

  const handleRecordPress = async () => {
    if (isRecording) {
      if (cameraRef.current) {
        cameraRef.current.stopRecording();
      }
      return;
    }

    if (!isCameraReady || !cameraRef.current) {
      Alert.alert(t('common.wait'), t('common.cameraNotReady'));
      return;
    }
    if (!hasPermission) {
      Alert.alert(
        t('common.permissionRequired'),
        t('common.cameraMicRequired')
      );
      return;
    }

    setIsRecording(true);
    startRecordingTimer();

    try {
      const recordOptions = { quality: '720p', mute: true };
      const data = await cameraRef.current.recordAsync(recordOptions);

      const currentOrientation = guideOrientations[guideOrientationIndex];
      const recordedVideoAsset = {
        uri: data.uri,
        fileName: data.uri.split('/').pop(),
        mimeType: Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4',
        duration: elapsedTime * 1000,
        orientation: currentOrientation.id, // <<< ENVIA A ORIENTAÇÃO SELECIONADA
      };

      navigation.replace('VideoEditor', { asset: recordedVideoAsset });
    } catch (error) {
      if (
        error.message.includes(
          'Recording was stopped before any data could be produced'
        )
      ) {
        Alert.alert(
          t('record.recordingTooShortTitle'),
          t('record.recordingTooShortMessage')
        );
      } else {
        Alert.alert(
          t('record.recordingErrorTitle'),
          t('record.recordingErrorMessage', { error: error.message })
        );
      }
    } finally {
      stopRecordingTimer();
      setIsRecording(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <CustomActivityIndicator size="large" color="#FFF" />
        <Text style={styles.infoText}>
          {t('record.loadingPermissions')}
        </Text>
      </View>
    );
  }
  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.infoText}>
          {t('record.permissionDenied')}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Get the current guide configuration based on the state index
  const currentGuide = guideOrientations[guideOrientationIndex];

  return (
    <SafeAreaView style={styles.container}>
      <ExpoCameraModule.CameraView
        style={styles.cameraPreview}
        ref={cameraRef}
        type={cameraType}
        mode="video"
        onCameraReady={() => setIsCameraReady(true)}
      >
        <View style={styles.overlayContainer}>
          {isRecording && (
            <View style={styles.timerContainer}>
              <View style={styles.recordingIndicator} />
              <Text style={styles.timerText}>
                {formatSecondsToMMSS(elapsedTime)}
              </Text>
            </View>
          )}
          {/* --- DYNAMIC VISUAL GUIDES --- */}
          {currentGuide.lineStyle === 'vertical' && (
            <View style={styles.verticalLine} />
          )}
          {currentGuide.lineStyle === 'horizontal' && (
            <View style={styles.horizontalLine} />
          )}

          <View style={styles.arrowContainer}>
            <MaterialCommunityIcons
              name={currentGuide.arrowIcon}
              size={48}
              color="rgba(255, 255, 0, 0.7)"
            />
          </View>
        </View>
      </ExpoCameraModule.CameraView>

      <View style={styles.controlsContainer}>
        {/* --- NEW ORIENTATION BUTTON --- */}
        <TouchableOpacity
          onPress={toggleGuideOrientation}
          style={styles.controlButton}
          disabled={isRecording}
        >
          <MaterialCommunityIcons
            name="axis-arrow"
            size={30}
            color={isRecording ? '#666' : 'white'}
          />
          <Text
            style={[
              styles.controlButtonText,
              { color: isRecording ? '#666' : 'white' },
            ]}
          >
            {currentGuide.label}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.recordButtonCore}
          onPress={handleRecordPress}
          disabled={!isCameraReady}
        >
          <MaterialCommunityIcons
            name={isRecording ? 'stop-circle' : 'record-circle-outline'}
            size={70}
            color={!isCameraReady ? 'grey' : isRecording ? 'red' : 'white'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleCameraType}
          style={styles.controlButton}
          disabled={isRecording}
        >
          <MaterialCommunityIcons
            name="camera-flip-outline"
            size={30}
            color={isRecording ? '#666' : 'white'}
          />
          <Text
            style={[
              styles.controlButtonText,
              { color: isRecording ? '#666' : 'white' },
            ]}
          >
            {t('record.switchCamera')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
  },
  infoText: { color: 'white', fontSize: 16, textAlign: 'center', padding: 20 },
  cameraPreview: { flex: 1 },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalLine: {
    position: 'absolute',
    width: 3,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 0, 0.6)',
  },
  horizontalLine: {
    position: 'absolute',
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 0, 0.6)',
  },
  arrowContainer: {},
  timerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'red',
    marginRight: 8,
  },
  timerText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 120 : 100,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  recordButtonCore: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  controlButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
  },
  controlButtonText: {
    color: 'white',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 25,
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: '#0A84FF',
    borderRadius: 10,
  },
  backButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
