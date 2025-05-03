import React, { useState } from 'react';
import { View, Text, Button, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';

const API_BASE_URL = 'https://1240-149-19-164-150.ngrok-free.app';

export default function App() {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [countResult, setCountResult] = useState(null);

  const handleVideoPick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
    });

    if (result.canceled) {
      setVideo(null);
      Alert.alert('Seleção cancelada');
    } else {
      const file = result.assets[0];
      setVideo(file);
      setCountResult(null);
    }
  };

  const handleUpload = async () => {
    if (!video) {
      Alert.alert('Nenhum vídeo selecionado!');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', {
        uri: video.uri,
        name: video.name,
        type: 'video/mp4',
      });

      const response = await axios.post(`${API_BASE_URL}/predict-video/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setCountResult(response.data);
    } catch (error) {
      console.error('Erro ao enviar vídeo:', error.message);
      Alert.alert('Erro', 'Não foi possível enviar o vídeo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>
        Contagem de Gado
      </Text>
      <Button title="Selecionar Vídeo" onPress={handleVideoPick} />

      {video && (
        <Text style={{ marginTop: 10 }}>Vídeo selecionado: {video.name}</Text>
      )}

      <View style={{ marginTop: 20 }}>
        <Button
          title="Enviar para Contagem"
          onPress={handleUpload}
          disabled={!video || loading}
        />
      </View>

      {loading && (
        <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
      )}

      {countResult && (
        <View style={{ marginTop: 30 }}>
          <Text style={{ fontSize: 18 }}>Resultado da Contagem:</Text>
          <Text style={{ fontSize: 16 }}>Vídeo: {countResult.video}</Text>
          <Text style={{ fontSize: 16 }}>Duração (frames): {countResult.total_frames}</Text>
          <Text style={{ fontSize: 22, fontWeight: 'bold', marginTop: 10 }}>
            {countResult.total_count} bois contados
          </Text>

          {countResult.por_classe &&
            Object.entries(countResult.por_classe).map(([classe, quantidade]) => (
              <Text key={classe} style={{ fontSize: 16 }}>
                {classe}: {quantidade}
              </Text>
            ))}
        </View>
      )}
    </View>
  );
}
