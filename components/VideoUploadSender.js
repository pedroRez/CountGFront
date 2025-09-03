import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import axios from 'axios';
import BigButton from './BigButton';
import CustomActivityIndicator from './CustomActivityIndicator';
import { useApi } from '../context/ApiContext';

const InternalProgressBar = ({ progress }) => (
  <View style={styles.progressBarContainer}>
    <View
      style={[
        styles.progressBarFill,
        { width: `${Math.min(progress * 100, 100)}%` },
      ]}
    />
  </View>
);

export default function VideoUploadSender({
  videoAsset,
  email,
  consent,
  orientation,
  modelChoice,
  onProcessingStarted,
  onUploadError,
}) {
  const { apiUrl } = useApi();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusText, setStatusText] = useState('Processar Vídeo');

  const handleProcessRequest = async () => {
    if (!videoAsset || !orientation || !modelChoice) {
      Alert.alert(
        'Faltam Dados',
        'Por favor, selecione um vídeo, a orientação e o nível de processamento.'
      );
      return;
    }
    if (!apiUrl) {
      Alert.alert('Erro de Configuração', 'A URL da API não foi encontrada.');
      return;
    }

    const fileName = videoAsset.fileName || videoAsset.uri.split('/').pop();
    const mimeType = videoAsset.mimeType || 'video/mp4';

    const formData = new FormData();
    formData.append('file', {
      uri: videoAsset.uri,
      name: fileName,
      type: mimeType,
    });
    formData.append('orientation', orientation);
    formData.append('model_choice', modelChoice);
    if (email && email.trim() !== '') {
      formData.append('email', email.trim());
    }
    if (consent) {
      formData.append('consent', String(consent));
    }

    setIsUploading(true);
    setUploadProgress(0);
    setStatusText('Enviando... 0%');

    try {
      const response = await axios.post(`${apiUrl}/process-video/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          // --- LOGS DE DEPURAÇÃO ADICIONADOS AQUI ---
          console.log(
            `[UPLOAD PROGRESS] Evento recebido: loaded=${progressEvent.loaded}, total=${progressEvent.total}`
          );

          let percent = 0;
          if (progressEvent.total) {
            percent = progressEvent.loaded / progressEvent.total;
          }
          console.log(
            `[UPLOAD PROGRESS] Porcentagem calculada (bruta): ${percent}`
          );

          // Trava o valor em no máximo 1.0 (100%)
          const clampedProgress = Math.min(percent, 1.0);
          console.log(
            `[UPLOAD PROGRESS] Progresso final (limitado a 1.0): ${clampedProgress}`
          );

          setUploadProgress(clampedProgress);

          const displayText = `Enviando... ${Math.round(clampedProgress * 100)}%`;
          setStatusText(displayText);
        },
        timeout: 600000,
      });

      // Quando o upload termina, antes de chamar o callback, atualiza o status
      setStatusText('Upload concluído. Aguardando início do processamento...');

      if (onProcessingStarted) {
        onProcessingStarted(response.data);
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.detail ||
        'Falha ao enviar vídeo para processamento.';
      Alert.alert('Erro no Envio', errorMsg);
      if (onUploadError) onUploadError(error);
    } finally {
      setIsUploading(false);
      setStatusText('Processar Vídeo');
    }
  };

  return (
    <View style={styles.container}>
      <BigButton
        title={statusText}
        onPress={handleProcessRequest}
        disabled={isUploading}
        buttonStyle={styles.actionButton}
      />
      {isUploading && (
        <View style={styles.progressWrapper}>
          <InternalProgressBar progress={uploadProgress} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 20, width: '100%', alignItems: 'center' },
  actionButton: { backgroundColor: '#28a745', width: '100%' },
  progressWrapper: { width: '100%', marginTop: 10 },
  progressBarContainer: {
    height: 10,
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: '#007AFF' },
});
