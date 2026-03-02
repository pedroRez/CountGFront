import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';

import BigButton from '../components/BigButton';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';
import { startScan } from '../utils/cameraDiscoveryService';
import {
  clearCameraDiscoveryLogs,
  getCameraDiscoveryLogsText,
  isCameraDiscoveryDebugEnabled,
  logCameraDiscovery,
} from '../utils/cameraDiscoveryLogger';

const DEFAULT_ONVIF_USERNAME = 'admin';
const ENV_SCAN_USERNAME = (
  process.env.EXPO_PUBLIC_CAMERA_SCAN_USERNAME || DEFAULT_ONVIF_USERNAME
).trim();
const ENV_SCAN_PASSWORD = (
  process.env.EXPO_PUBLIC_CAMERA_SCAN_PASSWORD || ''
).trim();
const COMMON_PREFIXES = ['192.168.0'];
const DEFAULT_HOST_MIN = 0;
const DEFAULT_HOST_MAX = 255;
const PRIMARY_PREFIX = '192.168.0';
const WIFI_CAMERA_CREDENTIALS_KEY = '@wifi_camera_credentials';
const WIFI_CAMERA_LAST_PASSWORD_KEY = '@wifi_camera_last_password';
const WIFI_CAMERA_LAST_IPS_KEY = '@wifi_camera_last_ips';
const WIFI_CAMERA_LAST_IPS_LIMIT = 8;
const WIFI_CAMERA_LAST_DEVICES_KEY = '@wifi_camera_last_devices';
const WIFI_CAMERA_LAST_DEVICES_LIMIT = 12;
const CAMERA_DISCOVERY_DEBUG_UI =
  String(process.env.EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG || '') === '1';

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

const normalizeIpList = (values, limit = null) => {
  if (!Array.isArray(values)) return [];
  const output = [];
  const seen = new Set();
  values.forEach((value) => {
    if (typeof value !== 'string') return;
    const ip = value.trim();
    if (!isValidIp(ip)) return;
    if (seen.has(ip)) return;
    seen.add(ip);
    output.push(ip);
  });
  if (limit && output.length > limit) {
    return output.slice(0, limit);
  }
  return output;
};

const mergeIpLists = (...lists) => {
  const output = [];
  const seen = new Set();
  lists.forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((value) => {
      if (typeof value !== 'string') return;
      const ip = value.trim();
      if (!isValidIp(ip)) return;
      if (seen.has(ip)) return;
      seen.add(ip);
      output.push(ip);
    });
  });
  return output;
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

const loadLastKnownIps = async () => {
  try {
    const raw = await AsyncStorage.getItem(WIFI_CAMERA_LAST_IPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeIpList(parsed);
  } catch (error) {
    return [];
  }
};

const saveLastKnownIps = async (ips) => {
  const normalized = normalizeIpList(ips, WIFI_CAMERA_LAST_IPS_LIMIT);
  try {
    await AsyncStorage.setItem(
      WIFI_CAMERA_LAST_IPS_KEY,
      JSON.stringify(normalized)
    );
  } catch (error) {
    // ignore storage failures
  }
  return normalized;
};

const formatElapsed = (elapsedMs) => {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return '00:00';
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
};

const getDeviceStorageKey = (device) => {
  if (!device?.ip) return null;
  return device.id || `${device.ip}:${device.rtspPort || ''}`.toLowerCase();
};

const normalizeStoredDevice = (device) => {
  if (!device?.ip) return null;
  const key = getDeviceStorageKey(device);
  if (!key) return null;
  return {
    id: key,
    ip: device.ip,
    rtspPort: device.rtspPort || null,
    rtspPath: device.rtspPath || null,
    discoverySource: device.discoverySource || null,
    possibleCamera: Boolean(device.possibleCamera),
    onvifOk: Boolean(device.onvifOk),
    xaddrs: Array.isArray(device.xaddrs) ? device.xaddrs : [],
    name: device.name || null,
    manufacturer: device.manufacturer || null,
    model: device.model || null,
    lastSeenAt: Number.isFinite(Number(device.lastSeenAt))
      ? Number(device.lastSeenAt)
      : Date.now(),
  };
};

const loadLastKnownDevices = async () => {
  try {
    const raw = await AsyncStorage.getItem(WIFI_CAMERA_LAST_DEVICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredDevice).filter(Boolean);
  } catch (error) {
    return [];
  }
};

const saveLastKnownDevices = async (devices) => {
  const normalized = (Array.isArray(devices) ? devices : [])
    .map(normalizeStoredDevice)
    .filter(Boolean)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
    .slice(0, WIFI_CAMERA_LAST_DEVICES_LIMIT);
  try {
    await AsyncStorage.setItem(
      WIFI_CAMERA_LAST_DEVICES_KEY,
      JSON.stringify(normalized)
    );
  } catch (error) {
    // ignore storage failures
  }
  return normalized;
};

const mergeDeviceLists = (current, incoming) => {
  const map = new Map();
  (current || []).forEach((device) => {
    if (!device) return;
    const key = device.id || device.ip;
    if (key) map.set(key, device);
  });
  (incoming || []).forEach((device) => {
    if (!device) return;
    const key = device.id || device.ip;
    if (!key) return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, device);
      return;
    }
    map.set(key, {
      ...existing,
      ...device,
      xaddrs: Array.from(
        new Set([...(existing.xaddrs || []), ...(device.xaddrs || [])])
      ),
      lastSeenAt: Math.max(existing.lastSeenAt || 0, device.lastSeenAt || 0),
    });
  });
  return Array.from(map.values()).sort(
    (a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0)
  );
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
  const [scanStatus, setScanStatus] = useState('idle');
  const [scanProgress, setScanProgress] = useState({
    found: 0,
    checked: 0,
    elapsedMs: 0,
    wsDiscoveryResponses: 0,
    state: 'idle',
  });
  const [scanMeta, setScanMeta] = useState({
    localIp: null,
    prefixes: [],
    wsDiscoveryResponses: 0,
    forcedPrefix: null,
    forcedByEnv: false,
    manualPrefix: false,
  });
  const scanLocalOnly = true;
  const scanHandleRef = useRef(null);
  const pendingDevicesRef = useRef([]);
  const flushTimerRef = useRef(null);
  const persistTimerRef = useRef(null);

  const stageLabelMap = useMemo(
    () => ({
      ws_discovery: t('wifiCamera.stageDiscovery'),
      rtsp_scan: t('wifiCamera.stageRtspScan'),
      onvif_verify: t('wifiCamera.stageOnvifVerify'),
    }),
    [t]
  );

  const statusLabel = useMemo(() => {
    switch (scanStatus) {
      case 'scanning':
        return t('wifiCamera.statusScanning');
      case 'completed':
        return t('wifiCamera.statusCompleted');
      case 'cancelled':
        return t('wifiCamera.statusCancelled');
      case 'error':
        return t('wifiCamera.statusError');
      default:
        return t('wifiCamera.statusIdle');
    }
  }, [scanStatus, t]);

  const ensureWifiPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return { granted: true };
    const isApi33Plus = Number(Platform.Version) >= 33;
    const perm = isApi33Plus
      ? PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES
      : PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    if (!perm) return { granted: false, reason: 'permission_unavailable' };
    try {
      const alreadyGranted = await PermissionsAndroid.check(perm);
      if (alreadyGranted) {
        if (CAMERA_DISCOVERY_DEBUG_UI) {
          logCameraDiscovery('wifi_permission_status', {
            permission: perm,
            status: 'granted',
          });
        }
        return { granted: true };
      }
      const result = await PermissionsAndroid.request(perm);
      if (CAMERA_DISCOVERY_DEBUG_UI) {
        logCameraDiscovery('wifi_permission_status', {
          permission: perm,
          status: result,
        });
      }
      return { granted: result === PermissionsAndroid.RESULTS.GRANTED };
    } catch (error) {
      if (CAMERA_DISCOVERY_DEBUG_UI) {
        logCameraDiscovery('wifi_permission_status', {
          permission: perm,
          status: 'error',
          error: error?.message || 'unknown',
        });
      }
      return { granted: false, reason: error?.message || 'error' };
    }
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadLastKnownDevices().then((cached) => {
        if (!active) return;
        if (!Array.isArray(cached) || !cached.length) return;
        setDevices((prev) => mergeDeviceLists(prev, cached));
      });
      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    return () => {
      if (scanHandleRef.current) {
        scanHandleRef.current.cancel();
        scanHandleRef.current = null;
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, []);

  const setStage = useCallback(
    (stageKey, detail = '') => {
      const label = stageLabelMap[stageKey] || stageKey || '';
      setScanStage(label);
      setScanStageDetail(detail);
      logCameraDiscovery('scan_stage', { stage: stageKey, detail });
    },
    [stageLabelMap]
  );

  const handleCopyLogs = useCallback(async () => {
    const text = getCameraDiscoveryLogsText();
    if (!text) {
      Alert.alert(
        t('wifiCamera.copyLogsEmptyTitle'),
        t('wifiCamera.copyLogsEmptyMessage')
      );
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

  const schedulePersistDevices = useCallback((nextDevices) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      saveLastKnownDevices(nextDevices);
      persistTimerRef.current = null;
    }, 800);
  }, []);

  const flushPendingDevices = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
    }
    const pending = pendingDevicesRef.current;
    if (!pending.length) {
      flushTimerRef.current = null;
      return;
    }
    pendingDevicesRef.current = [];
    flushTimerRef.current = null;
    setDevices((prev) => {
      const merged = mergeDeviceLists(prev, pending);
      schedulePersistDevices(merged);
      return merged;
    });
  }, [schedulePersistDevices]);

  const removeDeviceFromSavedList = useCallback(
    async (device) => {
      const key = getDeviceStorageKey(device);
      const ip = device?.ip;
      if (!key || !ip) return;

      setDevices((prev) => {
        const next = prev.filter((item) => getDeviceStorageKey(item) !== key);
        schedulePersistDevices(next);
        return next;
      });

      if (selectedDevice?.ip === ip) {
        setIsAuthVisible(false);
        setSelectedDevice(null);
        setShowAdvanced(false);
        setPassword('');
        setShowPassword(false);
      }

      try {
        const savedIps = await loadLastKnownIps();
        const nextIps = savedIps.filter((savedIp) => savedIp !== ip);
        await saveLastKnownIps(nextIps);
      } catch (_error) {
        // ignore storage failures
      }
    },
    [schedulePersistDevices, selectedDevice?.ip]
  );

  const handleRemoveDevice = useCallback(
    (device) => {
      if (!device?.ip) return;
      Alert.alert(
        t('wifiCamera.removeCameraTitle'),
        t('wifiCamera.removeCameraMessage', { ip: device.ip }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('wifiCamera.removeCamera'),
            style: 'destructive',
            onPress: () => {
              void removeDeviceFromSavedList(device);
            },
          },
        ]
      );
    },
    [removeDeviceFromSavedList, t]
  );

  const handleScan = async () => {
    if (isScanning) return;
    if (scanHandleRef.current) {
      scanHandleRef.current.cancel();
      scanHandleRef.current = null;
    }
    setIsScanning(true);
    setErrorMessage('');
    setScanStatus('scanning');
    setScanStage('');
    setScanStageDetail('');
    setScanMeta((prev) => ({
      ...prev,
      wsDiscoveryResponses: 0,
      prefixes: [],
    }));
    setScanProgress({
      found: 0,
      checked: 0,
      elapsedMs: 0,
      wsDiscoveryResponses: 0,
      state: 'scanning',
    });
    clearCameraDiscoveryLogs();
    await ensureWifiPermissions();
    const scanStartedAt = Date.now();
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
        lastPassword = await AsyncStorage.getItem(
          WIFI_CAMERA_LAST_PASSWORD_KEY
        );
      } catch (error) {
        lastPassword = null;
      }
      const scanPassword = lastPassword || ENV_SCAN_PASSWORD || null;
      const scanUsername = scanPassword
        ? ENV_SCAN_USERNAME || DEFAULT_ONVIF_USERNAME
        : null;
      const lastKnownIps = await loadLastKnownIps();
      logCameraDiscovery('last_known_ips_loaded', {
        count: lastKnownIps.length,
        ips: lastKnownIps,
      });

      const manualPriorityIp = isValidIp(manualIp) ? manualIp.trim() : null;
      const priorityIps = mergeIpLists(
        manualPriorityIp ? [manualPriorityIp] : [],
        lastKnownIps
      );
      logCameraDiscovery('priority_ips', {
        count: priorityIps.length,
        ips: priorityIps,
        manual: manualPriorityIp,
      });

      const primaryPrefixes = await buildScanPrefixes(manualIp, scanLocalOnly, {
        forcePrefix: forcedPrefix,
        preferPrefix: localPrefix === PRIMARY_PREFIX ? PRIMARY_PREFIX : null,
        includeCommon: !forcedPrefix,
      });
      const fallbackPrefixes = scanLocalOnly
        ? await buildScanPrefixes(manualIp, false, {
            forcePrefix: forcedPrefix,
            preferPrefix:
              localPrefix === PRIMARY_PREFIX ? PRIMARY_PREFIX : null,
            includeCommon: !forcedPrefix,
          })
        : [];
      const allPrefixes = Array.from(
        new Set([...(primaryPrefixes || []), ...(fallbackPrefixes || [])])
      );
      logCameraDiscovery('rtsp_scan_prefixes', {
        prefixes: allPrefixes,
        localOnly: scanLocalOnly,
      });
      setScanMeta((prev) => ({
        ...prev,
        prefixes: allPrefixes,
      }));

      const scanHandle = startScan({
        broadcastAddresses,
        prefixes: primaryPrefixes,
        fallbackPrefixes,
        priorityIps,
        excludeIps: [localIp, devServerIp],
        lastPassword,
        username: scanUsername,
        password: scanPassword,
        enableOnvifDiscovery: false,
        scanLocalOnly,
        hostMin: DEFAULT_HOST_MIN,
        hostMax: DEFAULT_HOST_MAX,
        concurrency: 10,
        probeDelayMs: 60,
        allowConnectOnly: false,
        includePossibleCameras: true,
        enableFastRtspScan: true,
        fastRtspPath: '/onvif1',
        fastRtspPort: 554,
        fastRtspTimeoutMs: 1200,
        fastOpenPortTimeoutMs: 450,
        skipFullScanWhenConfirmed: false,
        boostPossibleCameras: true,
        possibleCameraPaths: ['/onvif1', '/', '/onvif0'],
        possibleCameraRtspTimeoutMs: 5500,
        possibleCameraConcurrency: 4,
        possibleCameraRefusedRetries: 2,
        possibleCameraRefusedRetryDelayMs: 250,
        rtspTimeoutMs: 2500,
        verifyOnvifPort: null,
        openPorts: [554, 8554, 10554],
        openPortTimeoutMs: 1200,
        stopAfterConfirmed: false,
        onStage: (stageKey, detail) => setStage(stageKey, detail),
      });
      scanHandleRef.current = scanHandle;

      const removeFound = scanHandle.on('found', (device) => {
        if (!device) return;
        pendingDevicesRef.current.push(device);
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(flushPendingDevices, 0);
        }
      });

      const removeProgress = scanHandle.on('progress', (progress) => {
        if (!progress) return;
        setScanProgress((prev) => ({
          ...prev,
          ...progress,
        }));
        if (progress.state) {
          setScanStatus(progress.state);
        }
        if (Number.isFinite(progress.wsDiscoveryResponses)) {
          setScanMeta((prev) => ({
            ...prev,
            wsDiscoveryResponses: progress.wsDiscoveryResponses,
          }));
        }
      });

      const finalizeScan = async (payload) => {
        const finalState = payload?.state || 'completed';
        const finalDevices = Array.isArray(payload?.devices)
          ? payload.devices
          : [];
        setIsScanning(false);
        setScanStatus(finalState);
        setScanProgress((prev) => ({
          ...prev,
          found: Math.max(prev.found || 0, finalDevices.length),
          state: finalState,
        }));
        flushPendingDevices();
        if (finalDevices.length) {
          setDevices((prev) => {
            const merged = mergeDeviceLists(prev, finalDevices);
            schedulePersistDevices(merged);
            return merged;
          });
          const foundIps = normalizeIpList(
            finalDevices.map((device) => device?.ip)
          );
          if (foundIps.length) {
            const mergedIps = mergeIpLists(foundIps, lastKnownIps);
            const storedIps = await saveLastKnownIps(mergedIps);
            logCameraDiscovery('last_known_ips_saved', {
              count: storedIps.length,
              ips: storedIps,
              found: foundIps,
            });
          }
        }
        logCameraDiscovery('scan_complete', {
          durationMs: Date.now() - scanStartedAt,
          found: finalDevices.length,
          state: finalState,
        });
        removeFound();
        removeProgress();
        removeDone();
        scanHandleRef.current = null;
      };

      const removeDone = scanHandle.on('done', finalizeScan);
      const removeError = scanHandle.on('error', (error) => {
        setErrorMessage(error?.message || 'unknown');
        setIsScanning(false);
        setScanStatus('error');
        setScanProgress((prev) => ({ ...prev, state: 'error' }));
        flushPendingDevices();
        removeFound();
        removeProgress();
        removeDone();
        scanHandleRef.current = null;
      });
    } finally {
      // service handles completion
    }
  };

  const handleCancelScan = () => {
    if (!scanHandleRef.current) return;
    scanHandleRef.current.cancel();
    scanHandleRef.current = null;
    setIsScanning(false);
    setScanStatus('cancelled');
    setScanProgress((prev) => ({ ...prev, state: 'cancelled' }));
    flushPendingDevices();
  };

  const openAuthModal = (device) => {
    if (device?.possibleCamera && !device?.rtspPath) {
      setSelectedDevice({ ...device, rtspPath: '/onvif1' });
    } else {
      setSelectedDevice(device);
    }
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
      discoverySource:
        selectedDevice.discoverySource ||
        (selectedDevice.manualConnect ? 'manual' : null),
      onvifOk: Boolean(selectedDevice.onvifOk),
      possibleCamera: Boolean(selectedDevice.possibleCamera),
      manualConnect: Boolean(selectedDevice.manualConnect),
      name: selectedDevice.name || null,
      manufacturer: selectedDevice.manufacturer || null,
      model: selectedDevice.model || null,
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
    openAuthModal({
      ip: trimmed,
      xaddrs: [],
      rtspPath: '/onvif1',
      rtspPort: 554,
      manualConnect: true,
    });
  };

  const buildNoResultsDetails = () => {
    const prefixes =
      Array.isArray(scanMeta.prefixes) && scanMeta.prefixes.length
        ? scanMeta.prefixes.join(', ')
        : '-';
    const wsCount = Number.isFinite(scanMeta.wsDiscoveryResponses)
      ? scanMeta.wsDiscoveryResponses
      : 0;
    return [
      t('wifiCamera.noResultsDetailsLocalIp', {
        ip: scanMeta.localIp || '-',
      }),
      t('wifiCamera.noResultsDetailsPrefixes', { prefixes }),
      t('wifiCamera.noResultsDetailsWsDiscovery', { count: wsCount }),
    ];
  };

  const getDeviceStatusLabel = (device) => {
    if (!device) return '';
    if (device.possibleCamera) {
      return t('wifiCamera.deviceStatusPossible');
    }
    if (device.discoverySource === 'ws-discovery' || device.onvifOk) {
      return t('wifiCamera.deviceStatusOnvif');
    }
    return t('wifiCamera.deviceStatusRtsp');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('wifiCamera.title')}</Text>
          <Text style={styles.subtitle}>{t('wifiCamera.subtitle')}</Text>
        </View>

        <View style={styles.actionsCard}>
          <BigButton
            title={isScanning ? t('wifiCamera.scanning') : t('wifiCamera.scan')}
            onPress={handleScan}
            disabled={isScanning}
            accessibilityRole="button"
            accessibilityLabel={t('wifiCamera.a11y.scan')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          />
          <View style={styles.manualBlock}>
            <Text style={styles.inputLabel}>
              {t('wifiCamera.manualIpLabel')}
            </Text>
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
              style={styles.secondaryButton}
              onPress={handleManualConnect}
              accessibilityRole="button"
              accessibilityLabel={t('wifiCamera.a11y.manualConnect')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.secondaryButtonText}>
                {t('wifiCamera.manualIpTitle')}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hintText}>{t('wifiCamera.hint')}</Text>
        </View>

        {CAMERA_DISCOVERY_DEBUG_UI ? (
          <View style={styles.debugCard}>
            <Text style={styles.sectionTitle}>
              {t('wifiCamera.statusTitle')}
            </Text>
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
            <TouchableOpacity style={styles.logButton} onPress={handleCopyLogs}>
              <Text style={styles.logButtonText}>
                {t('wifiCamera.copyLogs')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.resultsCard}>
          <View style={styles.resultsHeader}>
            <Text style={styles.sectionTitle}>
              {t('wifiCamera.resultsTitle')}
            </Text>
            <Text style={styles.metaText}>
              {t('wifiCamera.foundCount', {
                count: Math.max(scanProgress.found || 0, devices.length),
              })}
            </Text>
          </View>

          {isScanning && (
            <View style={styles.scanningRow}>
              <CustomActivityIndicator size="large" color="#007AFF" />
              <View style={styles.scanningTextBlock}>
                <Text style={styles.scanningText}>
                  {t('wifiCamera.scanning')}
                </Text>
                {scanStage ? (
                  <Text style={styles.statusDetail}>{scanStage}</Text>
                ) : null}
                {scanStageDetail ? (
                  <Text style={styles.statusDetail}>{scanStageDetail}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.cancelScanButton}
                onPress={handleCancelScan}
                accessibilityRole="button"
                accessibilityLabel={t('wifiCamera.a11y.cancelScan')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.cancelScanText}>
                  {t('wifiCamera.cancelScan')}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.scanMetaRow}>
            <Text style={styles.metaText}>
              {t('wifiCamera.verifiedCount', {
                count: Number.isFinite(scanProgress.checked)
                  ? scanProgress.checked
                  : 0,
              })}
            </Text>
            <Text style={styles.metaText}>
              {t('wifiCamera.elapsedTime', {
                time: formatElapsed(scanProgress.elapsedMs),
              })}
            </Text>
          </View>
          <Text style={styles.statusBadge}>
            {t('wifiCamera.scanStatusLabel', { status: statusLabel })}
          </Text>

          {!isScanning && errorMessage ? (
            <Text style={styles.errorText}>
              {t('wifiCamera.errorMessage', { details: errorMessage })}
            </Text>
          ) : null}

          {!isScanning && !errorMessage && devices.length === 0 ? (
            <View>
              <Text style={styles.helperText}>{t('wifiCamera.noResults')}</Text>
              {CAMERA_DISCOVERY_DEBUG_UI ? (
                <>
                  <Text style={styles.metaText}>
                    {t('wifiCamera.noResultsDetailsTitle')}
                  </Text>
                  {buildNoResultsDetails().map((line) => (
                    <Text key={line} style={styles.helperText}>
                      {line}
                    </Text>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}

          {devices.length > 0 ? (
            <>
              {devices.map((device) => (
                <View key={device.ip} style={styles.resultCard}>
                  <View style={styles.resultRowHeader}>
                    <Text style={styles.resultTitle}>
                      {t('wifiCamera.deviceLabel', { ip: device.ip })}
                    </Text>
                    <View style={styles.resultActions}>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemoveDevice(device)}
                        accessibilityRole="button"
                        accessibilityLabel={t('wifiCamera.a11y.removeDevice', {
                          ip: device.ip,
                        })}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.removeButtonText}>
                          {t('wifiCamera.removeCamera')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.connectButton}
                        onPress={() => openAuthModal(device)}
                        accessibilityRole="button"
                        accessibilityLabel={t('wifiCamera.a11y.connectDevice', {
                          ip: device.ip,
                        })}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.connectButtonText}>
                          {t('wifiCamera.connect')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.deviceStatus,
                      device?.possibleCamera
                        ? styles.deviceStatusPossible
                        : styles.deviceStatusConfirmed,
                    ]}
                  >
                    {getDeviceStatusLabel(device)}
                  </Text>
                  {CAMERA_DISCOVERY_DEBUG_UI
                    ? (device.xaddrs || []).map((url) => (
                        <Text
                          key={`${device.ip}-${url}`}
                          style={styles.resultSubtitle}
                        >
                          {t('wifiCamera.xaddrsLabel', { url })}
                        </Text>
                      ))
                    : null}
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
                  accessibilityRole="button"
                  accessibilityLabel={t('wifiCamera.a11y.startRecording')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 20, flexGrow: 1 },
  header: { alignItems: 'center', marginBottom: 14 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 6,
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  resultsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  debugCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  hintText: {
    fontSize: 12,
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
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
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
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 10,
  },
  scanningText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  scanningTextBlock: {
    flex: 1,
  },
  cancelScanButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cancelScanText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scanMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  statusBadge: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  resultCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  manualBlock: {
    gap: 8,
  },
  resultRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  deviceStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  deviceStatusPossible: {
    color: '#b45309',
  },
  deviceStatusConfirmed: {
    color: '#047857',
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
  removeButton: {
    borderWidth: 1,
    borderColor: '#dc2626',
    backgroundColor: '#fff1f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeButtonText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  logButton: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 2,
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
