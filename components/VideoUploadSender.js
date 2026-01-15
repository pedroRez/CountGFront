import React, { useEffect, useRef, useState } from 'react';
import { View, Alert, StyleSheet, AppState } from 'react-native';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import BigButton from './BigButton';
import { useApi } from '../context/ApiContext';
import { useLanguage } from '../context/LanguageContext';

const CONNECTIVITY_TIMEOUT_MS = 5000;
const RETRY_INTERVAL_MS = 10000;

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
  const [isQueued, setIsQueued] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const retryTimerRef = useRef(null);
  const pendingPayloadRef = useRef(null);
  const isRetryingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const uploadTotalRef = useRef(null);
  const [status, setStatus] = useState({
    key: 'upload.processVideo',
    params: {},
  });

  const statusText = t(status.key, status.params);

  const resolveFileSize = async (assetUri, fallbackSize) => {
    if (Number.isFinite(fallbackSize) && fallbackSize > 0) {
      return fallbackSize;
    }
    if (!assetUri) return null;
    try {
      const info = await FileSystem.getInfoAsync(assetUri, { size: true });
      if (info?.exists && Number.isFinite(info.size)) {
        return info.size;
      }
    } catch (error) {
      console.warn('Failed to read file size:', error);
    }
    return null;
  };

  const pickUploadTotal = (eventTotal, fileSize) => {
    const total = Number(eventTotal);
    const size = Number(fileSize);
    const hasTotal = Number.isFinite(total) && total > 0;
    const hasSize = Number.isFinite(size) && size > 0;
    if (hasTotal && hasSize) {
      if (total < size * 0.9) return size;
      return Math.max(total, size);
    }
    if (hasTotal) return total;
    if (hasSize) return size;
    return 0;
  };

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        if (pendingPayloadRef.current) {
          tryResumePendingUpload({ showOfflineAlert: false });
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [apiUrl]);

  const isNetworkError = (error) => {
    if (!error) return false;
    if (error.isAxiosError && !error.response) return true;
    const message = String(error.message || '').toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('failed to fetch') ||
      message.includes('load failed')
    );
  };

  const scheduleRetry = () => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setInterval(() => {
      tryResumePendingUpload({ showOfflineAlert: false });
    }, RETRY_INTERVAL_MS);
  };

  const queueUpload = (payload, { showAlert = true } = {}) => {
    pendingPayloadRef.current = payload;
    setIsQueued(true);
    setUploadProgress(0);
    setStatus({ key: 'upload.waitingForConnection', params: {} });
    if (showAlert) {
      Alert.alert(
        t('upload.noInternetTitle'),
        t('upload.noInternetMessage')
      );
    }
    scheduleRetry();
  };

  const clearQueuedUpload = () => {
    pendingPayloadRef.current = null;
    setIsQueued(false);
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const checkServerReachable = async () => {
    if (!apiUrl) return false;
    try {
      await axios.get(apiUrl, { timeout: CONNECTIVITY_TIMEOUT_MS });
      return true;
    } catch (error) {
      return Boolean(error?.response);
    }
  };

  const buildUploadPayload = async () => {
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
      return null;
    }

    const ratioValue = Number(videoAsset?.linePositionRatio);
    const ratioNum = Number.isFinite(ratioValue) ? ratioValue : 0.5;
    const clampedRatio = Math.min(Math.max(ratioNum, 0), 1);

    const fileName = videoAsset.fileName || assetUri.split('/').pop();
    const mimeType = videoAsset.mimeType || 'video/mp4';
    const fileSize = await resolveFileSize(
      assetUri,
      videoAsset?.fileSize || videoAsset?.size
    );

    const trimStartValue = Number(videoAsset?.trimStartMs);
    const trimEndValue = Number(videoAsset?.trimEndMs);
    const trimStartMs = Number.isFinite(trimStartValue)
      ? Math.max(0, Math.round(trimStartValue))
      : null;
    const trimEndMs = Number.isFinite(trimEndValue)
      ? Math.max(0, Math.round(trimEndValue))
      : null;

    return {
      assetUri,
      fileName,
      mimeType,
      fileSize,
      finalOrientation,
      modelChoice,
      linePositionRatio: clampedRatio,
      trimStartMs,
      trimEndMs,
      targetClasses,
    };
  };

  const startUpload = async (payload, { showOfflineAlert = true } = {}) => {
    if (!payload || isRetryingRef.current) return;
    isRetryingRef.current = true;
    uploadTotalRef.current = null;
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: payload.assetUri,
      name: payload.fileName,
      type: payload.mimeType,
    });

    setIsUploading(true);
    setUploadProgress(0);
    setStatus({ key: 'upload.uploadingWithPercent', params: { percent: 0 } });

    try {
      const responseData = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiUrl}/upload-video/`);
        xhr.timeout = 600000;

        xhr.upload.onprogress = (event) => {
          console.log(
            `[UPLOAD PROGRESS] Event received: loaded=${event.loaded}, total=${event.total}`
          );

          const loaded = Number(event.loaded);
          if (!Number.isFinite(loaded) || loaded < 0) {
            return;
          }
          if (!uploadTotalRef.current) {
            const inferredTotal = pickUploadTotal(event.total, payload.fileSize);
            if (inferredTotal > 0) {
              uploadTotalRef.current = inferredTotal;
            }
          }
          const totalForProgress = uploadTotalRef.current;
          if (!totalForProgress) {
            setStatus({ key: 'upload.uploading', params: {} });
            return;
          }
          const safeTotal = Math.max(totalForProgress, loaded);
          const clampedProgress = Math.min(loaded / safeTotal, 1);

          setUploadProgress(clampedProgress);
          setStatus({
            key: 'upload.uploadingWithPercent',
            params: { percent: Math.round(clampedProgress * 100) },
          });
        };

        xhr.upload.onload = () => {
          setUploadProgress(1);
          setStatus({ key: 'upload.savingOnServer', params: {} });
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

      const hasTrimRange =
        Number.isFinite(payload.trimStartMs) &&
        Number.isFinite(payload.trimEndMs) &&
        payload.trimEndMs > payload.trimStartMs;

      const predictPayload = {
        nome_arquivo: responseData?.nome_arquivo,
        orientation: payload.finalOrientation,
        model_choice: payload.modelChoice,
        line_position_ratio: payload.linePositionRatio,
        ...(hasTrimRange
          ? {
              trim_start_ms: payload.trimStartMs,
              trim_end_ms: payload.trimEndMs,
            }
          : {}),
        target_classes:
          Array.isArray(payload.targetClasses) && payload.targetClasses.length > 0
            ? payload.targetClasses
            : null,
      };

      const predictResponse = await axios.post(
        `${apiUrl}/predict-video/`,
        predictPayload
      );

      setUploadProgress(1);
      setStatus({ key: 'upload.uploadComplete', params: {} });
      clearQueuedUpload();

      if (onProcessingStarted) {
        onProcessingStarted(predictResponse.data);
      }
    } catch (error) {
      if (isNetworkError(error)) {
        queueUpload(payload, { showAlert: showOfflineAlert });
      } else {
        const errorMsg =
          error.response?.data?.detail ||
          error.message ||
          t('upload.processingErrorFallback');
        Alert.alert(t('upload.processingErrorTitle'), errorMsg);
        clearQueuedUpload();
        if (onUploadError) onUploadError(error);
      }
    } finally {
      setIsUploading(false);
      isRetryingRef.current = false;
      if (!pendingPayloadRef.current) {
        setStatus({ key: 'upload.processVideo', params: {} });
      }
    }
  };

  const tryResumePendingUpload = async ({ showOfflineAlert = false } = {}) => {
    if (isUploading || isRetryingRef.current) return;
    const pendingPayload = pendingPayloadRef.current;
    if (!pendingPayload) return;
    const reachable = await checkServerReachable();
    if (!reachable) return;
    await startUpload(pendingPayload, { showOfflineAlert });
  };

  const handleProcessRequest = async () => {
    if (pendingPayloadRef.current) {
      tryResumePendingUpload({ showOfflineAlert: false });
      return;
    }
    const payload = await buildUploadPayload();
    if (!payload) return;
    const reachable = await checkServerReachable();
    if (!reachable) {
      queueUpload(payload, { showAlert: true });
      return;
    }
    startUpload(payload, { showOfflineAlert: true });
  };

  return (
    <View style={styles.container}>
      <BigButton
        title={statusText}
        onPress={handleProcessRequest}
        disabled={isUploading || isQueued}
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
