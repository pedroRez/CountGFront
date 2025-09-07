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
  const [statusText, setStatusText] = useState('Process Video');

  const handleProcessRequest = async () => {
    if (!videoAsset || !orientation || !modelChoice) {
      Alert.alert(
        'Missing Data',
        'Please select a video, orientation, and processing level.'
      );
      return;
    }
    if (!apiUrl) {
      Alert.alert('Configuration Error', 'The API URL was not found.');
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
    setStatusText('Uploading... 0%');

    try {
      const response = await axios.post(`${apiUrl}/upload-video/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          // Prevent updates if loaded exceeds total
          if (progressEvent.loaded > progressEvent.total) {
            return;
          }

          console.log(
            `[UPLOAD PROGRESS] Event received: loaded=${progressEvent.loaded}, total=${progressEvent.total}`
          );

          let percent = 0;
          if (progressEvent.total) {
            percent = progressEvent.loaded / progressEvent.total;
          }

          // Clamp the value to a maximum of 1.0 (100%)
          const clampedProgress = Math.min(percent, 1.0);

          setUploadProgress(clampedProgress);

          const displayText = `Uploading... ${Math.round(
            clampedProgress * 100
          )}%`;
          setStatusText(displayText);

          if (progressEvent.loaded === progressEvent.total) {
            console.log('[UPLOAD PROGRESS] Upload complete.');
          }
        },
        timeout: 600000,
      });

      // When upload finishes, initiate prediction
      setStatusText('Upload complete. Starting analysis...');

      // Additional parameters required by the backend for prediction
      const predictResponse = await axios.post(`${apiUrl}/predict-video/`, {
        nome_arquivo: response.data?.nome_arquivo,
        orientation,
        model_choice: modelChoice,
        // TODO: Replace placeholder values with real data as needed
        target_classes: [],
        line_position_ratio: null,
      });

      if (onProcessingStarted) {
        onProcessingStarted(predictResponse.data);
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.detail || 'Failed to start video processing.';
      Alert.alert('Processing Error', errorMsg);
      if (onUploadError) onUploadError(error);
    } finally {
      setIsUploading(false);
      setStatusText('Process Video');
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
