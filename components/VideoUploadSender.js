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
      const responseData = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiUrl}/upload-video/`);
        xhr.timeout = 600000;

        xhr.upload.onprogress = (event) => {
          if (event.loaded >= event.total) {
            xhr.upload.onprogress = null;
            return;
          }

          console.log(
            `[UPLOAD PROGRESS] Event received: loaded=${event.loaded}, total=${event.total}`
          );

          const percent = event.total ? event.loaded / event.total : 0;
          const clampedProgress = Math.min(percent, 1.0);

          setUploadProgress(clampedProgress);
          setStatusText(`Uploading... ${Math.round(clampedProgress * 100)}%`);
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (e) {
              resolve({});
            }
          } else {
            reject(new Error('Upload failed'));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.ontimeout = () => reject(new Error('Upload timeout'));

        xhr.send(formData);
      });

      setStatusText('Upload complete. Starting analysis...');

      const predictResponse = await axios.post(`${apiUrl}/predict-video/`, {
        nome_arquivo: responseData?.nome_arquivo,
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
        error.response?.data?.detail || error.message || 'Failed to start video processing.';
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
