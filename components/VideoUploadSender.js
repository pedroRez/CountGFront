// components/VideoUploadSender.js
import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import axios from 'axios';
import BigButton from './BigButton';

// CONFIRME ESTE IP E PORTA! Deve ser o mesmo usado na HomeScreen para as outras chamadas.
const API_BASE_URL = 'http://192.168.0.48:8000';

// Barra de progresso interna para o upload do arquivo
const InternalProgressBar = ({ progress }) => (
  <View style={styles.progressBarContainer}>
    <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
  </View>
);

export default function VideoUploadSender({
  videoAsset, // O objeto 'asset' completo
  onFileUploadComplete, // Callback: (fileInfo) => void - fileInfo = { nome_arquivo: "..." }
  onFileUploadError,    // Callback: (error) => void
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async () => {
    if (!videoAsset || !videoAsset.uri) {
      Alert.alert('Nenhum vídeo', 'Nenhum vídeo válido para enviar.');
      return;
    }

    const fileName = videoAsset.fileName || videoAsset.name || videoAsset.uri.split('/').pop();
    const mimeType = videoAsset.mimeType || 'video/mp4';

    const formData = new FormData();
    formData.append('file', {
      uri: videoAsset.uri,
      name: fileName,
      type: mimeType,
    });

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload-video/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = progressEvent.loaded / progressEvent.total;
            setUploadProgress(percent);
          }
        },
      });

      setUploadProgress(1); // Upload do arquivo concluído
      if (onFileUploadComplete) {
        // response.data deve ser { message: "...", nome_arquivo: "..." }
        onFileUploadComplete(response.data); 
      }
    } catch (error) {
      console.error('Erro no upload do arquivo:', error.response ? JSON.stringify(error.response.data) : error.message);
      Alert.alert(
        'Erro no Upload do Arquivo',
        error.response?.data?.detail || 'Não foi possível enviar o arquivo.'
      );
      setUploadProgress(0);
      if (onFileUploadError) {
        onFileUploadError(error);
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <BigButton
        title={isUploading ? `Enviando Arquivo... ${Math.round(uploadProgress * 100)}%` : "Enviar Vídeo para Servidor"}
        onPress={handleFileUpload}
        disabled={isUploading}
        buttonStyle={[styles.actionButton, isUploading && styles.actionButtonDisabled]}
      />
      {isUploading && uploadProgress < 1 && ( // Mostra apenas durante o upload ativo do arquivo
        <View style={styles.progressWrapper}>
          <InternalProgressBar progress={uploadProgress} />
          <Text style={styles.progressText}>{Math.round(uploadProgress * 100)}% enviado</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 15,
    width: '100%',
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: '#007AFF', // Azul para enviar arquivo
    width: '90%',
  },
  actionButtonDisabled: {
    backgroundColor: '#79baff',
  },
  progressWrapper: {
    width: '90%',
    marginTop: 10,
    alignItems: 'center',
  },
  progressBarContainer: {
    height: 10,
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#007AFF', 
    borderRadius: 5,
  },
  progressText: {
    marginTop: 5,
    fontSize: 12,
    color: '#333',
  },
});