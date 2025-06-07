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

// Função para formatar segundos para MM:SS
const formatSecondsToMMSS = (totalSeconds) => {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
};

// Duração mínima em milissegundos que a gravação deve ter antes de permitir a parada manual
const MIN_RECORDING_DURATION_BEFORE_STOP_MS = 2500; // 2.5 segundos

export default function RecordVideoScreen({ navigation }) {
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  // Permissão de áudio solicitada para compatibilidade, vídeo será mudo.
  const [hasAudioPermission, setHasAudioPermission] = useState(null); 
  const [cameraType, setCameraType] = useState('back');
  const cameraRef = useRef(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const recordingTimerRef = useRef(null);
  // Estado para controlar se o usuário já pode efetivamente parar a gravação
  const [canStopRecording, setCanStopRecording] = useState(false); 
  const allowStopTimeoutRef = useRef(null); // Para limpar o timeout se necessário

  useEffect(() => {
    (async () => {
      console.log("RecordVideoScreen: Solicitando permissões...");
      const cameraStatus = await ExpoCameraModule.Camera.requestCameraPermissionsAsync();
      setHasCameraPermission(cameraStatus.status === 'granted');
      
      const audioStatus = await ExpoCameraModule.Camera.requestMicrophonePermissionsAsync();
      setHasAudioPermission(audioStatus.status === 'granted');
      console.log(`RecordVideoScreen: Permissão Câmera: ${cameraStatus.status}, Permissão Áudio: ${audioStatus.status}`);
    })();

    // Função de limpeza para os timers
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (allowStopTimeoutRef.current) {
        clearTimeout(allowStopTimeoutRef.current);
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
  };

  const toggleCameraType = () => {
    if (!isRecording) {
      setCameraType(currentType => (currentType === 'back' ? 'front' : 'back'));
    }
  };

  const handleStartRecording = async () => {
    if (!cameraRef.current) {
        Alert.alert("Erro de Câmera", "A referência da câmera não está disponível. Tente novamente.");
        return;
    }
    if (isRecording) {
        console.log("handleStartRecording: Tentativa de iniciar gravação, mas já está gravando.");
        return;
    }
    if (!hasCameraPermission) {
      Alert.alert("Permissão Necessária", "Acesso à câmera é necessário para iniciar a gravação.");
      return;
    }
    if (!hasAudioPermission && Platform.OS === 'android') {
        // Este alerta é mais informativo, pois mute:true será usado.
        Alert.alert("Aviso de Permissão", "A permissão de áudio não foi concedida. O vídeo será gravado sem som.");
    }

    setIsRecording(true);
    setCanStopRecording(false); 
    startRecordingTimer();
    console.log('RecordVideoScreen: Iniciando gravação (chamada recordAsync)...');
    
    if (allowStopTimeoutRef.current) {
        clearTimeout(allowStopTimeoutRef.current);
    }
    allowStopTimeoutRef.current = setTimeout(() => {
        console.log("RecordVideoScreen: Tempo mínimo de gravação atingido. Habilitando 'canStopRecording'.");
        setCanStopRecording(true);
    }, MIN_RECORDING_DURATION_BEFORE_STOP_MS);

    try {
      const recordOptions = {
        quality: '720p', 
        mute: true,      // Vídeo gravado sem áudio
      };
      
      const data = await cameraRef.current.recordAsync(recordOptions);
      
      // Se chegou aqui, a gravação foi concluída com sucesso
      // (stopRecording foi chamado E dados foram produzidos, ou maxDuration/maxFileSize atingido)
      console.log('RecordVideoScreen: Gravação finalizada com sucesso (promise resolvida), URI:', data.uri);
      
      const recordedVideoAsset = {
        uri: data.uri,
        fileName: data.uri.split('/').pop(),
        mimeType: Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4',
        duration: elapsedTime * 1000, // Usa o tempo medido pelo nosso timer
      };
      
      // Limpa estados e navega ANTES de qualquer coisa que possa desmontar o componente
      // (embora o finally também faça isso, aqui é mais explícito para o caso de sucesso)
      stopRecordingTimer(); 
      setIsRecording(false);
      setCanStopRecording(false); // Reseta
      if (allowStopTimeoutRef.current) clearTimeout(allowStopTimeoutRef.current);

      navigation.replace('Home', { newlyRecordedVideo: recordedVideoAsset });

    } catch (error) {
      console.error("RecordVideoScreen: Erro detalhado durante recordAsync:", error);
      Alert.alert("Erro de Gravação", `Não foi possível gravar o vídeo. ${error.message}`);
      // Garante que o estado seja resetado em caso de erro
      // O bloco finally abaixo também cuidará disso.
    } finally {
      // Este bloco finally é executado SEMPRE, seja sucesso ou erro.
      // Garante que, se a gravação foi iniciada, os estados de controle sejam resetados.
      console.log("RecordVideoScreen: Bloco finally de handleStartRecording executado.");
      stopRecordingTimer();
      setIsRecording(false);
      setCanStopRecording(false);
      if (allowStopTimeoutRef.current) {
        clearTimeout(allowStopTimeoutRef.current);
      }
    }
  };

  const handleStopRecording = () => {
    if (cameraRef.current && isRecording) { // Verifica se está no estado de gravação
      if (canStopRecording) {
        console.log('RecordVideoScreen: Botão Parar - Chamando cameraRef.current.stopRecording()...');
        cameraRef.current.stopRecording();
        // A promise de recordAsync em handleStartRecording vai resolver (ou rejeitar).
        // A atualização de estado (isRecording, timer) acontece no try/catch/finally de lá.
      } else {
        console.log("RecordVideoScreen: Tentativa de parar gravação antes do tempo mínimo permitido.");
        Alert.alert("Aguarde", `Por favor, grave por pelo menos ${MIN_RECORDING_DURATION_BEFORE_STOP_MS / 1000} segundos para garantir a gravação.`);
      }
    } else {
      console.log("RecordVideoScreen: Botão Parar - Não está gravando ou cameraRef é nulo.");
    }
  };

  const handleRecordButtonPress = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      setElapsedTime(0); // Reseta timer para nova gravação
      handleStartRecording();
    }
  };

  // Condições de retorno para permissões (JSX completo)
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
        <Text style={styles.permissionText}>Por favor, habilite a permissão nas configurações do seu celular para usar esta funcionalidade.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // JSX Principal da tela da câmera
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
          // O botão de parar só é efetivamente "clicável" (chama stopRecording) se canStopRecording for true.
          // A aparência (cor) muda com base em isRecording e canStopRecording.
        >
          <MaterialCommunityIcons 
            name={isRecording ? "stop-circle" : "record-circle-outline"} 
            size={70} 
            color={(isRecording && !canStopRecording) ? "grey" : (isRecording ? "red" : "white")} 
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

// Estilos completos (copie da sua versão anterior ou da que enviei em "2025-06-04, 04:17 PM")
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