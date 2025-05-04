import React from 'react';
import { View, Button, Text, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';

const UploadSection = ({ onUploadComplete }) => {
  const handlePickVideo = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'video/*' });
    if (result.type === 'cancel') return;

    const formData = new FormData();
    formData.append('video', {
      uri: result.uri,
      name: result.name,
      type: 'video/mp4',
    });

    try {
      const res = await axios.post('http://<SEU_BACKEND>/upload-video/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0, // sem limite de tempo
      });
      onUploadComplete(res.data); // passa dados do vídeo
    } catch (err) {
      console.error('Erro ao enviar vídeo:', err);
      Alert.alert('Erro', 'Erro ao enviar vídeo');
    }
  };

  return (
    <View style={{ marginBottom: 20 }}>
      <Button title="Selecionar e Enviar Vídeo" onPress={handlePickVideo} />
    </View>
  );
};

export default UploadSection;
