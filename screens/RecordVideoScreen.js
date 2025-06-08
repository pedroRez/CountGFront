import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import * as ExpoCameraModule from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const formatSecondsToMMSS = (totalSeconds) => {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
};

export default function RecordVideoScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraType, setCameraType] = useState('back');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  
  const cameraRef = useRef(null);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status: cameraStatus } = await ExpoCameraModule.Camera.requestCameraPermissionsAsync();
      const { status: audioStatus } = await ExpoCameraModule.Camera.requestMicrophonePermissionsAsync();
      setHasPermission(cameraStatus === 'granted' && audioStatus === 'granted');
    })();
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const startRecordingTimer = () => {
    setElapsedTime(0);
    recordingTimerRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  };

  const toggleCameraType = () => {
    if (!isRecording) {
      setIsCameraReady(false);
      setCameraType(currentType => (currentType === 'back' ? 'front' : 'back'));
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
      Alert.alert("Aguarde", "A câmera ainda não está pronta.");
      return;
    }
    
    setIsRecording(true);
    startRecordingTimer();
    
    try {
      const recordOptions = { quality: '720p', mute: true };
      const data = await cameraRef.current.recordAsync(recordOptions);
      
      const recordedVideoAsset = {
        uri: data.uri,
        fileName: data.uri.split('/').pop(),
        mimeType: Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4',
        duration: elapsedTime * 1000,
      };
      
      navigation.replace('Home', { newlyRecordedVideo: recordedVideoAsset });

    } catch (error) {
      console.error("RecordVideoScreen: Erro detalhado durante recordAsync:", JSON.stringify(error, null, 2));
      Alert.alert("Erro de Gravação", `Não foi possível gravar o vídeo: ${error.message}`);
    } finally {
      stopRecordingTimer();
      setIsRecording(false);
    }
  };
  
  if (hasPermission === null) {
    return ( <View style={styles.centered}><ActivityIndicator size="large" color="#FFF" /><Text style={styles.infoText}>Solicitando permissões...</Text></View> );
  }
  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.infoText}>Acesso à câmera e microfone é necessário.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ExpoCameraModule.CameraView
        style={styles.cameraPreview}
        ref={cameraRef}
        type={cameraType}
        mode="video" // <<< CORREÇÃO CRUCIAL ADICIONADA AQUI
        onCameraReady={() => setIsCameraReady(true)}
      >
        <View style={styles.overlayContainer}>
          {isRecording && (
            <View style={styles.timerContainer}>
              <View style={styles.recordingIndicator} />
              <Text style={styles.timerText}>{formatSecondsToMMSS(elapsedTime)}</Text>
            </View>
          )}
          <View style={styles.verticalLine} />
          <View style={styles.arrowContainerLeft}>
            <Text style={styles.arrowText}>➡️</Text>
          </View>
        </View>
      </ExpoCameraModule.CameraView>

      <View style={styles.controlsContainer}>
        <TouchableOpacity onPress={toggleCameraType} style={styles.controlButton} disabled={isRecording}>
          <MaterialCommunityIcons name="camera-flip-outline" size={30} color={isRecording ? "#666" : "white"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.recordButtonCore}
          onPress={handleRecordPress}
          disabled={!isCameraReady || (isRecording && elapsedTime < 2)} // Desabilita se a câmera não estiver pronta ou se a gravação for menor que 2s
        >
          <MaterialCommunityIcons 
            name={isRecording ? "stop-circle" : "record-circle-outline"} 
            size={70} 
            color={!isCameraReady ? "grey" : (isRecording ? "red" : "white")} 
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { if (!isRecording) navigation.goBack(); }} style={styles.controlButton} disabled={isRecording}>
          <MaterialCommunityIcons name="keyboard-backspace" size={30} color={isRecording ? "#666" : "white"} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Cole todos os seus estilos completos aqui
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1c1c1e' },
  infoText: { color: 'white', fontSize: 16, textAlign: 'center', padding: 20 },
  cameraPreview: { flex: 1 },
  overlayContainer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  verticalLine: { position: 'absolute', left: '50%', marginLeft: -1.5, width: 3, height: '100%', backgroundColor: 'rgba(255, 255, 0, 0.6)' },
  arrowContainerLeft: { position: 'absolute', left: '25%', top: '50%', transform: [{ translateY: -22 }] },
  arrowText: { fontSize: 44, color: 'rgba(255, 255, 255, 0.8)' },
  timerContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 20, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  recordingIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'red', marginRight: 8 },
  timerText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  controlsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: Platform.OS === 'ios' ? 120 : 100, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: Platform.OS === 'ios' ? 20 : 10 },
  recordButtonCore: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: 'white' },
  controlButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controlButtonText: { color: 'white', fontSize: 10, marginTop: 4 },
  backButton: { marginTop: 25, paddingVertical: 12, paddingHorizontal: 30, backgroundColor: '#0A84FF', borderRadius: 10 },
  backButtonText: { color: 'white', fontSize: 16, fontWeight: '600' }
});