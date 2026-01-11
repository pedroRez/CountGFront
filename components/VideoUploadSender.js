import React, { useEffect, useRef, useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import axios from 'axios';
import BigButton from './BigButton';
import { useApi } from '../context/ApiContext';
import { useLanguage } from '../context/LanguageContext';

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
  countName,
  countDescription,
  orientation,
  modelChoice,
  targetClasses,
  onProcessingStarted,
  onUploadError,
}) {
  const { apiUrl } = useApi();
  const { t } = useLanguage();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const finalizeTimerRef = useRef(null);
  const [status, setStatus] = useState({
    key: 'upload.processVideo',
    params: {},
  });

  const statusText = t(status.key, status.params);

  useEffect(() => {
    return () => {
      if (finalizeTimerRef.current) {
        clearInterval(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
    };
  }, []);

  const handleProcessRequest = async () => {
    if (finalizeTimerRef.current) {
      clearInterval(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    const assetUri = videoAsset?.uri || videoAsset?.localUri;
    const finalOrientation = orientation || videoAsset?.orientation;
    const trimmedCountName = (countName || '').trim();
    if (!trimmedCountName) {
      Alert.alert(
        t('upload.missingCountNameTitle'),
        t('upload.missingCountNameMessage')
      );
      return;
    }
    if (!assetUri || !finalOrientation || !modelChoice) {
      Alert.alert(
        t('upload.missingDataTitle'),
        t('upload.missingDataMessage')
      );
      return;
    }
    if (!apiUrl) {
      Alert.alert(t('upload.configErrorTitle'), t('upload.configErrorMessage'));
      return;
    }

    const ratioValue = Number(videoAsset?.linePositionRatio);
    const ratioNum = Number.isFinite(ratioValue) ? ratioValue : 0.5;
    const clampedRatio = Math.min(Math.max(ratioNum, 0), 1);

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
    setStatus({ key: 'upload.uploadingWithPercent', params: { percent: 0 } });

    try {
      const responseData = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiUrl}/upload-video/`);
        xhr.timeout = 600000;
        const maxUploadProgress = 0.95;
        const startFinalizing = () => {
          if (finalizeTimerRef.current) return;
          finalizeTimerRef.current = setInterval(() => {
            setUploadProgress((prev) => {
              const next = Math.min(prev + 0.005, 0.99);
              setStatus({
                key: 'upload.uploadingWithPercent',
                params: { percent: Math.round(next * 100) },
              });
              if (next >= 0.99 && finalizeTimerRef.current) {
                clearInterval(finalizeTimerRef.current);
                finalizeTimerRef.current = null;
              }
              return next;
            });
          }, 300);
        };

        xhr.upload.onprogress = (event) => {
          console.log(
            `[UPLOAD PROGRESS] Event received: loaded=${event.loaded}, total=${event.total}`
          );

          const percent = event.total ? event.loaded / event.total : 0;
          const clampedProgress = Math.min(percent, 1.0) * maxUploadProgress;

          setUploadProgress(clampedProgress);
          setStatus({
            key: 'upload.uploadingWithPercent',
            params: { percent: Math.round(clampedProgress * 100) },
          });
        };

        xhr.upload.onload = () => {
          startFinalizing();
        };

        xhr.onload = () => {
          if (finalizeTimerRef.current) {
            clearInterval(finalizeTimerRef.current);
            finalizeTimerRef.current = null;
          }
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

      const trimStartValue = Number(videoAsset?.trimStartMs);
      const trimEndValue = Number(videoAsset?.trimEndMs);
      const trimStartMs = Number.isFinite(trimStartValue)
        ? Math.max(0, Math.round(trimStartValue))
        : null;
      const trimEndMs = Number.isFinite(trimEndValue)
        ? Math.max(0, Math.round(trimEndValue))
        : null;
      const hasTrimRange =
        Number.isFinite(trimStartMs) &&
        Number.isFinite(trimEndMs) &&
        trimEndMs > trimStartMs;

      const predictPayload = {
        nome_arquivo: responseData?.nome_arquivo,
        orientation: finalOrientation,
        model_choice: modelChoice,
        line_position_ratio: clampedRatio,
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

      setUploadProgress(1);
      setStatus({ key: 'upload.uploadComplete', params: {} });

      if (onProcessingStarted) {
        onProcessingStarted(predictResponse.data);
      }
    } catch (error) {
      const errorMsg =
        error.response?.data?.detail ||
        error.message ||
        t('upload.processingErrorFallback');
      Alert.alert(t('upload.processingErrorTitle'), errorMsg);
      if (onUploadError) onUploadError(error);
    } finally {
      setIsUploading(false);
      setStatus({ key: 'upload.processVideo', params: {} });
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
