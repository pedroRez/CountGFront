import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import TcpSocket from 'react-native-tcp-socket';

import BigButton from '../components/BigButton';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';
import { discoverOnvifDevices } from '../utils/onvifDiscovery';
import { scanRtspDevices } from '../utils/rtspScan';
import {
  clearCameraDiscoveryLogs,
  getCameraDiscoveryLogsText,
  isCameraDiscoveryDebugEnabled,
  logCameraDiscovery,
} from '../utils/cameraDiscoveryLogger';

const DEFAULT_ONVIF_USERNAME = 'admin';
const COMMON_PREFIXES = ['192.168.0'];
const DEFAULT_HOST_MIN = 1;
const DEFAULT_HOST_MAX = 254;
const PRIMARY_CAMERA_IP = '192.168.0.14';
const PRIMARY_PREFIX = '192.168.0';
const WIFI_CAMERA_CREDENTIALS_KEY = '@wifi_camera_credentials';
const WIFI_CAMERA_LAST_PASSWORD_KEY = '@wifi_camera_last_password';

const isValidIp = (value) => {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
};

const normalizePrefix = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\*$/, '').replace(/\/\d+$/, '');
  const parts = cleaned.split('.');
  if (parts.length >= 3 && parts.length <= 4) {
    const prefixParts = parts.slice(0, 3);
    if (prefixParts.every((part) => /^\d+$/.test(part))) {
      return prefixParts.join('.');
    }
  }
  return null;
};

const extractHostSuffix = (ip) => {
  if (!isValidIp(ip)) return null;
  const last = ip.split('.').pop();
  const num = Number(last);
  return Number.isFinite(num) ? num : null;
};

const buildBroadcastAddress = (prefix) => {
  const normalized = normalizePrefix(prefix);
  return normalized ? `${normalized}.255` : null;
};

const getLocalPrefix = async () => {
  const netInfo = NativeModules?.NetworkInfo;
  if (!netInfo?.getIpAddress) return null;
  try {
    const ip = await netInfo.getIpAddress();
    if (typeof ip === 'string' && ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return parts.slice(0, 3).join('.');
      }
    }
  } catch (error) {
    // ignore ip lookup errors
  }
  return null;
};

const extractHostIp = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const withoutScheme = raw.replace(/^https?:\/\//i, '');
  const hostPart = withoutScheme.split('/')[0];
  const host = hostPart.split(':')[0];
  return isValidIp(host) ? host : null;
};

const getDevServerIp = () => {
  const fromExpoConfig = extractHostIp(Constants?.expoConfig?.hostUri);
  if (fromExpoConfig) return fromExpoConfig;
  const fromManifest2 = extractHostIp(
    Constants?.manifest2?.extra?.expoClient?.hostUri
  );
  if (fromManifest2) return fromManifest2;
  return extractHostIp(Constants?.manifest?.hostUri);
};

const getLocalIp = async () => {
  const netInfo = NativeModules?.NetworkInfo;
  if (!netInfo?.getIpAddress) return null;
  try {
    const ip = await netInfo.getIpAddress();
    if (typeof ip === 'string' && ip.includes('.')) {
      return ip;
    }
  } catch (error) {
    // ignore ip lookup errors
  }
  return null;
};

const probeTcpPort = (host, port, timeoutMs = 900) =>
  new Promise((resolve) => {
    let settled = false;
    let socket = null;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      if (socket) {
        try {
          socket.destroy();
        } catch (error) {
          // ignore close errors
        }
      }
      resolve({ ok, reason });
    };

    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
    try {
      socket = TcpSocket.createConnection({ host, port }, () => {
        clearTimeout(timer);
        finish(true, 'connected');
      });
      socket.on('error', (error) => {
        clearTimeout(timer);
        finish(false, error?.message || 'error');
      });
    } catch (error) {
      clearTimeout(timer);
      finish(false, error?.message || 'error');
    }
  });

const probeOnvifHttp = async (host, timeoutMs = 1200) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}/onvif/device_service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"></s:Envelope>',
      signal: controller.signal,
    });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: error?.message || 'error' };
  } finally {
    clearTimeout(timeout);
  }
};

const buildScanPrefixes = async (
  manualIp,
  scanLocalOnly = false,
  { forcePrefix, preferPrefix, includeCommon = true } = {}
) => {
  const forced = normalizePrefix(forcePrefix);
  if (forced) return [forced];
  const localPrefix = await getLocalPrefix();
  const preferred = normalizePrefix(preferPrefix);
  const manualPrefix = isValidIp(manualIp)
    ? manualIp.split('.').slice(0, 3).join('.')
    : null;
  if (scanLocalOnly) {
    if (!localPrefix) return preferred ? [preferred] : [];
    const ordered = [preferred, localPrefix, manualPrefix].filter(Boolean);
    return Array.from(new Set(ordered));
  }
  const ordered = [
    preferred,
    manualPrefix,
    localPrefix,
    ...(includeCommon ? COMMON_PREFIXES : []),
  ].filter(Boolean);
  return Array.from(new Set(ordered));
};

const WifiCameraScreen = ({ navigation }) => {
  const { t } = useLanguage();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isAuthVisible, setIsAuthVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [username, setUsername] = useState(DEFAULT_ONVIF_USERNAME);
  const [password, setPassword] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forceLocalPrefix, setForceLocalPrefix] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const [scanStageDetail, setScanStageDetail] = useState('');
  const [scanMeta, setScanMeta] = useState({
    localIp: null,
    prefixes: [],
    wsDiscoveryResponses: 0,
    forcedPrefix: null,
    forcedByEnv: false,
    manualPrefix: false,
    sanityCheck: null,
  });
  const scanLocalOnly = true;

  const loadSavedCredentials = useCallback(async (ip) => {
    setHasSavedCredentials(false);
    if (!ip) return;
    try {
      const raw = await AsyncStorage.getItem(WIFI_CAMERA_CREDENTIALS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const saved = parsed?.[ip];
      if (!saved) return;
      if (typeof saved.username === 'string' && saved.username.trim()) {
        setUsername(saved.username);
      }
      if (typeof saved.password === 'string') {
        setPassword(saved.password);
      }
      setHasSavedCredentials(true);
    } catch (error) {
      setHasSavedCredentials(false);
    }
  }, []);

  const saveCredentials = useCallback(async (ip, user, pass) => {
    if (!ip || !pass) return;
    try {
      const raw = await AsyncStorage.getItem(WIFI_CAMERA_CREDENTIALS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[ip] = {
        username: user || DEFAULT_ONVIF_USERNAME,
        password: pass,
        updatedAt: Date.now(),
      };
      await AsyncStorage.setItem(
        WIFI_CAMERA_CREDENTIALS_KEY,
        JSON.stringify(parsed)
      );
      await AsyncStorage.setItem(WIFI_CAMERA_LAST_PASSWORD_KEY, pass);
      setHasSavedCredentials(true);
    } catch (error) {
      // ignore storage failures
    }
  }, []);

  const clearSavedCredentials = useCallback(async () => {
    const ip = selectedDevice?.ip;
    if (!ip) return;
    try {
      const raw = await AsyncStorage.getItem(WIFI_CAMERA_CREDENTIALS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed[ip]) {
        delete parsed[ip];
        await AsyncStorage.setItem(
          WIFI_CAMERA_CREDENTIALS_KEY,
          JSON.stringify(parsed)
        );
      }
      await AsyncStorage.removeItem(WIFI_CAMERA_LAST_PASSWORD_KEY);
    } catch (error) {
      // ignore storage failures
    }
    setPassword('');
    setUsername(DEFAULT_ONVIF_USERNAME);
    setHasSavedCredentials(false);
  }, [selectedDevice?.ip]);

  useEffect(() => {
    if (!isAuthVisible || !selectedDevice?.ip) {
      setHasSavedCredentials(false);
      return;
    }
    void loadSavedCredentials(selectedDevice.ip);
  }, [isAuthVisible, loadSavedCredentials, selectedDevice?.ip]);

  const setStage = useCallback(
    (stage, detail = '') => {
      setScanStage(stage);
      setScanStageDetail(detail);
      logCameraDiscovery('scan_stage', { stage, detail });
    },
    []
  );

  const handleCopyLogs = useCallback(async () => {
    const text = getCameraDiscoveryLogsText();
    if (!text) {
      Alert.alert(t('wifiCamera.copyLogsEmptyTitle'), t('wifiCamera.copyLogsEmptyMessage'));
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert(
        t('wifiCamera.copyLogsSuccessTitle'),
        t('wifiCamera.copyLogsSuccessMessage')
      );
    } catch (error) {
      Alert.alert(
        t('wifiCamera.copyLogsErrorTitle'),
        t('wifiCamera.copyLogsErrorMessage')
      );
    }
  }, [t]);

  const handleScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setErrorMessage('');
    setDevices([]);
    clearCameraDiscoveryLogs();
    const scanStartedAt = Date.now();
    const stageTimers = {};
    const startStageTimer = (label, detail = '') => {
      stageTimers[label] = Date.now();
      setStage(label, detail);
    };
    const endStageTimer = (label, extra = {}) => {
      const startedAt = stageTimers[label];
      const durationMs =
        typeof startedAt === 'number' ? Date.now() - startedAt : null;
      logCameraDiscovery('stage_complete', {
        stage: label,
        durationMs,
        ...extra,
      });
    };
    logCameraDiscovery('scan_start', {
      debugEnabled: isCameraDiscoveryDebugEnabled(),
    });
    try {
      let lastPassword = null;
      const localIp = await getLocalIp();
      const localPrefix =
        typeof localIp === 'string' && localIp.includes('.')
          ? localIp.split('.').slice(0, 3).join('.')
          : null;
      const devServerIp = getDevServerIp();
      const forcedPrefixEnv = normalizePrefix(
        process.env.EXPO_PUBLIC_CAMERA_DISCOVERY_FORCE_PREFIX || ''
      );
      const manualForcedPrefix = forceLocalPrefix ? PRIMARY_PREFIX : null;
      const forcedPrefix = forcedPrefixEnv || manualForcedPrefix;
      logCameraDiscovery('local_network', {
        localIp,
        localPrefix,
        devServerIp,
        forcedPrefixEnv,
        manualForcedPrefix,
        forcedPrefix,
      });
      setScanMeta((prev) => ({
        ...prev,
        localIp,
        forcedPrefix: forcedPrefix || null,
        forcedByEnv: Boolean(forcedPrefixEnv),
        manualPrefix: Boolean(manualForcedPrefix && !forcedPrefixEnv),
      }));
      if (forcedPrefix) {
        logCameraDiscovery('prefix_forced', {
          forcedPrefix,
          forcedByEnv: Boolean(forcedPrefixEnv),
          manualToggle: Boolean(manualForcedPrefix && !forcedPrefixEnv),
        });
      }
      const broadcastAddresses = Array.from(
        new Set(
          [
            buildBroadcastAddress(PRIMARY_PREFIX),
            buildBroadcastAddress(forcedPrefix),
            buildBroadcastAddress(localPrefix),
            buildBroadcastAddress(manualIp),
          ].filter(Boolean)
        )
      );
      logCameraDiscovery('ws_discovery_targets', {
        addresses: broadcastAddresses,
      });
      try {
        lastPassword = await AsyncStorage.getItem(WIFI_CAMERA_LAST_PASSWORD_KEY);
      } catch (error) {
        lastPassword = null;
      }

      const preferVerified = (items) => {
        if (!Array.isArray(items) || !items.length) return [];
        const verified = items.filter(
          (item) => !item?.connectOnly || item?.onvifOk
        );
        const cleaned = (verified.length ? verified : items).filter((item) => {
          if (!item?.ip) return false;
          if (item.ip === localIp) return false;
          if (devServerIp && item.ip === devServerIp) return false;
          return true;
        });
        return cleaned;
      };

      const runRtspScan = async (localOnly, options = {}) => {
        const prefixes = await buildScanPrefixes(manualIp, localOnly, {
          forcePrefix: forcedPrefix,
          preferPrefix: localPrefix === PRIMARY_PREFIX ? PRIMARY_PREFIX : null,
          includeCommon: !forcedPrefix,
          ...options,
        });
        logCameraDiscovery('rtsp_scan_prefixes', {
          prefixes,
          localOnly,
        });
        setScanMeta((prev) => ({
          ...prev,
          prefixes,
        }));
        if (!prefixes.length) {
          return { prefixes, results: [] };
        }
        let rtspDevices = [];
        for (const prefix of prefixes) {
          const scanResults = await scanRtspDevices({
            subnetPrefix: prefix,
            timeoutMs: 2500,
            concurrency: 10,
            probeDelayMs: 60,
            matchHint: null,
            verifyOnvifPort: [80, 5000, 8000, 8080, 8899],
            username: lastPassword ? DEFAULT_ONVIF_USERNAME : null,
            password: lastPassword || null,
            hostMin: DEFAULT_HOST_MIN,
            hostMax: DEFAULT_HOST_MAX,
            allowConnectOnly: false,
          });
          if (scanResults.length) {
            rtspDevices = scanResults;
            break;
          }
        }
        return { prefixes, results: preferVerified(rtspDevices) };
      };

      let nextDevices = [];
      const sanityTarget = PRIMARY_CAMERA_IP;
      const sanityHostSuffix = extractHostSuffix(sanityTarget);
      let sanityAlive = false;
      let sanityDetails = null;
      if (sanityHostSuffix) {
        logCameraDiscovery('sanity_check_start', { ip: sanityTarget });
        const sanityStart = Date.now();
        const tcp80 = await probeTcpPort(sanityTarget, 80, 900);
        const tcp554 = await probeTcpPort(sanityTarget, 554, 900);
        const httpOnvif = await probeOnvifHttp(sanityTarget, 1200);
        sanityAlive = Boolean(tcp80.ok || tcp554.ok || httpOnvif.ok);
        sanityDetails = {
          ip: sanityTarget,
          alive: sanityAlive,
          tcp80,
          tcp554,
          httpOnvif,
          durationMs: Date.now() - sanityStart,
        };
        logCameraDiscovery('sanity_check_result', sanityDetails);
        setScanMeta((prev) => ({
          ...prev,
          sanityCheck: sanityDetails,
        }));
      }
      try {
        startStageTimer(t('wifiCamera.stageDiscovery'));
        const onvifDevices = await discoverOnvifDevices({
          timeoutMs: 4500,
          retries: 3,
          broadcastAddresses,
          onLog: logCameraDiscovery,
        });
        endStageTimer(t('wifiCamera.stageDiscovery'), {
          responses: Array.isArray(onvifDevices) ? onvifDevices.length : 0,
        });
        setScanMeta((prev) => ({
          ...prev,
          wsDiscoveryResponses: Array.isArray(onvifDevices)
            ? onvifDevices.length
            : 0,
        }));
        if (Array.isArray(onvifDevices) && onvifDevices.length) {
          nextDevices = onvifDevices;
        }
      } catch (error) {
        // ignore discovery errors and fallback to RTSP scan
        endStageTimer(t('wifiCamera.stageDiscovery'), {
          error: error?.message || 'unknown',
        });
      }

      if (!nextDevices.length) {
        if (sanityAlive && sanityHostSuffix) {
          startStageTimer(t('wifiCamera.stageRtspScan'), sanityTarget);
          const sanityResults = await scanRtspDevices({
            subnetPrefix: PRIMARY_PREFIX,
            timeoutMs: 2000,
            concurrency: 1,
            probeDelayMs: 0,
            matchHint: null,
            verifyOnvifPort: [80, 5000, 8000, 8080, 8899],
            username: lastPassword ? DEFAULT_ONVIF_USERNAME : null,
            password: lastPassword || null,
            hostMin: sanityHostSuffix,
            hostMax: sanityHostSuffix,
            allowConnectOnly: false,
          });
          endStageTimer(t('wifiCamera.stageRtspScan'), {
            results: Array.isArray(sanityResults) ? sanityResults.length : 0,
            sanityTarget,
          });
          logCameraDiscovery('sanity_scan_complete', {
            target: sanityTarget,
            results: Array.isArray(sanityResults) ? sanityResults.length : 0,
            skippedFullScan: true,
          });
          nextDevices = Array.isArray(sanityResults) ? sanityResults : [];
        } else {
        startStageTimer(t('wifiCamera.stageRtspScan'));
        const primaryScan = await runRtspScan(scanLocalOnly);
        let rtspDevices = primaryScan.results;
        endStageTimer(t('wifiCamera.stageRtspScan'), {
          results: Array.isArray(rtspDevices) ? rtspDevices.length : 0,
        });
        if (!rtspDevices.length && scanLocalOnly) {
          startStageTimer(t('wifiCamera.stageRtspScan'));
          const fallbackScan = await runRtspScan(false);
          rtspDevices = fallbackScan.results;
          endStageTimer(t('wifiCamera.stageRtspScan'), {
            results: Array.isArray(rtspDevices) ? rtspDevices.length : 0,
            fallback: true,
          });
          if (
            !rtspDevices.length &&
            !primaryScan.prefixes.length &&
            !fallbackScan.prefixes.length
          ) {
            setErrorMessage(t('wifiCamera.networkNotDetected'));
            return;
          }
        } else if (!rtspDevices.length && !primaryScan.prefixes.length) {
          setErrorMessage(t('wifiCamera.networkNotDetected'));
          return;
        }
        nextDevices = Array.isArray(rtspDevices) ? rtspDevices : [];
        }
      }

      setDevices(nextDevices);
      logCameraDiscovery('scan_complete', {
        durationMs: Date.now() - scanStartedAt,
        found: Array.isArray(nextDevices) ? nextDevices.length : 0,
      });
    } finally {
      setIsScanning(false);
    }
  };

  const openAuthModal = (device) => {
    setSelectedDevice(device);
    setShowAdvanced(false);
    setUsername(DEFAULT_ONVIF_USERNAME);
    setPassword('');
    setShowPassword(false);
    setIsAuthVisible(true);
  };

  const closeAuthModal = () => {
    setIsAuthVisible(false);
    setSelectedDevice(null);
    setShowAdvanced(false);
    setPassword('');
    setShowPassword(false);
  };

  const handleStartRecording = () => {
    if (!selectedDevice?.ip) {
      Alert.alert(t('common.error'), t('wifiCamera.noDeviceSelected'));
      return;
    }
    if (!password.trim()) {
      Alert.alert(
        t('wifiCamera.passwordRequiredTitle'),
        t('wifiCamera.passwordRequiredMessage')
      );
      return;
    }
    const trimmedUsername = username.trim();
    void saveCredentials(selectedDevice.ip, trimmedUsername, password);
    const wifiCamera = {
      ip: selectedDevice.ip,
      username: trimmedUsername,
      password,
      xaddrs: selectedDevice.xaddrs || [],
      rtspPath: selectedDevice.rtspPath,
      rtspPort: selectedDevice.rtspPort,
    };
    setIsAuthVisible(false);
    setSelectedDevice(null);
    setPassword('');
    navigation.navigate('WifiCameraRecord', { wifiCamera });
  };

  const handleManualConnect = () => {
    const trimmed = manualIp.trim();
    if (!isValidIp(trimmed)) {
      Alert.alert(
        t('wifiCamera.manualIpInvalidTitle'),
        t('wifiCamera.manualIpInvalidMessage')
      );
      return;
    }
    openAuthModal({ ip: trimmed, xaddrs: [] });
  };

  const buildNoResultsDetails = () => {
    const prefixes =
      Array.isArray(scanMeta.prefixes) && scanMeta.prefixes.length
        ? scanMeta.prefixes.join(', ')
        : '-';
    const wsCount = Number.isFinite(scanMeta.wsDiscoveryResponses)
      ? scanMeta.wsDiscoveryResponses
      : 0;
    const sanityLabel = scanMeta.sanityCheck
      ? scanMeta.sanityCheck.alive
        ? t('wifiCamera.sanityAlive')
        : t('wifiCamera.sanityDead')
      : t('wifiCamera.sanitySkipped');
    return [
      t('wifiCamera.noResultsDetailsLocalIp', {
        ip: scanMeta.localIp || '-',
      }),
      t('wifiCamera.noResultsDetailsPrefixes', { prefixes }),
      t('wifiCamera.noResultsDetailsWsDiscovery', { count: wsCount }),
      t('wifiCamera.noResultsDetailsSanity', { status: sanityLabel }),
    ];
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('wifiCamera.title')}</Text>
        <Text style={styles.subtitle}>{t('wifiCamera.subtitle')}</Text>

        <View style={styles.card}>
          <Text style={styles.hintText}>{t('wifiCamera.hint')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('wifiCamera.statusTitle')}</Text>
          <Text style={styles.statusText}>
            {scanStage || t('wifiCamera.statusIdle')}
          </Text>
          {scanStageDetail ? (
            <Text style={styles.statusDetail}>{scanStageDetail}</Text>
          ) : null}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {t('wifiCamera.forcePrefixLabel')}
            </Text>
            <Switch
              value={forceLocalPrefix}
              onValueChange={setForceLocalPrefix}
            />
          </View>
          {!scanMeta.localIp ? (
            <Text style={styles.helperText}>
              {t('wifiCamera.forcePrefixHint')}
            </Text>
          ) : null}
          {scanMeta.forcedByEnv ? (
            <Text style={styles.helperText}>
              {t('wifiCamera.forcePrefixEnv')}
            </Text>
          ) : null}
        </View>

        <BigButton
          title={isScanning ? t('wifiCamera.scanning') : t('wifiCamera.scan')}
          onPress={handleScan}
          disabled={isScanning}
        />

        <TouchableOpacity
          style={styles.logButton}
          onPress={handleCopyLogs}
        >
          <Text style={styles.logButtonText}>
            {t('wifiCamera.copyLogs')}
          </Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {t('wifiCamera.manualIpTitle')}
          </Text>
          <Text style={styles.inputLabel}>{t('wifiCamera.manualIpLabel')}</Text>
          <TextInput
            style={styles.input}
            value={manualIp}
            onChangeText={setManualIp}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numeric"
            placeholder={t('wifiCamera.manualIpPlaceholder')}
            placeholderTextColor="#9ca3af"
          />
          <TouchableOpacity
            style={styles.manualButton}
            onPress={handleManualConnect}
          >
            <Text style={styles.manualButtonText}>
              {t('wifiCamera.manualIpConnect')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('wifiCamera.resultsTitle')}</Text>
          {isScanning && (
            <CustomActivityIndicator size="large" color="#007AFF" />
          )}

          {!isScanning && errorMessage ? (
            <Text style={styles.errorText}>
              {t('wifiCamera.errorMessage', { details: errorMessage })}
            </Text>
          ) : null}

          {!isScanning && !errorMessage && devices.length === 0 ? (
            <View>
              <Text style={styles.helperText}>{t('wifiCamera.noResults')}</Text>
              <Text style={styles.metaText}>
                {t('wifiCamera.noResultsDetailsTitle')}
              </Text>
              {buildNoResultsDetails().map((line) => (
                <Text key={line} style={styles.helperText}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {!isScanning && devices.length > 0 ? (
            <>
              <Text style={styles.metaText}>
              {t('wifiCamera.foundCount', { count: devices.length })}
            </Text>
            {devices.map((device) => (
              <View key={device.ip} style={styles.resultRow}>
                <View style={styles.resultRowHeader}>
                  <Text style={styles.resultTitle}>
                    {t('wifiCamera.deviceLabel', { ip: device.ip })}
                  </Text>
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={() => openAuthModal(device)}
                  >
                    <Text style={styles.connectButtonText}>
                      {t('wifiCamera.connect')}
                    </Text>
                  </TouchableOpacity>
                </View>
                {(device.xaddrs || []).map((url) => (
                  <Text key={`${device.ip}-${url}`} style={styles.resultSubtitle}>
                    {t('wifiCamera.xaddrsLabel', { url })}
                  </Text>
                ))}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        visible={isAuthVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAuthModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeAuthModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalWrapper}
          >
            <Pressable
              style={styles.modalCard}
              onPress={(event) => event.stopPropagation()}
            >
              <Text style={styles.modalTitle}>{t('wifiCamera.authTitle')}</Text>
              {selectedDevice?.ip ? (
                <Text style={styles.modalSubtitle}>
                  {t('wifiCamera.selectedCameraLabel', {
                    ip: selectedDevice.ip,
                  })}
                </Text>
              ) : null}
              <Text style={styles.inputLabel}>
                {t('wifiCamera.passwordLabel')}
              </Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('wifiCamera.passwordPlaceholder')}
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={t('wifiCamera.togglePassword')}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[
                  styles.clearCredentialsButton,
                  !hasSavedCredentials && styles.clearCredentialsButtonDisabled,
                ]}
                onPress={clearSavedCredentials}
                disabled={!hasSavedCredentials}
              >
                <Text style={styles.clearCredentialsText}>
                  {t('wifiCamera.clearCredentials')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced((prev) => !prev)}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvanced
                    ? t('wifiCamera.advancedHide')
                    : t('wifiCamera.advancedShow')}
                </Text>
              </TouchableOpacity>
              {showAdvanced ? (
                <>
                  <Text style={styles.inputLabel}>
                    {t('wifiCamera.usernameLabel')}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={t('wifiCamera.usernamePlaceholder')}
                    placeholderTextColor="#9ca3af"
                  />
                </>
              ) : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={closeAuthModal}
                >
                  <Text style={styles.modalCancelText}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={handleStartRecording}
                >
                  <Text style={styles.modalPrimaryText}>
                    {t('wifiCamera.startRecording')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 20, flexGrow: 1 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
  },
  hintText: {
    fontSize: 13,
    color: '#6b7280',
  },
  statusText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    marginBottom: 6,
  },
  statusDetail: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  switchLabel: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    flex: 1,
    paddingRight: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    color: '#111827',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  resultRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  resultRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resultTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  resultSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  logButton: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderRadius: 8,
  },
  logButtonText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 380,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    marginBottom: 0,
  },
  passwordToggle: {
    marginLeft: 8,
    padding: 8,
  },
  manualButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  advancedToggle: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  advancedToggleText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  clearCredentialsButton: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  clearCredentialsButtonDisabled: {
    opacity: 0.5,
  },
  clearCredentialsText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#e5e7eb',
  },
  modalPrimaryButton: {
    backgroundColor: '#2563eb',
  },
  modalCancelText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 14,
  },
  modalPrimaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default WifiCameraScreen;
