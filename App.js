import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, Alert, ActivityIndicator, ProgressBarAndroid } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';

const API_BASE_URL = 'https://e36f-149-19-164-150.ngrok-free.app';

export default function App() {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [countResult, setCountResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [tempoRestante, setTempoRestante] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const pollingRef = useRef(null);

  const handleVideoPick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'video/*' });

    if (result.canceled) {
      setVideo(null);
      Alert.alert('Seleção cancelada');
    } else {
      const file = result.assets[0];
      setVideo(file);
      setCountResult(null);
      setProgress(0);
      setTempoRestante(null);
    }
  };

  const iniciarPollingProgresso = (videoName) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/progresso/${videoName}`);
        if (res.data.total_frames_estimado > 0) {
          const percent = res.data.frame_atual / res.data.total_frames_estimado;
          setProgress(percent);
          setTempoRestante(res.data.tempo_restante); // já vem como hh:mm:ss
        }
      } catch (err) {
        console.error('Erro ao buscar progresso:', err.message);
      }
    }, 5000); // 5 segundos
  };

  const pararPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleUpload = async () => {
    if (!video) {
      Alert.alert('Nenhum vídeo selecionado!');
      return;
    }

    try {
      setLoading(true);
      setProgress(0);
      const formData = new FormData();
      formData.append('file', {
        uri: video.uri,
        name: video.name,
        type: 'video/mp4',
      });

      iniciarPollingProgresso(video.name);

      const response = await axios.post(`${API_BASE_URL}/predict-video/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0, // sem limite de tempo
      });

      setCountResult(response.data);
    } catch (error) {
      console.error('Erro ao enviar vídeo:', error.message);
      Alert.alert('Erro', 'Não foi possível enviar o vídeo.');
    } finally {
      setLoading(false);
      pararPolling();
    }
  };

  const handleCancel = async () => {
    if (!video) return;

    try {
      setCancelando(true);
      await axios.get(`${API_BASE_URL}/cancelar-processamento/${video.name}`);
      pararPolling();
      setLoading(false);
      setProgress(0);
      setTempoRestante(null);
      Alert.alert('Cancelado', 'Processamento cancelado com sucesso.');
    } catch (error) {
      console.error('Erro ao cancelar:', error.message);
      Alert.alert('Erro ao cancelar processamento.');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>Contagem de Gado</Text>
      <Button title="Selecionar Vídeo" onPress={handleVideoPick} />

      {video && <Text style={{ marginTop: 10 }}>Vídeo selecionado: {video.name}</Text>}

      <View style={{ marginTop: 20 }}>
        <Button
          title="Enviar para Contagem"
          onPress={handleUpload}
          disabled={!video || loading}
        />
      </View>

      {loading && (
        <View style={{ marginTop: 20 }}>
          <View style={{ height: 20, width: '100%', backgroundColor: '#ccc', borderRadius: 10 }}>
            <View
              style={{
                height: 20,
                width: `${Math.min(progress * 100, 100)}%`,
                backgroundColor: '#4caf50',
                borderRadius: 10,
              }}
            />
          </View>
          <Text style={{ marginTop: 10 }}>{Math.round(progress * 100)}% concluído</Text>

          {tempoRestante !== null && (
            <Text>Tempo restante estimado: {tempoRestante}</Text>
          )}
          <Button title="Cancelar" onPress={handleCancel} color="red" disabled={cancelando} />
        </View>
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
