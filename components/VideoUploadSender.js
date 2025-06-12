import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import axios from 'axios';
import BigButton from './BigButton';

// CONFIRME SEU IP E PORTA
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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
  onFileUploadComplete,
  onFileUploadError,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async () => {
    if (!videoAsset || !videoAsset.uri) {
      Alert.alert('Nenhum vídeo', 'Nenhum vídeo válido para enviar.');
      return;
    }
    if (!orientation) {
      Alert.alert('Orientação Necessária', 'Por favor, selecione a orientação do movimento do gado.');
      if (onFileUploadError) {
          onFileUploadError(new Error("Orientação não definida pelo usuário."));
      }
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

    if (email && email.trim() !== '') formData.append('email', email.trim());
    if (consent !== null && consent !== undefined) formData.append('consent', String(consent));
    if (orientation) formData.append('orientation', orientation);

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload-video/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          let percent = uploadProgress;
          if (progressEvent.total) {
            percent = progressEvent.loaded / progressEvent.total;
          }
          setUploadProgress(percent);
        },
        timeout: 600000, // Timeout de 10 minutos para uploads grandes
      });

      setUploadProgress(1);
      if (onFileUploadComplete) {
        onFileUploadComplete(response.data); 
      }
    } catch (error) {
      console.error('AXIOS UPLOAD ERROR:', error);
      let errorMessage = error.response?.data?.detail || error.message || 'Não foi possível enviar o arquivo.';
      Alert.alert('Erro no Upload', errorMessage);
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
        title={isUploading ? "Enviando Arquivo..." : "Enviar para Análise"}
        onPress={handleFileUpload}
        disabled={isUploading || !orientation}
        buttonStyle={[
            styles.actionButton, 
            (isUploading || !orientation) && styles.actionButtonDisabled,
        ]}
      />
      {isUploading && uploadProgress < 1 && (
        <View style={styles.progressWrapper}>
          <InternalProgressBar progress={uploadProgress} />
          <Text style={styles.progressText}>{Math.round(uploadProgress * 100)}% enviado</Text>
        </View>
      )}
      {!isUploading && !orientation && videoAsset && (
        <Text style={styles.warningText}>Por favor, selecione a orientação do movimento.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 15, width: '100%', alignItems: 'center' },
  actionButton: { backgroundColor: '#28a745', width: '90%' },
  actionButtonDisabled: { backgroundColor: '#a5d6a7' },
  progressWrapper: { width: '90%', marginTop: 10, alignItems: 'center' },
  progressBarContainer: { height: 10, width: '100%', backgroundColor: '#e0e0e0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#007AFF', borderRadius: 5 },
  progressText: { marginTop: 5, fontSize: 12, color: '#333' },
  warningText: { marginTop: 8, fontSize: 14, color: '#e67e22', fontWeight: '500', textAlign: 'center' },
});