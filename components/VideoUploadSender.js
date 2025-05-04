import React from 'react';
import { View, Text, Button, Alert } from 'react-native';
import axios from 'axios';

const API_BASE_URL = 'https://e36f-149-19-164-150.ngrok-free.app';

export default function VideoUploadSender({
  video,
  uploadProgress,
  setUploadProgress,
  setVideoEnviado
}) {
  const handleUpload = async () => {
    if (!video || !video.uri || !video.name) {
      Alert.alert('Nenhum vídeo válido selecionado!');
      return;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: video.uri,
      name: video.name,
      type: 'video/mp4',
    });

    try {
      await axios.post(`${API_BASE_URL}/upload-video/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = progressEvent.loaded / progressEvent.total;
          setUploadProgress(percent);
        },
      });

      Alert.alert('Upload concluído com sucesso!');
      setVideoEnviado(true);
    } catch (error) {
      console.error('Erro no upload:', error.message);
      Alert.alert('Erro no upload do vídeo.');
      setUploadProgress(0);
      setVideoEnviado(false);
    }
  };

  return (
    <View style={{ marginTop: 20 }}>
      <Button title="Fazer Upload do Vídeo" onPress={handleUpload} />
      {uploadProgress > 0 && (
        <>
          <View style={{
            height: 20,
            width: '100%',
            backgroundColor: '#ccc',
            borderRadius: 10,
            marginTop: 10
          }}>
            <View
              style={{
                height: 20,
                width: `${Math.min(uploadProgress * 100, 100)}%`,
                backgroundColor: '#2196F3',
                borderRadius: 10,
              }}
            />
          </View>
          <Text style={{ marginTop: 5 }}>{Math.round(uploadProgress * 100)}% enviado</Text>
        </>
      )}
    </View>
  );
}
