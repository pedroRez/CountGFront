import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { VLCPlayer } from 'react-native-vlc-media-player';

import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';
import {
  normalizeManualRtspInput,
  buildRtspUrlFromPath,
  resolveOnvifRtspUrl,
} from '../utils/onvifClient';

const MIN_FILE_BYTES = 200 * 1024;
const DEFAULT_RTSP_PATH = '/onvif1';
const VLC_INIT_OPTIONS = ['--rtsp-tcp', '--network-caching=300'];
const VLC_MEDIA_OPTIONS = [':network-caching=300', ':rtsp-tcp'];

const formatSecondsToMMSS = (totalSeconds) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
};

const stripFileScheme = (value) =>
  typeof value === 'string' && value.startsWith('file://')
    ? value.replace('file://', '')
    : value;

const ensureFileUri = (value) => {
  if (!value) return value;
  return value.startsWith('file://') ? value : `file://${value}`;
};

const resolveRecordingDirectory = async () => {
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) return null;
  const targetDir = `${baseDir}wifi_recordings/`;
  try {
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  } catch (error) {
    // Directory already exists or is not accessible.
  }
  return stripFileScheme(targetDir);
};

export default function WifiCameraRecordScreen({ route, navigation }) {
  const { t } = useLanguage();
  const wifiCamera = route?.params?.wifiCamera || {};
  const [rtspUrl, setRtspUrl] = useState('');
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const timerRef = useRef(null);
  const elapsedRef = useRef(0);
  const vlcRef = useRef(null);
  const recordingHandledRef = useRef(false);
  const stopFallbackRef = useRef(null);
  const isFinalizingRef = useRef(false);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setElapsedTime(0);
    elapsedRef.current = 0;
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => {
        const next = prev + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);
  }, [stopTimer]);

  const finalizeRecording = useCallback(
    async (recordPath, wasCancelled = false) => {
      if (isFinalizingRef.current) return;
      isFinalizingRef.current = true;
      stopTimer();
      setIsRecording(false);

      if (stopFallbackRef.current) {
        clearTimeout(stopFallbackRef.current);
        stopFallbackRef.current = null;
      }

      const outputUri = recordPath ? ensureFileUri(recordPath) : null;
      if (!outputUri) {
        if (!wasCancelled) {
          Alert.alert(
            t('wifiCameraRecord.recordErrorTitle'),
            t('wifiCameraRecord.recordErrorMessage')
          );
        }
        isFinalizingRef.current = false;
        return;
      }

      const info = await FileSystem.getInfoAsync(outputUri, { size: true });
      if (!info?.exists || !info.size || info.size < MIN_FILE_BYTES) {
        Alert.alert(
          t('wifiCameraRecord.recordTooShortTitle'),
          t('wifiCameraRecord.recordTooShortMessage')
        );
        isFinalizingRef.current = false;
        return;
      }

      const recordedAsset = {
        uri: outputUri,
        fileName: outputUri.split('/').pop(),
        mimeType: 'video/mp4',
        duration: elapsedRef.current * 1000,
      };

      navigation.replace('VideoEditor', { asset: recordedAsset });
      isFinalizingRef.current = false;
    },
    [navigation, stopTimer, t]
  );

  const handleRecordingCreated = useCallback(
    (recordPath) => {
      if (recordingHandledRef.current) return;
      recordingHandledRef.current = true;
      void finalizeRecording(recordPath, false);
    },
    [finalizeRecording]
  );

  const handleConnectOnvif = useCallback(async () => {
    if (!wifiCamera?.ip) {
      setConnectError(t('wifiCameraRecord.missingCamera'));
      setIsConnecting(false);
      return;
    }
    setIsConnecting(true);
    setConnectError('');
    try {
      const resolved = await resolveOnvifRtspUrl({
        ip: wifiCamera.ip,
        xaddrs: wifiCamera.xaddrs,
        username: wifiCamera.username,
        password: wifiCamera.password,
      });
      if (!resolved) {
        throw new Error('RTSP not found');
      }
      setRtspUrl(resolved);
    } catch (error) {
      setConnectError(t('wifiCameraRecord.connectError'));
      setRtspUrl('');
      setManualInput((prev) => {
        if (prev) return prev;
        return (
          buildRtspUrlFromPath({
            ip: wifiCamera?.ip,
            path: DEFAULT_RTSP_PATH,
            username: wifiCamera?.username,
            password: wifiCamera?.password,
          }) || DEFAULT_RTSP_PATH
        );
      });
    } finally {
      setIsConnecting(false);
    }
  }, [t, wifiCamera]);

  useEffect(() => {
    handleConnectOnvif();
  }, [handleConnectOnvif]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (stopFallbackRef.current) {
        clearTimeout(stopFallbackRef.current);
        stopFallbackRef.current = null;
      }
      if (vlcRef.current?.stopRecording) {
        vlcRef.current.stopRecording();
      }
    };
  }, [stopTimer]);

  const handleManualConnect = () => {
    const trimmedInput = manualInput.trim();
    const fallbackUrl = buildRtspUrlFromPath({
      ip: wifiCamera?.ip,
      path: DEFAULT_RTSP_PATH,
      username: wifiCamera?.username,
      password: wifiCamera?.password,
    });
    const manualUrl = trimmedInput
      ? normalizeManualRtspInput({
          input: trimmedInput,
          ip: wifiCamera.ip,
          username: wifiCamera.username,
          password: wifiCamera.password,
        })
      : fallbackUrl;
    if (!manualUrl) {
      Alert.alert(
        t('common.error'),
        t('wifiCameraRecord.manualInvalidMessage')
      );
      return;
    }
    if (!trimmedInput && fallbackUrl) {
      setManualInput(fallbackUrl);
    }
    setConnectError('');
    setRtspUrl(manualUrl);
  };

  const startRecording = async () => {
    if (!rtspUrl) {
      Alert.alert(
        t('common.error'),
        t('wifiCameraRecord.missingRtspMessage')
      );
      return;
    }
    if (isRecording) return;
    if (!vlcRef.current?.startRecording) {
      Alert.alert(
        t('wifiCameraRecord.recordErrorTitle'),
        t('wifiCameraRecord.recordErrorMessage')
      );
      return;
    }

    const recordingDir = await resolveRecordingDirectory();
    if (!recordingDir) {
      Alert.alert(
        t('wifiCameraRecord.recordErrorTitle'),
        t('wifiCameraRecord.recordErrorMessage')
      );
      return;
    }

    recordingHandledRef.current = false;
    setIsRecording(true);
    startTimer();
    vlcRef.current.startRecording(recordingDir);
  };

  const stopRecording = async () => {
    if (!vlcRef.current?.stopRecording) {
      void finalizeRecording(null, true);
      return;
    }
    stopTimer();
    setIsRecording(false);
    vlcRef.current.stopRecording();
    if (stopFallbackRef.current) {
      clearTimeout(stopFallbackRef.current);
    }
    stopFallbackRef.current = setTimeout(() => {
      if (!recordingHandledRef.current) {
        void finalizeRecording(null, true);
      }
    }, 4000);
  };

  const handleRecordPress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={Boolean(connectError)}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('wifiCameraRecord.title')}</Text>
            {wifiCamera?.ip ? (
              <Text style={styles.subtitle}>
                {t('wifiCameraRecord.subtitle', { ip: wifiCamera.ip })}
              </Text>
            ) : null}
          </View>

          <View style={styles.previewWrapper}>
            {isConnecting ? (
              <View style={styles.centered}>
                <CustomActivityIndicator size="large" color="#fff" />
                <Text style={styles.statusText}>
                  {t('wifiCameraRecord.connecting')}
                </Text>
              </View>
            ) : rtspUrl ? (
              <>
                <VLCPlayer
                  ref={vlcRef}
                  source={{
                    uri: rtspUrl,
                    initType: 2,
                    initOptions: VLC_INIT_OPTIONS,
                    mediaOptions: VLC_MEDIA_OPTIONS,
                  }}
                  style={styles.preview}
                  autoplay={true}
                  paused={false}
                  onError={() => {
                    setConnectError(t('wifiCameraRecord.previewError'));
                    setRtspUrl('');
                  }}
                  onRecordingCreated={handleRecordingCreated}
                />
                {isRecording && (
                  <View style={styles.timerBadge}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.timerText}>
                      {formatSecondsToMMSS(elapsedTime)}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{connectError}</Text>
              </View>
            )}
          </View>

          {connectError ? (
            <View style={styles.manualCard}>
              <Text style={styles.manualLabel}>
                {t('wifiCameraRecord.manualLabel')}
              </Text>
              <TextInput
                style={styles.manualInput}
                value={manualInput}
                onChangeText={setManualInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('wifiCameraRecord.manualPlaceholder')}
                placeholderTextColor="#9ca3af"
              />
              <View style={styles.manualButtons}>
                <TouchableOpacity
                  style={[styles.manualButton, styles.manualPrimary]}
                  onPress={handleManualConnect}
                >
                  <Text style={styles.manualPrimaryText}>
                    {t('wifiCameraRecord.manualConnect')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.manualButton, styles.manualSecondary]}
                  onPress={handleConnectOnvif}
                >
                  <Text style={styles.manualSecondaryText}>
                    {t('wifiCameraRecord.retryOnvif')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.controls}>
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording && styles.recordButtonActive,
                (!rtspUrl || isConnecting) && styles.recordButtonDisabled,
              ]}
              onPress={handleRecordPress}
              disabled={!rtspUrl || isConnecting}
            >
              <MaterialCommunityIcons
                name={isRecording ? 'stop-circle' : 'record-circle-outline'}
                size={56}
                color={isRecording ? '#ff3b30' : '#fff'}
              />
              <Text style={styles.recordButtonText}>
                {isRecording
                  ? t('wifiCameraRecord.recordStop')
                  : t('wifiCameraRecord.recordStart')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>
                {t('wifiCameraRecord.backToList')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f18' },
  header: { paddingHorizontal: 20, paddingTop: 10 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  scrollContent: { flexGrow: 1 },
  previewWrapper: {
    flex: 1,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  preview: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  statusText: { color: '#e5e7eb', marginTop: 10 },
  errorText: { color: '#f87171', textAlign: 'center' },
  timerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
    marginRight: 6,
  },
  timerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  manualCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  manualLabel: { color: '#e5e7eb', fontSize: 13, marginBottom: 6 },
  manualInput: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: '#fff',
    backgroundColor: '#0f172a',
    marginBottom: 10,
  },
  manualButtons: { flexDirection: 'row', gap: 10 },
  manualButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualPrimary: { backgroundColor: '#2563eb' },
  manualSecondary: { backgroundColor: '#1f2937' },
  manualPrimaryText: { color: '#fff', fontWeight: '600' },
  manualSecondaryText: { color: '#e5e7eb', fontWeight: '600' },
  controls: { padding: 16 },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 14,
    paddingVertical: 12,
    gap: 8,
  },
  recordButtonActive: {
    backgroundColor: '#3b0a0a',
  },
  recordButtonDisabled: {
    opacity: 0.5,
  },
  recordButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  backButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 10,
  },
  backButtonText: { color: '#9ca3af', fontSize: 14 },
});
