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
  UIManager,
  findNodeHandle,
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
const RECORDING_EXTENSION = 'mp4';
const RECORDING_READY_DELAY_MS = 150;
const RECORDING_READY_ATTEMPTS = 8;

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

const normalizeDirectoryPath = (value) => {
  if (!value) return value;
  return value.endsWith('/') ? value : `${value}/`;
};

const buildRecordingFilePath = (directory) => {
  if (!directory) return null;
  const normalizedDir = normalizeDirectoryPath(directory);
  const timestamp = Date.now();
  return `${normalizedDir}wifi_camera_${timestamp}.${RECORDING_EXTENSION}`;
};

const getMimeTypeForPath = (path) => {
  if (!path) return 'video/mp4';
  const lower = path.toLowerCase();
  if (lower.endsWith('.ts')) return 'video/mp2t';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  return 'video/mp4';
};

const normalizeRecordingPath = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.path === 'string') return value.path;
    if (typeof value.recordPath === 'string') return value.recordPath;
  }
  return null;
};

const getExistingFileInfo = async (path) => {
  if (!path) return null;
  const uri = ensureFileUri(path);
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (!info?.exists || info.isDirectory) return null;
    return { uri, info };
  } catch (error) {
    return null;
  }
};

const findLatestRecording = async (directory, sinceMs = 0) => {
  if (!directory) return null;
  const dirUri = ensureFileUri(normalizeDirectoryPath(directory));
  let entries = [];
  try {
    entries = await FileSystem.readDirectoryAsync(dirUri);
  } catch (error) {
    return null;
  }
  if (!entries.length) return null;

  let bestPath = null;
  let bestTime = 0;
  let bestSize = 0;

  for (const entry of entries) {
    const entryUri = `${dirUri}${entry}`;
    let info;
    try {
      info = await FileSystem.getInfoAsync(entryUri, { size: true });
    } catch (error) {
      continue;
    }
    if (!info?.exists || info.isDirectory) continue;

    const modTimeMs =
      typeof info.modificationTime === 'number'
        ? info.modificationTime * 1000
        : 0;
    const size = info.size || 0;
    if (sinceMs && modTimeMs && modTimeMs < sinceMs - 2000) {
      continue;
    }

    if (modTimeMs > bestTime || (modTimeMs === bestTime && size > bestSize)) {
      bestTime = modTimeMs;
      bestSize = size;
      bestPath = stripFileScheme(entryUri);
    }
  }

  return bestPath;
};

const resolveRecordingDirectory = async () => {
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDir) {
    return {
      path: null,
      reason: 'fs-unavailable',
    };
  }
  const targetDir = `${baseDir}wifi_recordings`;
  let targetExists = false;
  try {
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  } catch (error) {
    // Directory already exists or is not accessible.
  }
  try {
    const info = await FileSystem.getInfoAsync(targetDir);
    targetExists = Boolean(info?.exists);
  } catch (error) {
    targetExists = false;
  }
  const selected = targetExists ? targetDir : baseDir;
  return {
    path: stripFileScheme(selected),
    reason: targetExists ? null : 'fallback-base',
  };
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
  const [isStreamReady, setIsStreamReady] = useState(false);

  const timerRef = useRef(null);
  const elapsedRef = useRef(0);
  const vlcRef = useRef(null);
  const recordingHandledRef = useRef(false);
  const stopFallbackRef = useRef(null);
  const isFinalizingRef = useRef(false);
  const recordingDirRef = useRef(null);
  const recordingFileRef = useRef(null);
  const recordingStartRef = useRef(0);
  const recordingPendingRef = useRef(false);

  const buildRecordErrorMessage = useCallback(
    (details) => {
      const base = t('wifiCameraRecord.recordErrorMessage');
      if (!details) return base;
      return `${base}\n\n${details}`;
    },
    [t]
  );

  const getVlcCommand = useCallback((commandName) => {
    const config = UIManager.getViewManagerConfig('RCTVLCPlayer');
    const commandId = config?.Commands?.[commandName];
    const target =
      vlcRef.current?._root
        ? findNodeHandle(vlcRef.current._root)
        : findNodeHandle(vlcRef.current);
    return {
      commandId,
      target,
    };
  }, []);

  const dispatchVlcCommand = useCallback(
    (commandName, args = []) => {
      const { commandId, target } = getVlcCommand(commandName);
      if (typeof commandId !== 'number' || !target) {
        return false;
      }
      UIManager.dispatchViewManagerCommand(target, commandId, args);
      return true;
    },
    [getVlcCommand]
  );

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

  const waitForRecorderReady = useCallback(async () => {
    for (let attempt = 0; attempt < RECORDING_READY_ATTEMPTS; attempt += 1) {
      const { commandId, target } = getVlcCommand('startRecording');
      if (typeof commandId === 'number' && target) return true;
      await new Promise((resolve) =>
        setTimeout(resolve, RECORDING_READY_DELAY_MS)
      );
    }
    return false;
  }, []);

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

      let resolvedPath = normalizeRecordingPath(recordPath);
      let fileResult = await getExistingFileInfo(resolvedPath);
      if (!fileResult) {
        fileResult = await getExistingFileInfo(recordingFileRef.current);
      }
      if (!fileResult && recordingDirRef.current) {
        const latest = await findLatestRecording(
          recordingDirRef.current,
          recordingStartRef.current
        );
        resolvedPath = latest;
        fileResult = await getExistingFileInfo(latest);
      }

      if (!fileResult) {
        if (!wasCancelled) {
          Alert.alert(
            t('wifiCameraRecord.recordErrorTitle'),
            buildRecordErrorMessage(
              `Arquivo nao encontrado. Pasta: ${recordingDirRef.current || '-'}`
            )
          );
        }
        isFinalizingRef.current = false;
        return;
      }

      const { uri: outputUri, info } = fileResult;
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
        mimeType: getMimeTypeForPath(outputUri),
        duration: elapsedRef.current * 1000,
      };

      navigation.replace('VideoEditor', { asset: recordedAsset });
      isFinalizingRef.current = false;
    },
    [buildRecordErrorMessage, navigation, stopTimer, t]
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
    const fallbackUrl = buildRtspUrlFromPath({
      ip: wifiCamera?.ip,
      path: wifiCamera?.rtspPath || DEFAULT_RTSP_PATH,
      port: wifiCamera?.rtspPort || 554,
      username: wifiCamera?.username,
      password: wifiCamera?.password,
    });
    if (wifiCamera?.rtspPath || wifiCamera?.rtspPort) {
      if (fallbackUrl) {
        setRtspUrl(fallbackUrl);
        setManualInput((prev) => prev || fallbackUrl);
        setIsConnecting(false);
        return;
      }
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
            path: wifiCamera?.rtspPath || DEFAULT_RTSP_PATH,
            port: wifiCamera?.rtspPort || 554,
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
    if (isConnecting || !rtspUrl) {
      setIsStreamReady(false);
    }
  }, [isConnecting, rtspUrl]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (stopFallbackRef.current) {
        clearTimeout(stopFallbackRef.current);
        stopFallbackRef.current = null;
      }
      if (dispatchVlcCommand('stopRecording')) {
        return;
      }
      if (vlcRef.current?.stopRecording) {
        try {
          vlcRef.current.stopRecording();
        } catch (error) {
          // ignore cleanup errors
        }
      }
    };
  }, [dispatchVlcCommand, stopTimer]);

  const handleManualConnect = () => {
    const trimmedInput = manualInput.trim();
    const fallbackUrl = buildRtspUrlFromPath({
      ip: wifiCamera?.ip,
      path: wifiCamera?.rtspPath || DEFAULT_RTSP_PATH,
      port: wifiCamera?.rtspPort || 554,
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
    if (!isStreamReady) {
      Alert.alert(
        t('wifiCameraRecord.recordNotReadyTitle'),
        t('wifiCameraRecord.recordNotReadyMessage')
      );
      return;
    }
    if (isRecording) return;
    if (recordingPendingRef.current) return;
    recordingPendingRef.current = true;
    const recorderReady = await waitForRecorderReady();
    if (!recorderReady) {
      Alert.alert(
        t('wifiCameraRecord.recordUnsupportedTitle'),
        t('wifiCameraRecord.recordUnsupportedMessage')
      );
      recordingPendingRef.current = false;
      return;
    }

    const recordingResolution = await resolveRecordingDirectory();
    const recordingDir = recordingResolution?.path;
    if (!recordingDir) {
      const docDir = FileSystem.documentDirectory || '-';
      const cacheDir = FileSystem.cacheDirectory || '-';
      Alert.alert(
        t('wifiCameraRecord.recordErrorTitle'),
        buildRecordErrorMessage(
          `FileSystem indisponivel.\nDocDir: ${docDir}\nCacheDir: ${cacheDir}`
        )
      );
      recordingPendingRef.current = false;
      return;
    }

    const normalizedDir = normalizeDirectoryPath(recordingDir);
    const recordingFilePath = buildRecordingFilePath(normalizedDir);
    recordingHandledRef.current = false;
    recordingDirRef.current = normalizedDir;
    recordingFileRef.current = recordingFilePath;
    recordingStartRef.current = Date.now();
    setIsRecording(true);
    startTimer();
    try {
      const started = dispatchVlcCommand('startRecording', [normalizedDir]);
      if (!started && vlcRef.current?.startRecording) {
        vlcRef.current.startRecording(normalizedDir);
      }
    } catch (error) {
      stopTimer();
      setIsRecording(false);
      Alert.alert(
        t('wifiCameraRecord.recordErrorTitle'),
        buildRecordErrorMessage(error?.message || 'Falha ao iniciar gravacao.')
      );
    } finally {
      recordingPendingRef.current = false;
    }
  };

  const stopRecording = async () => {
    const { commandId, target } = getVlcCommand('stopRecording');
    const canDispatchStop = typeof commandId === 'number' && target;
    if (!canDispatchStop && !vlcRef.current?.stopRecording) {
      void finalizeRecording(null, true);
      return;
    }
    stopTimer();
    setIsRecording(false);
    const stopped = dispatchVlcCommand('stopRecording');
    if (!stopped && vlcRef.current?.stopRecording) {
      vlcRef.current.stopRecording();
    }
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
                    setIsStreamReady(false);
                    setConnectError(t('wifiCameraRecord.previewError'));
                    setRtspUrl('');
                  }}
                  onPlaying={() => {
                    setIsStreamReady(true);
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
                (!rtspUrl || isConnecting || !isStreamReady) &&
                  styles.recordButtonDisabled,
              ]}
              onPress={handleRecordPress}
              disabled={!rtspUrl || isConnecting || !isStreamReady}
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
