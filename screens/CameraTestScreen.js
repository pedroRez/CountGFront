import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
// Importa o módulo completo para usar .CameraView e .Camera
import * as ExpoCameraModule from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';

export default function CameraTestScreen({ navigation }) {
  const [hasAllPermissions, setHasAllPermissions] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false); // Novo estado para controlar se a câmera está pronta
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      console.log("[TESTE] Solicitando permissões...");
      // Solicita todas as permissões necessárias
      const { status: cameraStatus } = await ExpoCameraModule.Camera.requestCameraPermissionsAsync();
      const { status: audioStatus } = await ExpoCameraModule.Camera.requestMicrophonePermissionsAsync();
      const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
      
      const granted = cameraStatus === 'granted' && audioStatus === 'granted' && mediaStatus === 'granted';
      setHasAllPermissions(granted);

      if (!granted) {
        Alert.alert("Permissões Incompletas", "Para este teste, todas as permissões (câmera, áudio, galeria) são necessárias.");
      }
    })();
  }, []);

  const handleRecordButtonPress = async () => {
    // Verifica se a câmera está pronta e não está gravando
    if (!isCameraReady || !cameraRef.current) {
      Alert.alert("Aguarde", "A câmera ainda não está pronta.");
      return;
    }

    if (isRecording) {
      // --- Lógica para PARAR ---
      console.log("[TESTE] Botão Parar pressionado. Chamando stopRecording()...");
      cameraRef.current.stopRecording();
      // O resultado será tratado pela promessa de recordAsync em andamento
    } else {
      // --- Lógica para INICIAR ---
      setIsRecording(true);
      console.log("[TESTE] Iniciando a gravação (recordAsync)...");
      try {
        // Opções mínimas, mas com mute:true como no seu caso de uso principal
        const recordOptions = { mute: true };
        const data = await cameraRef.current.recordAsync(recordOptions);
        
        // Se a promise resolveu, a gravação foi bem-sucedida
        console.log("[TESTE] Gravação finalizada com sucesso! URI:", data.uri);
        
        Alert.alert("Sucesso!", "O vídeo foi gravado. Tentando salvar na galeria...");
        await MediaLibrary.saveToLibraryAsync(data.uri);
        Alert.alert("Salvo!", "O vídeo de teste foi salvo na sua galeria com sucesso.");
        navigation.goBack();

      } catch (error) {
        // Tratamento de erro específico e detalhado
        console.error("[TESTE] Erro detalhado durante a gravação:", JSON.stringify(error, null, 2));
        if (error.message.includes("Recording was stopped before any data could be produced")) {
            Alert.alert("Gravação Curta Demais", "O vídeo foi interrompido muito rápido. Tente gravar por mais tempo.");
        } else {
            Alert.alert("Erro de Gravação no Teste", `Ocorreu um erro: ${error.message}`);
        }
      } finally {
        // Garante que o estado seja sempre resetado
        setIsRecording(false);
      }
    }
  };
  
  if (hasAllPermissions === null) {
    return (
        <View style={styles.centered}>
            <ActivityIndicator size="large" color="#FFF" />
            <Text style={styles.text}>Solicitando permissões...</Text>
        </View>
    );
  }
  if (hasAllPermissions === false) {
    return (
        <View style={styles.centered}>
            <Text style={styles.text}>Permissões necessárias negadas.</Text>
        </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoCameraModule.CameraView
        ref={cameraRef} 
        style={styles.camera} 
        type={'back'}
        mode="video" // <<< CORREÇÃO PRINCIPAL ADICIONADA AQUI
        onCameraReady={() => setIsCameraReady(true)} // <<< GARANTE QUE A CÂMERA ESTÁ PRONTA
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, isRecording && styles.buttonStop, !isCameraReady && styles.buttonDisabled]} 
          onPress={handleRecordButtonPress}
          disabled={!isCameraReady} // Desabilita o botão se a câmera não estiver pronta
        >
          <Text style={styles.text}>
            {!isCameraReady ? 'Aguarde...' : (isRecording ? 'Parar Gravação' : 'Iniciar Teste')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    width: '100%',
    padding: 30,
    justifyContent: 'center',
  },
  button: {
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#007AFF',
  },
  buttonStop: {
    backgroundColor: '#ff4757', // Vermelho
  },
  buttonDisabled: {
    backgroundColor: '#8E8E93', // Cinza
  },
  text: { fontSize: 18, color: 'white', fontWeight: 'bold' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});