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
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [hasAudioPermission, setHasAudioPermission] = useState(null); // Mantido para o fluxo de permissão
  const [cameraType, setCameraType] = useState('back');
  const cameraRef = useRef(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    (async () => {
      const cameraStatus = await ExpoCameraModule.Camera.requestCameraPermissionsAsync();
      setHasCameraPermission(cameraStatus.status === 'granted');
      
      const audioStatus = await ExpoCameraModule.Camera.requestMicrophonePermissionsAsync();
      setHasAudioPermission(audioStatus.status === 'granted');
    })();

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const startRecordingTimer = () => {
    setElapsedTime(0);
    recordingTimerRef.current = setInterval(() => {
      setElapsedTime(prevTime => prevTime + 1);
    }, 1000);
  };

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    // Não resetar elapsedTime aqui para que o usuário veja o tempo final brevemente
  };

  const toggleCameraType = () => {
    if (!isRecording) {
      setCameraType(currentType => (currentType === 'back' ? 'front' : 'back'));
    }
  };

  const handleStartRecording = async () => {
    if (cameraRef.current && !isRecording) {
      if (!hasCameraPermission) {
        Alert.alert("Permissão Necessária", "Acesso à câmera é necessário para gravar.");
        return;
      }
      // Se hasAudioPermission for false, mute:true cuidará disso.

      setIsRecording(true); // <<< Define como gravando ANTES de chamar recordAsync
      startRecordingTimer();
      console.log('Iniciando gravação...');
      try {
        const recordOptions = {
          quality: '720p', 
          mute: true,
        };
        
        const data = await cameraRef.current.recordAsync(recordOptions);
        
        // Este bloco é alcançado quando recordAsync resolve (após stopRecording ser chamado e ter sucesso)
        stopRecordingTimer(); // Para o timer aqui, após a gravação ser confirmada
        setIsRecording(false); // Define que parou de gravar aqui
        console.log('Gravação finalizada com sucesso, URI:', data.uri);
        
        const recordedVideoAsset = {
          uri: data.uri,
          fileName: data.uri.split('/').pop(),
          mimeType: Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4',
          duration: elapsedTime * 1000, 
        };
        
        navigation.replace('Home', { newlyRecordedVideo: recordedVideoAsset });

      } catch (error) {
        // Este catch lida com erros da promessa de recordAsync
        console.error("Erro detalhado durante recordAsync:", error);
        Alert.alert("Erro de Gravação", `Falha na gravação: ${error.message}`);
        stopRecordingTimer();  // Para o timer em caso de erro
        setIsRecording(false); // Garante que o estado de gravação seja resetado
      }
    }
  };

  const handleStopRecording = () => {
    if (cameraRef.current && isRecording) { // Verifica se realmente está gravando
      console.log('Chamando cameraRef.current.stopRecording()...');
      cameraRef.current.stopRecording();
      // AVISO: Não mude isRecording para false aqui diretamente.
      // A mudança de estado para isRecording = false e a parada do timer
      // devem acontecer quando a promessa de recordAsync (em handleStartRecording)
      // for resolvida ou rejeitada, indicando que a câmera realmente parou
      // e finalizou o arquivo ou falhou.
      // Para feedback visual IMEDIATO do botão, você poderia ter um estado separado
      // como `isStopping`, mas vamos manter simples por enquanto.
    } else {
      console.log('Tentativa de parar gravação, mas não estava gravando ou cameraRef é nulo.');
    }
  };

  const handleRecordButtonPress = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  if (hasCameraPermission === null || hasAudioPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Solicitando permissões...</Text>
      </View>
    );
  }
  if (hasCameraPermission === false) {
    return (
      <SafeAreaView style={styles.permissionDeniedContainer}>
        <Text style={styles.permissionText}>Acesso à câmera negado.</Text>
        <Text style={styles.permissionText}>Por favor, habilite a permissão nas configurações do seu celular.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraContainer}>
        <ExpoCameraModule.CameraView
          style={styles.cameraPreview}
          type={cameraType}
          ref={cameraRef}
          ratio="16:9"
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
            <Text style={styles.guideText}>Mantenha o gado cruzando esta linha ↔️</Text>
          </View>
        </ExpoCameraModule.CameraView>
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity onPress={toggleCameraType} style={styles.controlButton} disabled={isRecording}>
          <MaterialCommunityIcons name="camera-flip-outline" size={30} color={isRecording ? "#999" : "white"} />
          <Text style={[styles.controlButtonText, isRecording && {color: "#999"}]}>Trocar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.recordButtonCore}
          onPress={handleRecordButtonPress}
          // Não precisa mais de disabled aqui se a lógica interna for robusta
        >
          <MaterialCommunityIcons 
            name={isRecording ? "stop-circle" : "record-circle-outline"} 
            size={70} 
            color={isRecording ? "red" : "white"} 
          />
        </TouchableOpacity>

        <TouchableOpacity 
            onPress={() => { if (!isRecording) navigation.goBack(); }} 
            style={styles.controlButton} 
            disabled={isRecording}
        >
          <MaterialCommunityIcons name="keyboard-backspace" size={30} color={isRecording ? "#999" : "white"} />
          <Text style={[styles.controlButtonText, isRecording && {color: "#999"}]}>Sair</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Cole os estilos completos do RecordVideoScreen.js da minha resposta anterior aqui
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'black' },
  loadingText: { color: 'white', marginTop: 10 },
  cameraContainer: { flex: 1, position: 'relative' },
  cameraPreview: { flex: 1 },
  overlayContainer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  verticalLine: { position: 'absolute', left: '50%', marginLeft: -1.5, width: 3, height: '100%', backgroundColor: 'rgba(255, 0, 0, 0.6)', shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 2, elevation: 5 },
  arrowContainerLeft: { position: 'absolute', left: '25%', top: '50%', transform: [{ translateY: -22 }] },
  arrowText: { fontSize: 44, color: 'rgba(255, 255, 255, 0.8)', textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  guideText: { position: 'absolute', bottom: 20, alignSelf: 'center', color: 'white', fontSize: 15, backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, textAlign: 'center' },
  controlsContainer: { height: Platform.OS === 'ios' ? 120 : 100, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: Platform.OS === 'ios' ? 20 : 10 },
  recordButtonCore: { width: 75, height: 75, borderRadius: 37.5, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'white' },
  controlButton: { flex: 1, padding: 10, alignItems: 'center', justifyContent: 'center' },
  controlButtonText: { color: 'white', fontSize: 10, marginTop: 4 },
  permissionDeniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#1c1c1e' },
  permissionText: { color: '#fefefe', fontSize: 17, textAlign: 'center', marginBottom: 12, lineHeight: 24 },
  backButton: { marginTop: 25, paddingVertical: 12, paddingHorizontal: 30, backgroundColor: '#0A84FF', borderRadius: 10 },
  backButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  timerContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 20, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center' },
  recordingIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'red', marginRight: 8 },
  timerText: { color: 'white', fontSize: 16, fontWeight: 'bold', },
});