import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet, TextInput } from 'react-native';
import axios from 'axios';
import BigButton from './BigButton';
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
  orientation,
  modelChoice,
  targetClasses,
  onProcessingStarted,
  onUploadError,
}) {
  const { apiUrl } = useApi();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusText, setStatusText] = useState('Process Video');
  const [linePositionRatio, setLinePositionRatio] = useState('0.5');

  const handleProcessRequest = async () => {
    const assetUri = videoAsset?.uri || videoAsset?.localUri;
    const finalOrientation = orientation || videoAsset?.orientation;
    if (!assetUri || !finalOrientation || !modelChoice) {
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

    const ratioNum = parseFloat(linePositionRatio);
    if (isNaN(ratioNum) || ratioNum < 0 || ratioNum > 1) {
      Alert.alert(
        'Invalid Ratio',
        'Please provide a line position ratio between 0 and 1.'
      );
      return;
    }

    const fileName = videoAsset.fileName || assetUri.split('/').pop();
    const mimeType = videoAsset.mimeType || 'video/mp4';

    const formData = new FormData();
    formData.append('file', {
      uri: assetUri,
      name: fileName,
      type: mimeType,
    });

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

      const trimStartMs = Number.isFinite(videoAsset?.trimStartMs)
        ? Math.max(0, Math.round(videoAsset.trimStartMs))
        : null;
      const trimEndMs = Number.isFinite(videoAsset?.trimEndMs)
        ? Math.max(0, Math.round(videoAsset.trimEndMs))
        : null;
      const hasTrimRange =
        Number.isFinite(trimStartMs) &&
        Number.isFinite(trimEndMs) &&
        trimEndMs > trimStartMs;

      const predictPayload = {
        nome_arquivo: responseData?.nome_arquivo,
        orientation: finalOrientation,
        model_choice: modelChoice,
        line_position_ratio: ratioNum,
        ...(hasTrimRange
          ? { trim_start_ms: trimStartMs, trim_end_ms: trimEndMs }
          : {}),
        target_classes:
          Array.isArray(targetClasses) && targetClasses.length > 0
            ? targetClasses
            : null,
      };

      const predictResponse = await axios.post(
        `${apiUrl}/predict-video/`,
        predictPayload
      );

      if (onProcessingStarted) {
        onProcessingStarted(predictResponse.data);
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.detail ||
        error.message ||
        'Failed to start video processing.';
      Alert.alert('Processing Error', errorMsg);
      if (onUploadError) onUploadError(error);
    } finally {
      setIsUploading(false);
      setStatusText('Process Video');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <Text style={styles.label}>Line Position Ratio (0-1)</Text>
        <TextInput
          style={styles.input}
          value={linePositionRatio}
          onChangeText={setLinePositionRatio}
          keyboardType="numeric"
        />
      </View>
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
  inputWrapper: { width: '100%', marginBottom: 10 },
  label: { marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    width: '100%',
  },
  progressBarContainer: {
    height: 10,
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: '#007AFF' },
});
