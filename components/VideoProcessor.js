import React, { useRef } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import axios from 'axios';

const API_BASE_URL = 'http://192.168.0.28:8000';

export default function VideoProcessor({
  video,
  setCountResult,
  setLoading,
  progress,
  setProgress,
  tempoRestante,
  setTempoRestante,
  cancelando,
  setCancelando,
  loading
}) {
  const pollingRef = useRef(null);

  const iniciarPollingProgresso = (videoName) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/progresso/${videoName}`);
        const data = res.data;

        if (data.erro) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setLoading(false);
          Alert.alert("Erro", data.erro);
          return;
        }

        if (data.total_frames_estimado > 0) {
          const percent = data.frame_atual / data.total_frames_estimado;
          setProgress(percent);
          setTempoRestante(data.tempo_restante);
        }

        if (data.finalizado && data.resultado) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setLoading(false);
          setCountResult(data.resultado);
        }

      } catch (err) {
        console.error('Erro ao buscar progresso:', err.message);
      }
    }, 5000);
  };

  const pararPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleProcessar = async () => {
    if (!video || !video.name) return;

    try {
      setLoading(true);
      setProgress(0);
      setTempoRestante("Calculando...");
      setCountResult(null);

      const response = await axios.post(`${API_BASE_URL}/predict-video/`, {
        nome_arquivo: video.name,
      });

      if (response.data.message === "Processamento iniciado.") {
        iniciarPollingProgresso(video.name);
      } else {
        Alert.alert("Erro", "Não foi possível iniciar o processamento.");
        setLoading(false);
      }
    } catch (error) {
      console.error("Erro ao iniciar o processamento:", error.message);
      Alert.alert("Erro", "Erro ao iniciar o processamento.");
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!video || !video.name) return;

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
    <View style={{ marginTop: 20 }}>
      <Button title="Processar Vídeo" onPress={handleProcessar} disabled={!video || loading} />

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
          {tempoRestante && <Text>Tempo restante estimado: {tempoRestante}</Text>}
          <Button title="Cancelar" onPress={handleCancel} color="red" disabled={cancelando} />
        </View>
      )}
    </View>
  );
}
