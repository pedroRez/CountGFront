import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  AppState,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

import BigButton from '../components/BigButton';
import VideoUploadSender from '../components/VideoUploadSender';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import MenuButton from '../components/MenuButton';
import { useApi } from '../context/ApiContext';
import { useOrientationMap } from '../context/OrientationMapContext';
import { useLanguage } from '../context/LanguageContext';
import { useCounts } from '../context/CountsContext';

const { MediaTypeOptions } = ImagePicker;

const BackendProgressBar = ({ progress, text }) => (
  <View style={styles.backendProgressContainer}>
    <Text style={styles.processingInfoText}>{text}</Text>
    <View style={styles.progressBarContainer}>
      <View
        style={[
          styles.progressBarFill,
          { width: `${Math.min(progress * 100, 100)}%` },
        ]}
      />
    </View>
    <Text style={styles.progressPercentText}>
      {Math.round(progress * 100)}%
    </Text>
  </View>
);

const formatDuration = (millis) => {
  if (millis === null || isNaN(millis) || millis < 0) return '00:00';
  let totalSeconds = Math.floor(millis / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  let str = '';
  if (hours > 0) {
    str += `${pad(hours)}:`;
  }
  str += `${pad(minutes)}:${pad(seconds)}`;
  return str;
};

const formatOrientationLabel = (orientationId, orientationMap, t) => {
  if (!orientationId) return t('home.orientation.notDefined');
  const details = orientationMap?.[orientationId];
  if (!details) return orientationId;
  const arrow = details.arrow ? ` ${details.arrow}` : '';
  return `${details.label}${arrow}`;
};

const formatLinePosition = (ratio, t) => {
  const parsed = Number(ratio);
  if (!Number.isFinite(parsed)) {
    return t('home.selected.linePositionNotSet');
  }
  return `${Math.round(parsed * 100)}%`;
};

const normalizeDurationMs = (value) => {
  if (!Number.isFinite(value)) return null;
  return value > 1000 ? Math.round(value) : Math.round(value * 1000);
};

const sanitizeFileName = (value) => {
  if (!value) return 'contagem';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
};

const PROCESSING_STATE_KEY = '@processing_state';

const HomeScreen = ({ route }) => {
  const navigation = useNavigation();
  const { apiUrl } = useApi();
  const { orientationMap, fetchOrientationMap } = useOrientationMap();
  const { t } = useLanguage();
  const { addCount } = useCounts();
  const [selectedVideoAsset, setSelectedVideoAsset] = useState(null);
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [appStatus, setAppStatus] = useState('idle');
  const [processingVideoName, setProcessingVideoName] = useState(null);
  const [backendProgressData, setBackendProgressData] = useState(null);
  const [countName, setCountName] = useState('');
  const [countDescription, setCountDescription] = useState('');
  const [selectedOrientation, setSelectedOrientation] = useState(null);
  const [modelChoice, setModelChoice] = useState('m');
  const [hasCheckedProcessingState, setHasCheckedProcessingState] =
    useState(false);
  const [processingMeta, setProcessingMeta] = useState(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);

  const modelOptions = [
    {
      id: 'n',
      label: t('home.model.fast'),
      description: t('home.model.fastDesc'),
    },
    {
      id: 'm',
      label: t('home.model.normal'),
      description: t('home.model.normalDesc'),
    },
    {
      id: 'l',
      label: t('home.model.precise'),
      description: t('home.model.preciseDesc'),
    },
  ];

  const pollingIntervalRef = useRef(null);
  const appStateListenerRef = useRef(AppState.currentState);
  const isFinalizingRef = useRef(false);

  useEffect(() => {
    fetchOrientationMap();
  }, [fetchOrientationMap]);

  useEffect(() => {
    if (hasCheckedProcessingState) return;
    if (!apiUrl) return;
    if (appStatus === 'polling_progress') {
      setHasCheckedProcessingState(true);
      return;
    }

    const loadProcessingState = async () => {
      try {
        const savedState = await AsyncStorage.getItem(PROCESSING_STATE_KEY);
        if (!savedState) {
          setHasCheckedProcessingState(true);
          return;
        }
        const parsed = JSON.parse(savedState);
        if (parsed?.videoName) {
          setProcessingVideoName(parsed.videoName);
          if (parsed.meta) {
            setProcessingMeta(parsed.meta);
            setCountName(parsed.meta.countName || '');
            setCountDescription(parsed.meta.countDescription || '');
          }
          setBackendProgressData(null);
          setAppStatus('polling_progress');
        } else {
          await AsyncStorage.removeItem(PROCESSING_STATE_KEY);
        }
      } catch (error) {
        console.warn('Failed to load processing state:', error);
      } finally {
        setHasCheckedProcessingState(true);
      }
    };

    loadProcessingState();
  }, [apiUrl, appStatus, hasCheckedProcessingState]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          style={{ marginRight: 15 }}
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={28}
            color="#007AFF"
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    React.useCallback(() => {
      const { trimmedVideo, newlyRecordedVideo, resetHome } = route.params || {};
      if (resetHome) {
        resetAllStates();
        navigation.setParams({ resetHome: null });
      }
      const rawVideo = trimmedVideo || newlyRecordedVideo;
      if (rawVideo?.uri) {
        const keepCountInputs =
          !!trimmedVideo && (countName || countDescription);
        resetAllStates({ keepCountInputs });
        const enrichedVideo = {
          uri: rawVideo.uri,
          fileName: rawVideo.fileName || rawVideo.uri.split('/').pop(),
          mimeType: rawVideo.mimeType || 'video/mp4',
          duration: rawVideo.duration ?? 0,
          originalDurationMs:
            rawVideo.originalDurationMs ??
            normalizeDurationMs(rawVideo.duration),
          orientation: rawVideo.orientation || null,
          trimStartMs: rawVideo.trimStartMs ?? null,
          trimEndMs: rawVideo.trimEndMs ?? null,
          linePositionRatio: rawVideo.linePositionRatio ?? null,
        };
        setSelectedVideoAsset(enrichedVideo);
        if (enrichedVideo.orientation) {
          setSelectedOrientation(enrichedVideo.orientation);
        }
        setAppStatus('selected');
        navigation.setParams({
          trimmedVideo: null,
          newlyRecordedVideo: null,
        });
      }
    }, [
      route.params?.trimmedVideo,
      route.params?.newlyRecordedVideo,
      route.params?.resetHome,
      countName,
      countDescription,
      navigation,
    ])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateListenerRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        appStatus === 'polling_progress'
      ) {
        if (processingVideoName) checkBackendProgress(processingVideoName);
      }
      appStateListenerRef.current = nextAppState;
    });
    return () => {
      subscription.remove();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [appStatus, processingVideoName]);

  const resetAllStates = ({ keepCountInputs = false } = {}) => {
    AsyncStorage.removeItem(PROCESSING_STATE_KEY).catch((error) => {
      console.warn('Failed to clear processing state:', error);
    });
    setSelectedVideoAsset(null);
    setProcessingVideoName(null);
    setBackendProgressData(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
    setAppStatus('idle');
    setIsPickerLoading(false);
    if (!keepCountInputs) {
      setCountName('');
      setCountDescription('');
    }
    setSelectedOrientation(null);
    setModelChoice('m');
    setProcessingMeta(null);
    setIsFinalizing(false);
    isFinalizingRef.current = false;
    setDownloadProgress(null);
  };

  const handlePickFromGallery = async () => {
    resetAllStates();
    setAppStatus('picking');
    setIsPickerLoading(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('common.permissionRequired'),
          t('home.errors.galleryPermission')
        );
        resetAllStates();
        return;
      }
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: MediaTypeOptions.Videos,
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        navigation.navigate('VideoEditor', { asset: result.assets[0] });
      } else {
        resetAllStates();
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('home.errors.galleryLoadFailed'));
      resetAllStates();
    }
    setIsPickerLoading(false);
  };

  const buildProcessingMeta = (assetOverride) => {
    const asset = assetOverride || selectedVideoAsset;
    const fileName =
      asset?.fileName || (asset?.uri ? asset.uri.split('/').pop() : null);
    return {
      countName: (countName || '').trim(),
      countDescription: (countDescription || '').trim(),
      originalVideoName: fileName,
      orientation: selectedOrientation || asset?.orientation || null,
      trimStartMs:
        asset?.trimStartMs === null || asset?.trimStartMs === undefined
          ? null
          : Number(asset?.trimStartMs),
      trimEndMs:
        asset?.trimEndMs === null || asset?.trimEndMs === undefined
          ? null
          : Number(asset?.trimEndMs),
      linePositionRatio: Number.isFinite(asset?.linePositionRatio)
        ? asset.linePositionRatio
        : null,
      modelChoice,
    };
  };

  const resolveProcessedUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (!apiUrl) return url;
    const trimmedApiUrl = apiUrl.replace(/\/+$/, '');
    const trimmedUrl = url.replace(/^\/+/, '');
    return `${trimmedApiUrl}/${trimmedUrl}`;
  };

  const downloadProcessedVideo = async (url, nameForFile) => {
    const resolvedUrl = resolveProcessedUrl(url);
    if (!resolvedUrl) return null;
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
    const safeName = sanitizeFileName(nameForFile);
    const fileName = `countg_${safeName}_${timestamp}.mp4`;
    const targetUri = `${FileSystem.documentDirectory}${fileName}`;
    setDownloadProgress(0);
    let downloadResult;
    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        resolvedUrl,
        targetUri,
        {},
        (progress) => {
          const total = progress.totalBytesExpectedToWrite;
          if (total > 0) {
            setDownloadProgress(progress.totalBytesWritten / total);
          }
        }
      );
      downloadResult = await downloadResumable.downloadAsync();
      setDownloadProgress(1);
    } catch (error) {
      setDownloadProgress(null);
      throw error;
    }

    let savedUri = downloadResult.uri;
    let savedToGallery = false;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.status === 'granted') {
        const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
        savedUri = asset.uri;
        savedToGallery = true;
      }
    } catch (error) {
      console.warn('Failed to save video to gallery:', error);
    }

    return {
      downloadUri: downloadResult.uri,
      savedUri,
      savedToGallery,
    };
  };

  const handleBackToEditor = () => {
    if (!selectedVideoAsset?.uri) return;
    const originalDurationMs =
      selectedVideoAsset.originalDurationMs ??
      normalizeDurationMs(selectedVideoAsset.duration);
    navigation.navigate('VideoEditor', {
      asset: {
        ...selectedVideoAsset,
        originalDurationMs,
      },
    });
  };

  const handleProcessingStarted = (responseData) => {
    const videoName = responseData?.video_name || responseData?.nome_arquivo;
    if (videoName) {
      isFinalizingRef.current = false;
      const meta = buildProcessingMeta();
      setProcessingVideoName(videoName);
      setProcessingMeta(meta);
      const queueStatus = responseData?.queue_status;
      const queuePosition = responseData?.queue_position;
      const queueSize = responseData?.queue_size;
      const hasQueuePosition =
        Number.isFinite(queuePosition) && queuePosition > 0;
      if (queueStatus === 'queued' || hasQueuePosition) {
        setBackendProgressData({
          queue_status: queueStatus,
          queue_position: queuePosition,
          queue_size: queueSize,
        });
      }
      AsyncStorage.setItem(
        PROCESSING_STATE_KEY,
        JSON.stringify({ videoName, startedAt: Date.now(), meta })
      ).catch((error) => {
        console.warn('Failed to save processing state:', error);
      });
      setAppStatus('polling_progress');
    } else {
      Alert.alert(t('common.error'), t('home.errors.processingStart'));
      setAppStatus('selected');
    }
  };

  const handleUploadError = (error) => {
    setAppStatus('selected');
  };

  const handleProcessingComplete = async (result) => {
    if (isFinalizingRef.current || isFinalizing) return;
    isFinalizingRef.current = true;
    setIsFinalizing(true);
    setAppStatus('saving_result');

    const meta = processingMeta || buildProcessingMeta();
    const processedUrl = result?.video_processado || null;
    let savedVideoInfo = null;

    if (processedUrl) {
      try {
        setDownloadProgress(0);
        savedVideoInfo = await downloadProcessedVideo(
          processedUrl,
          meta.countName
        );
      } catch (error) {
        Alert.alert(
          t('home.processing.saveErrorTitle'),
          t('home.processing.saveErrorMessage')
        );
      }
    } else {
      Alert.alert(
        t('home.processing.saveErrorTitle'),
        t('home.processing.saveErrorMessage')
      );
    }

    const totalCount = Number.isFinite(Number(result?.total_count))
      ? Number(result?.total_count)
      : null;
    const record = {
      name: meta.countName || t('home.counts.unnamed'),
      description: meta.countDescription,
      createdAt: new Date().toISOString(),
      totalCount,
      processedVideoUrl: processedUrl,
      localVideoUri: savedVideoInfo?.savedUri || savedVideoInfo?.downloadUri,
      savedToGallery: savedVideoInfo?.savedToGallery || false,
      originalVideoName: meta.originalVideoName,
      orientation: meta.orientation,
      trimStartMs: meta.trimStartMs,
      trimEndMs: meta.trimEndMs,
      linePositionRatio: meta.linePositionRatio,
      modelChoice: meta.modelChoice,
    };

    try {
      await addCount(record);
    } catch (error) {
      Alert.alert(
        t('home.processing.saveErrorTitle'),
        t('home.processing.saveErrorMessage')
      );
    }

    try {
      await AsyncStorage.removeItem(PROCESSING_STATE_KEY);
    } catch (error) {
      console.warn('Failed to clear processing state:', error);
    }

    setProcessingMeta(null);
    setIsFinalizing(false);
    navigation.navigate('ResultsScreen', {
      results: result,
      savedVideoUri: record.localVideoUri || null,
      countRecord: record,
    });
    setTimeout(() => resetAllStates(), 500);
  };

  const checkBackendProgress = async (videoName) => {
    if (!videoName || appStatus !== 'polling_progress') {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      return;
    }
    try {
      const response = await axios.get(`${apiUrl}/progresso/${videoName}`);
      const progressData = response.data;
      setBackendProgressData(progressData);
      if (progressData.finalizado) {
        if (pollingIntervalRef.current)
          clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        if (progressData.erro) {
          Alert.alert(
            t('home.errors.processingErrorTitle'),
            t('home.errors.processingErrorMessage', {
              error: progressData.erro,
            })
          );
          resetAllStates();
        } else if (progressData.resultado) {
          if (isFinalizing) return;
          await handleProcessingComplete(progressData.resultado);
        } else {
          Alert.alert(
            t('home.alerts.processingComplete'),
            t('home.alerts.processingInvalidResult')
          );
          resetAllStates();
        }
      }
    } catch (error) {
      setBackendProgressData((prev) => ({
        ...(prev || {}),
        erro: t('home.errors.progressFetchFailed'),
      }));
    }
  };

  useEffect(() => {
    if (appStatus === 'polling_progress' && processingVideoName) {
      checkBackendProgress(processingVideoName);
      pollingIntervalRef.current = setInterval(() => {
        checkBackendProgress(processingVideoName);
      }, 3000);
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [appStatus, processingVideoName]);

  const handleCancelProcessing = async () => {
    if (processingVideoName) {
      try {
        await axios.get(
          `${apiUrl}/cancelar-processamento/${processingVideoName}`
        );
        Alert.alert(
          t('home.alerts.cancelledTitle'),
          t('home.alerts.cancelledMessage')
        );
      } catch (error) {
        Alert.alert(t('common.error'), t('home.errors.cancelRequestFailed'));
      } finally {
        resetAllStates();
      }
    }
  };

  const renderProcessingContent = () => {
    if (!backendProgressData) {
      return (
        <CustomActivityIndicator
          size="large"
          color="#007AFF"
          style={{ marginVertical: 20 }}
        />
      );
    }
    if (backendProgressData.erro) {
      return (
        <Text style={styles.errorText}>
          {t('home.progress.errorLabel', { error: backendProgressData.erro })}
        </Text>
      );
    }

    let progressValue = 0;
    let progressText = t('home.progress.preparing');
    const statusMessage = backendProgressData.tempo_restante || '';
    const queuePosition = Number.isFinite(backendProgressData.queue_position)
      ? backendProgressData.queue_position
      : null;
    const queueSize = Number.isFinite(backendProgressData.queue_size)
      ? backendProgressData.queue_size
      : null;
    const queueStatus = backendProgressData.queue_status;
    const isQueued =
      queueStatus === 'queued' ||
      (Number.isFinite(queuePosition) && queuePosition > 0);

    if (isQueued) {
      progressValue = 0;
      if (
        Number.isFinite(queuePosition) &&
        Number.isFinite(queueSize) &&
        queueSize > 0
      ) {
        progressText = t('home.progress.inQueuePositionOf', {
          position: queuePosition,
          total: queueSize,
        });
      } else if (Number.isFinite(queuePosition)) {
        progressText = t('home.progress.inQueuePosition', {
          position: queuePosition,
        });
      } else {
        progressText = t('home.progress.inQueue');
      }
    } else if (statusMessage.includes('%')) {
      const percentageMatch = statusMessage.match(/(\d+)/);
      if (percentageMatch) {
        progressValue = parseInt(percentageMatch[0], 10) / 100;
      }
      progressText = statusMessage.split(':')[0];
    } else {
      progressValue =
        (backendProgressData.frame_atual || 0) /
        (backendProgressData.total_frames_estimado || 1);
      progressText = t('home.progress.processingFrames');
    }

    return (
      <>
        <BackendProgressBar progress={progressValue} text={progressText} />
        <Text style={styles.etaText}>
          {t('home.progress.statusLabel', {
            status:
              statusMessage || (isQueued ? t('home.progress.inQueue') : ''),
          })}
        </Text>
      </>
    );
  };

  const renderContent = () => {
    switch (appStatus) {
      case 'idle':
        return (
          <>
            <Text style={styles.subtitle}>{t('home.subtitleIdle')}</Text>
            <View style={styles.menuContainer}>
              <MenuButton
                label={t('home.menu.counts')}
                icon="counter"
                onPress={() => navigation.navigate('Counts')}
                index={0}
              />
              <MenuButton
                label={t('home.menu.recordVideo')}
                icon="camera-outline"
                onPress={() => navigation.navigate('RecordVideo')}
                index={1}
              />
              <MenuButton
                label={t('home.menu.galleryVideo')}
                icon="image-multiple-outline"
                onPress={handlePickFromGallery}
                index={2}
              />
              <MenuButton
                label={t('home.menu.wifiCamera')}
                icon="wifi-strength-4"
                onPress={() => navigation.navigate('WifiCamera')}
                index={3}
              />
              <MenuButton
                label={t('home.menu.tutorial')}
                icon="help-circle-outline"
                onPress={() => navigation.navigate('OnboardingTutorial')}
                index={4}
              />
            </View>
          </>
        );
      case 'picking':
        return (
          <CustomActivityIndicator
            size="large"
            color="#007AFF"
            style={styles.loader}
          />
        );
      case 'selected': {
        const trimStartMsValue = selectedVideoAsset?.trimStartMs;
        const trimEndMsValue = selectedVideoAsset?.trimEndMs;
        const trimStartMs =
          trimStartMsValue === null || trimStartMsValue === undefined
            ? null
            : Number(trimStartMsValue);
        const trimEndMs =
          trimEndMsValue === null || trimEndMsValue === undefined
            ? null
            : Number(trimEndMsValue);
        const hasTrimRange =
          Number.isFinite(trimStartMs) && Number.isFinite(trimEndMs);
        const trimStartLabel = hasTrimRange
          ? formatDuration(trimStartMs)
          : t('home.selected.trimNotSet');
        const trimEndLabel = hasTrimRange
          ? formatDuration(trimEndMs)
          : t('home.selected.trimNotSet');
        const orientationLabel = formatOrientationLabel(
          selectedOrientation,
          orientationMap,
          t
        );
        const linePositionLabel = formatLinePosition(
          selectedVideoAsset?.linePositionRatio,
          t
        );

        return (
          <View style={styles.selectionContainer}>
            <Text style={styles.selectedVideoTitle}>
              {t('home.selected.title')}
            </Text>
            <Text style={styles.selectedVideoInfo} numberOfLines={1}>
              {selectedVideoAsset.fileName ||
                selectedVideoAsset.uri.split('/').pop()}
            </Text>
            {selectedVideoAsset.duration != null && (
              <Text style={styles.videoInfoText}>
                {t('home.selected.durationLabel', {
                  duration: formatDuration(selectedVideoAsset.duration),
                })}
              </Text>
            )}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>
                {t('home.selected.countNameLabel')}
              </Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('home.selected.countNamePlaceholder')}
                value={countName}
                onChangeText={setCountName}
                autoCapitalize="words"
                placeholderTextColor="#888"
              />
              <Text style={styles.formLabel}>
                {t('home.selected.countDescriptionLabel')}
              </Text>
              <TextInput
                style={[styles.formInput, styles.formInputMultiline]}
                placeholder={t('home.selected.countDescriptionPlaceholder')}
                value={countDescription}
                onChangeText={setCountDescription}
                autoCapitalize="sentences"
                placeholderTextColor="#888"
                multiline
              />
            </View>
            <View style={styles.choiceSection}>
              <Text style={styles.choiceTitle}>
                {t('home.selected.orientationTitle')}
              </Text>
              {orientationMap ? (
                <View style={styles.orientationSummary}>
                  <Text style={styles.orientationSummaryText}>
                    {formatOrientationLabel(
                      selectedOrientation,
                      orientationMap,
                      t
                    )}
                  </Text>
                </View>
              ) : (
                <CustomActivityIndicator size="small" color="#007AFF" />
              )}
            </View>
            <View style={styles.choiceSection}>
              <Text style={styles.choiceTitle}>
                {t('home.selected.processingLevelTitle')}
              </Text>
              <View style={styles.modelButtonsContainer}>
                {modelOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.modelButton,
                      modelChoice === opt.id && styles.modelButtonSelected,
                    ]}
                    onPress={() => setModelChoice(opt.id)}
                  >
                    <Text
                      style={[
                        styles.modelButtonText,
                        modelChoice === opt.id &&
                          styles.modelButtonTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.modelButtonDesc,
                        modelChoice === opt.id &&
                          styles.modelButtonTextSelected,
                      ]}
                    >
                      {opt.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>
                {t('home.selected.videoInfoTitle')}
              </Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('home.selected.videoNameLabel')}
                </Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {selectedVideoAsset.fileName ||
                    selectedVideoAsset.uri.split('/').pop()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('home.selected.trimStartLabel')}
                </Text>
                <Text style={styles.detailValue}>{trimStartLabel}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('home.selected.trimEndLabel')}
                </Text>
                <Text style={styles.detailValue}>{trimEndLabel}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('home.selected.orientationLabel')}
                </Text>
                <Text style={styles.detailValue}>{orientationLabel}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('home.selected.linePositionLabel')}
                </Text>
                <Text style={styles.detailValue}>{linePositionLabel}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleBackToEditor}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {t('home.selected.backToEdit')}
              </Text>
            </TouchableOpacity>
            <VideoUploadSender
              videoAsset={selectedVideoAsset}
              countName={countName}
              countDescription={countDescription}
              orientation={selectedOrientation}
              modelChoice={modelChoice}
              onProcessingStarted={handleProcessingStarted}
              onUploadError={handleUploadError}
            />
            <TouchableOpacity
              onPress={resetAllStates}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>
                {t('home.selected.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'prediction_requested':
      case 'polling_progress':
        return (
          <View style={styles.processingContainerFull}>
            <Text style={styles.statusTitle}>
              {t('home.processing.title')}
            </Text>
            {renderProcessingContent()}
            <BigButton
              title={t('home.processing.cancel')}
              onPress={handleCancelProcessing}
              buttonStyle={styles.cancelAnalysisButton}
            />
          </View>
        );
      case 'saving_result':
        {
          const safeDownloadProgress = Number.isFinite(downloadProgress)
            ? downloadProgress
            : 0;
          return (
            <View style={styles.processingContainerFull}>
              <Text style={styles.statusTitle}>
                {t('home.processing.downloadingTitle')}
              </Text>
              <BackendProgressBar
                progress={safeDownloadProgress}
                text={t('home.processing.downloading')}
              />
            </View>
          );
        }
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.title}>CountG</Text>
            {renderContent()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  container: { alignItems: 'center', paddingHorizontal: 15 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginTop: 8,
    marginBottom: 30,
    textAlign: 'center',
  },
  loader: { marginVertical: 20 },
  menuContainer: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionContainer: {
    alignItems: 'center',
    marginVertical: 15,
    width: '100%',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectedVideoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  selectedVideoInfo: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  videoInfoText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 15,
    textAlign: 'center',
  },
  formSection: {
    width: '100%',
    paddingVertical: 15,
    marginTop: 10,
    marginBottom: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e8e8e8',
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  formInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
  },
  formInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  choiceSection: {
    width: '100%',
    marginTop: 10,
    marginBottom: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: '#e8e8e8',
  },
  choiceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  orientationSummary: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  orientationSummaryText: {
    color: '#333',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  modelButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modelButton: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ddd',
    marginVertical: 5,
    width: '32%',
    alignItems: 'center',
    minHeight: 70,
    justifyContent: 'center',
  },
  modelButtonSelected: { backgroundColor: '#ff9800', borderColor: '#e68a00' },
  modelButtonText: { color: '#333', fontSize: 14, fontWeight: 'bold' },
  modelButtonDesc: {
    color: '#555',
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },
  modelButtonTextSelected: { color: 'white' },
  detailsCard: {
    width: '100%',
    marginTop: 10,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailsTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    color: '#333',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#1f2937',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelButton: { marginTop: 15, paddingVertical: 12 },
  cancelButtonText: { color: '#6c757d', fontSize: 16, fontWeight: '600' },
  processingContainerFull: {
    marginVertical: 20,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#007AFF',
  },
  backendProgressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  processingInfoText: { marginBottom: 8, fontSize: 15, color: '#333' },
  progressBarContainer: {
    height: 12,
    width: '100%',
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: '#28a745' },
  progressPercentText: { marginTop: 5, fontSize: 13, color: '#495057' },
  etaText: {
    marginTop: 8,
    fontSize: 13,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    textAlign: 'center',
    marginBottom: 15,
  },
  cancelAnalysisButton: {
    backgroundColor: '#dc3545',
    marginTop: 20,
    width: '100%',
  },
  tutorialButton: { backgroundColor: '#6c757d', width: '100%', marginTop: 20 },
});

export default HomeScreen;
