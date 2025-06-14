import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import axios from 'axios';
import BigButton from './BigButton';
import CustomActivityIndicator from './CustomActivityIndicator'; // Usando nosso componente seguro

// Lê a URL da API do arquivo .env
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Componente interno para a barra de progresso do upload
const InternalProgressBar = ({ progress }) => (
  <View style={styles.progressBarContainer}>
    <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
  </View>
);

export default function VideoUploadSender({
  videoAsset,
  email,
  consent,
  orientation,
  modelChoice, // <<< Nova prop para a escolha do modelo
  onProcessingStarted, // <<< Nova callback, chamada quando o backend confirma o início
  onUploadError,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleProcessRequest = async () => {
    // Validação dos dados antes do envio
    if (!videoAsset || !orientation || !modelChoice) {
      Alert.alert('Faltam Dados', 'Por favor, selecione um vídeo, a orientação e o nível de processamento.');
      return;
    }
    if (!API_BASE_URL) {
      Alert.alert('Erro de Configuração', 'A URL da API não foi encontrada. Verifique o arquivo .env do seu projeto frontend.');
      return;
    }

    const fileName = videoAsset.fileName || videoAsset.name || videoAsset.uri.split('/').pop();
    const mimeType = videoAsset.mimeType || 'video/mp4';

    const formData = new FormData();
    
    // Adiciona todos os dados ao mesmo FormData
    formData.append('file', { uri: videoAsset.uri, name: fileName, type: mimeType });
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

    try {
      // Faz a chamada para o NOVO endpoint único
      const response = await axios.post(`${API_BASE_URL}/process-video/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(progressEvent.loaded / progressEvent.total);
          }
        },
        timeout: 600000, // Timeout de 10 minutos para uploads grandes
      });
      
      // Se a resposta foi OK, significa que o backend iniciou o processamento
      if (onProcessingStarted) {
        onProcessingStarted(response.data); 
      }
    } catch (error) {
        const errorMsg = error.response?.data?.detail || 'Falha ao enviar vídeo para processamento. Verifique sua conexão e o servidor.';
        Alert.alert('Erro no Envio', errorMsg);
        if (onUploadError) {
          onUploadError(error);
        }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <BigButton
        title={isUploading ? `Enviando...` : "Processar Vídeo"}
        onPress={handleProcessRequest}
        disabled={isUploading || !orientation || !modelChoice}
        buttonStyle={[styles.actionButton, (isUploading || !orientation || !modelChoice) && styles.actionButtonDisabled]}
      />
      {isUploading && (
        <View style={styles.progressWrapper}>
          <InternalProgressBar progress={uploadProgress} />
          <Text style={styles.progressText}>{Math.round(uploadProgress * 100)}% enviado</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 20, width: '100%', alignItems: 'center' },
  actionButton: { backgroundColor: '#28a745', width: '100%' },
  actionButtonDisabled: { backgroundColor: '#a5d6a7' },
  progressWrapper: { width: '100%', marginTop: 10 },
  progressBarContainer: { height: 10, width: '100%', backgroundColor: '#e0e0e0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#007AFF' },
  progressText: { textAlign: 'center', marginTop: 5, fontSize: 12, color: '#333' },
});