import React from 'react';
import { View, Button, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

export default function VideoUploader({
  setVideo,
  setCountResult,
  setVideoEnviado,
  setUploadProgress,
  setLoading,
  setProcessingProgress,
  setTempoRestante,
  setCancelando
}) {
  const handleVideoPick = async () => {
    // Resetar tudo antes da nova seleção
    setVideo(null);
    setCountResult(null);
    setVideoEnviado(false);
    setUploadProgress(0);
    setLoading(false);
    setProcessingProgress(0);
    setTempoRestante(null);
    setCancelando(false);

    // Abrir seletor de vídeo
    const result = await DocumentPicker.getDocumentAsync({ type: 'video/*' });

    if (result.canceled) {
      Alert.alert('Seleção cancelada');
    } else {
      const file = result.assets[0];
      setVideo(file);
    }
  };

  return (
    <View>
      <Button title="Selecionar Vídeo" onPress={handleVideoPick} />
    </View>
  );
}
