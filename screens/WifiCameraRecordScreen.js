import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  UIManager,
  findNodeHandle,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ModernFileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';
import { VLCPlayer } from 'react-native-vlc-media-player';
import { useFocusEffect } from '@react-navigation/native';

import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';
import { useRecordings } from '../context/RecordingsContext';
import {
  normalizeManualRtspInput,
  buildRtspUrlFromPath,
  resolveOnvifRtspUrl,
} from '../utils/onvifClient';
import { buildRtspPathCandidates } from '../utils/rtspPaths';

const MIN_FILE_BYTES = 200 * 1024;
const DEFAULT_RTSP_PATH = '/onvif1';
const VLC_INIT_OPTIONS = ['--rtsp-tcp', '--network-caching=300'];
const VLC_MEDIA_OPTIONS = [':network-caching=300', ':rtsp-tcp'];
const RECORDING_EXTENSION = 'mp4';
const RECORDING_READY_DELAY_MS = 150;
const RECORDING_READY_ATTEMPTS = 8;
const RECORDING_STABILIZE_ATTEMPTS = 6;
const RECORDING_STABILIZE_DELAY_MS = 350;
const RTSP_USER_AGENT = 'AndroidXMedia3/1.8.0';
const NETWORK_DIAG_TIMEOUT_MS = 800;
const NETWORK_HTTP_TIMEOUT_MS = 1500;
const DEFAULT_BACKEND_DIAG_URL = 'http://192.168.0.17:8000';
const WIFI_CAMERA_LAST_IPS_KEY = '@wifi_camera_last_ips';
const WIFI_CAMERA_LAST_IPS_LIMIT = 8;
const WIFI_CAMERA_LAST_DEVICES_KEY = '@wifi_camera_last_devices';
const WIFI_CAMERA_LAST_DEVICES_LIMIT = 12;
const FILESYSTEM_DEBUG_UI =
  String(process.env.EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG || '') === '1';

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

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

const buildWifiRecordingName = (wifiCamera, fileName) => {
  const cameraIp = wifiCamera?.ip ? String(wifiCamera.ip).trim() : '';
  const baseName = fileName ? String(fileName).replace(/\.[^.]+$/, '') : '';
  if (cameraIp && baseName) return `${cameraIp} - ${baseName}`;
  if (cameraIp) return `wifi_${cameraIp}_${Date.now()}`;
  return baseName || `wifi_recording_${Date.now()}`;
};

const buildRecordingFilePath = (directory) => {
  if (!directory) return null;
  const normalizedDir = normalizeDirectoryPath(directory);
  const timestamp = Date.now();
  return `${normalizedDir}wifi_camera_${timestamp}.${RECORDING_EXTENSION}`;
};

const getPathExtension = (path) => {
  if (!path || typeof path !== 'string') return null;
  const normalizedPath = stripFileScheme(path).split('?')[0].split('#')[0];
  const fileName = normalizedPath.split('/').pop() || '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex >= fileName.length - 1) return null;
  return fileName.slice(dotIndex + 1).toLowerCase();
};

const replacePathExtension = (path, extension) => {
  if (!path || typeof path !== 'string') return path;
  const normalizedExtension = String(extension || '')
    .replace(/^\.+/, '')
    .toLowerCase();
  if (!normalizedExtension) return path;

  const normalizedPath = stripFileScheme(path).split('?')[0].split('#')[0];
  const slashIndex = normalizedPath.lastIndexOf('/');
  const prefix =
    slashIndex >= 0 ? normalizedPath.slice(0, slashIndex + 1) : '';
  const fileName =
    slashIndex >= 0 ? normalizedPath.slice(slashIndex + 1) : normalizedPath;
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${prefix}${baseName}.${normalizedExtension}`;
};

const getMimeTypeForPath = (path) => {
  if (!path) return 'video/mp4';
  const extension = getPathExtension(path);
  if (extension === 'ts') return 'video/mp2t';
  if (extension === 'mkv') return 'video/x-matroska';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'avi') return 'video/x-msvideo';
  if (extension === 'm4v') return 'video/x-m4v';
  if (extension === 'webm') return 'video/webm';
  if (extension === '3gp') return 'video/3gpp';
  return 'video/mp4';
};


const waitForStableRecording = async (uri) => {
  if (!uri) return null;
  let lastSize = null;
  for (let attempt = 0; attempt < RECORDING_STABILIZE_ATTEMPTS; attempt += 1) {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (info?.exists && Number.isFinite(info.size) && info.size > MIN_FILE_BYTES) {
      if (lastSize !== null && Math.abs(info.size - lastSize) < 2048) {
        return info;
      }
      lastSize = info.size;
    }
    await new Promise((resolve) => setTimeout(resolve, RECORDING_STABILIZE_DELAY_MS));
  }
  return FileSystem.getInfoAsync(uri, { size: true });
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

const encodeBase64 = (input) => {
  const str = String(input);
  let output = '';
  let i = 0;
  while (i < str.length) {
    const chr1 = str.charCodeAt(i++);
    const chr2 = str.charCodeAt(i++);
    const chr3 = str.charCodeAt(i++);

    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    let enc4 = chr3 & 63;

    if (Number.isNaN(chr2)) {
      enc3 = 64;
      enc4 = 64;
    } else if (Number.isNaN(chr3)) {
      enc4 = 64;
    }

    output +=
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.charAt(enc1) +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.charAt(enc2) +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.charAt(enc3) +
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.charAt(enc4);
  }
  return output;
};


const isUsableRtspStatus = (statusCode) =>
  [200, 401, 403, 405, 454].includes(Number(statusCode));

const tryResolveRtspPathFromProbes = async ({
  ip,
  port,
  preferredPath,
  username,
  password,
} = {}) => {
  if (!ip || !port) return null;
  const candidates = buildRtspPathCandidates(preferredPath);

  for (const path of candidates) {
    const describeNoAuth = await probeRtspRequest({
      ip,
      port,
      path,
      method: 'DESCRIBE',
      timeoutMs: 1300,
    });
    if (isUsableRtspStatus(describeNoAuth?.statusCode)) {
      return {
        path,
        statusCode: describeNoAuth.statusCode,
        requiresAuth: describeNoAuth.statusCode === 401,
      };
    }

    const optionsNoAuth = await probeRtspRequest({
      ip,
      port,
      path,
      method: 'OPTIONS',
      timeoutMs: 1300,
    });
    if (isUsableRtspStatus(optionsNoAuth?.statusCode)) {
      return {
        path,
        statusCode: optionsNoAuth.statusCode,
        requiresAuth: optionsNoAuth.statusCode === 401,
      };
    }

    if (username || password) {
      const describeWithAuth = await probeRtspRequest({
        ip,
        port,
        path,
        method: 'DESCRIBE',
        auth: {
          username: username || '',
          password: password || '',
        },
        timeoutMs: 1600,
      });
      if (isUsableRtspStatus(describeWithAuth?.statusCode)) {
        return {
          path,
          statusCode: describeWithAuth.statusCode,
          requiresAuth: false,
        };
      }
    }
  }

  return null;
};

const buildRtspRequest = (method, url, authHeader = null) => {
  const lines = [
    `${method} ${url} RTSP/1.0`,
    'CSeq: 1',
    `User-Agent: ${RTSP_USER_AGENT}`,
  ];
  if (method === 'DESCRIBE') {
    lines.push('Accept: application/sdp');
  }
  if (authHeader) {
    lines.push(`Authorization: ${authHeader}`);
  }
  lines.push('', '');
  return lines.join('\r\n');
};

const probeTcpConnect = (host, port, timeoutMs = 500) =>
  new Promise((resolve) => {
    let settled = false;
    let socket = null;
    const startedAt = Date.now();
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
      resolve({
        ok,
        reason,
        elapsedMs: Date.now() - startedAt,
      });
    };

    if (!TcpSocket?.createConnection) {
      finish(false, 'tcp_socket_unavailable');
      return;
    }

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

const probeRtspRequest = ({
  ip,
  port,
  path,
  method,
  auth,
  timeoutMs = 1200,
} = {}) =>
  new Promise((resolve) => {
    if (!TcpSocket?.createConnection) {
      resolve({ ok: false, reason: 'tcp_socket_unavailable', elapsedMs: 0 });
      return;
    }
    if (!ip || !port || !path) {
      resolve({ ok: false, reason: 'invalid_target', elapsedMs: 0 });
      return;
    }
    let settled = false;
    let socket = null;
    let buffer = '';
    const startedAt = Date.now();

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (socket) {
        try {
          socket.destroy();
        } catch (error) {
          // ignore close errors
        }
      }
      resolve({
        elapsedMs: Date.now() - startedAt,
        ...payload,
      });
    };

    const url = buildRtspUrlFromPath({
      ip,
      port,
      path,
      username: auth?.username,
      password: auth?.password,
    });
    const authHeader =
      auth?.username || auth?.password
        ? `Basic ${encodeBase64(`${auth?.username || ''}:${auth?.password || ''}`)}`
        : null;
    const request = buildRtspRequest(method, url, authHeader);

    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);
    try {
      socket = TcpSocket.createConnection({ host: ip, port }, () => {
        try {
          socket.write(request);
        } catch (error) {
          clearTimeout(timer);
          finish({ ok: false, reason: 'write_error', error: error?.message });
        }
      });
      socket.on('data', (data) => {
        buffer += data?.toString ? data.toString('utf8') : String(data || '');
        const firstLine = buffer.split(/\r?\n/)[0];
        clearTimeout(timer);
        finish({
          ok: true,
          statusLine: firstLine || null,
          responseSnippet: buffer.slice(0, 160),
        });
      });
      socket.on('error', (error) => {
        clearTimeout(timer);
        finish({ ok: false, reason: error?.message || 'error' });
      });
      socket.on('close', () => {
        clearTimeout(timer);
        finish({ ok: false, reason: 'closed' });
      });
    } catch (error) {
      clearTimeout(timer);
      finish({ ok: false, reason: error?.message || 'error' });
    }
  });

const parseRtspTarget = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith('rtsp://')) return null;
  const remainder = value.slice('rtsp://'.length);
  const [authAndHost, ...pathParts] = remainder.split('/');
  const hostPart = authAndHost.includes('@')
    ? authAndHost.split('@').pop()
    : authAndHost;
  const [host, portStr] = hostPart.split(':');
  if (!host) return null;
  const path = pathParts.length ? `/${pathParts.join('/')}` : null;
  const port = Number(portStr);
  return {
    host,
    port: Number.isFinite(port) ? port : null,
    path,
  };
};

const isValidIpAddress = (value) => {
  if (!value || typeof value !== 'string') return false;
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
    if (!isValidIpAddress(ip)) return;
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
      if (!isValidIpAddress(ip)) return;
      if (seen.has(ip)) return;
      seen.add(ip);
      output.push(ip);
    });
  });
  return output;
};

const getSavedCameraId = (device) => {
  if (!device?.ip) return null;
  const port = Number(device.rtspPort);
  const safePort = Number.isFinite(port) && port > 0 ? port : '';
  return `${device.ip}:${safePort}`.toLowerCase();
};

const normalizeSavedCamera = (device) => {
  if (!device?.ip || !isValidIpAddress(device.ip)) return null;
  const port = Number(device.rtspPort);
  const normalizedPort = Number.isFinite(port) && port > 0 ? port : null;
  const id = getSavedCameraId({ ...device, rtspPort: normalizedPort });
  if (!id) return null;
  return {
    id,
    ip: device.ip,
    rtspPort: normalizedPort,
    rtspPath: device.rtspPath || null,
    discoverySource: device.discoverySource || null,
    possibleCamera: Boolean(device.possibleCamera),
    onvifOk: Boolean(device.onvifOk),
    xaddrs: Array.isArray(device.xaddrs) ? device.xaddrs : [],
    name: device.name || null,
    manufacturer: device.manufacturer || null,
    model: device.model || null,
    lastSeenAt: Date.now(),
  };
};

const loadSavedCameras = async () => {
  try {
    const raw = await AsyncStorage.getItem(WIFI_CAMERA_LAST_DEVICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSavedCamera).filter(Boolean);
  } catch (_error) {
    return [];
  }
};

const saveSavedCameras = async (devices) => {
  const normalized = (Array.isArray(devices) ? devices : [])
    .map(normalizeSavedCamera)
    .filter(Boolean)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
    .slice(0, WIFI_CAMERA_LAST_DEVICES_LIMIT);
  try {
    await AsyncStorage.setItem(
      WIFI_CAMERA_LAST_DEVICES_KEY,
      JSON.stringify(normalized)
    );
  } catch (_error) {
    // ignore storage failures
  }
  return normalized;
};

const saveLastKnownIps = async (ips) => {
  const normalized = normalizeIpList(ips, WIFI_CAMERA_LAST_IPS_LIMIT);
  try {
    await AsyncStorage.setItem(
      WIFI_CAMERA_LAST_IPS_KEY,
      JSON.stringify(normalized)
    );
  } catch (_error) {
    // ignore storage failures
  }
  return normalized;
};

const upsertSavedCamera = async (incoming) => {
  const normalized = normalizeSavedCamera(incoming);
  if (!normalized) return null;
  const existing = await loadSavedCameras();
  const index = existing.findIndex(
    (item) => item.id === normalized.id || item.ip === normalized.ip
  );
  if (index >= 0) {
    const current = existing[index];
    existing[index] = {
      ...current,
      ...normalized,
      xaddrs: Array.from(
        new Set([...(current.xaddrs || []), ...(normalized.xaddrs || [])])
      ),
      possibleCamera: false,
      lastSeenAt: Date.now(),
    };
  } else {
    existing.unshift(normalized);
  }
  await saveSavedCameras(existing);
  try {
    const rawIps = await AsyncStorage.getItem(WIFI_CAMERA_LAST_IPS_KEY);
    const parsedIps = rawIps ? JSON.parse(rawIps) : [];
    const mergedIps = mergeIpLists([normalized.ip], parsedIps);
    await saveLastKnownIps(mergedIps);
  } catch (_error) {
    await saveLastKnownIps([normalized.ip]);
  }
  return normalized;
};

const resolveMaybePromise = async (value) => {
  if (value && typeof value.then === 'function') {
    return await value;
  }
  return value;
};

const getLocalNetworkInfo = async () => {
  const netInfo = NativeModules?.NetworkInfo;
  if (!netInfo) return { localIp: null, ssid: null, bssid: null };
  let localIp = null;
  let ssid = null;
  let bssid = null;
  if (netInfo.getIpAddress) {
    try {
      localIp = await resolveMaybePromise(netInfo.getIpAddress());
    } catch (error) {
      localIp = null;
    }
  }
  if (netInfo.getSSID) {
    try {
      ssid = await resolveMaybePromise(netInfo.getSSID());
    } catch (error) {
      ssid = null;
    }
  }
  if (netInfo.getBSSID) {
    try {
      bssid = await resolveMaybePromise(netInfo.getBSSID());
    } catch (error) {
      bssid = null;
    }
  }
  return { localIp, ssid, bssid };
};

const isAndroidApiLevelAtLeast = (level) => {
  if (Platform.OS !== 'android') return false;
  const apiLevel = Number(Platform.Version);
  return Number.isFinite(apiLevel) && apiLevel >= level;
};

const getBackendDiagnosticBaseUrl = () => {
  const envUrl = String(process.env.EXPO_PUBLIC_API_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  return DEFAULT_BACKEND_DIAG_URL;
};

const ensureAndroidNetworkPermissions = async () => {
  if (Platform.OS !== 'android') {
    return {
      requested: [],
      results: {},
      skipped: true,
    };
  }
  const results = {};
  const requested = [];
  const perms = [];

  if (isAndroidApiLevelAtLeast(33)) {
    const nearbyWifi = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
    if (nearbyWifi) perms.push(nearbyWifi);
  } else {
    const fineLocation = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    if (fineLocation) perms.push(fineLocation);
  }

  for (const perm of perms) {
    try {
      const alreadyGranted = await PermissionsAndroid.check(perm);
      if (alreadyGranted) {
        results[perm] = 'granted';
        continue;
      }
      requested.push(perm);
      const requestResult = await PermissionsAndroid.request(perm);
      results[perm] = requestResult;
    } catch (error) {
      results[perm] = `error:${error?.message || 'unknown'}`;
    }
  }

  return { requested, results, skipped: false };
};

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
};

const tryBindProcessToWifi = async () => {
  if (Platform.OS !== 'android') {
    return { attempted: false, bound: false, reason: 'not_android' };
  }
  const candidates = [
    { name: 'WifiNetworkBinder', method: 'bindToWifi' },
    { name: 'NetworkBinder', method: 'bindToWifi' },
    { name: 'WifiBinder', method: 'bindToWifi' },
    { name: 'ConnectivityManager', method: 'bindProcessToWifi' },
  ];
  for (const candidate of candidates) {
    const module = NativeModules?.[candidate.name];
    const fn = module?.[candidate.method];
    if (typeof fn === 'function') {
      try {
        const result = await resolveMaybePromise(fn.call(module));
        return { attempted: true, bound: true, result, module: candidate.name };
      } catch (error) {
        return {
          attempted: true,
          bound: false,
          reason: error?.message || 'bind_failed',
          module: candidate.name,
        };
      }
    }
  }
  return { attempted: false, bound: false, reason: 'no_native_binding' };
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

const getRecordingDir = async () => {
  const docDir = isNonEmptyString(FileSystem.documentDirectory)
    ? FileSystem.documentDirectory
    : null;
  const cacheDir = isNonEmptyString(FileSystem.cacheDirectory)
    ? FileSystem.cacheDirectory
    : null;

  const ensureDir = async (base) => {
    if (!base) return null;
    const dir = normalizeDirectoryPath(`${base}recordings`);
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch (error) {
      // ignore mkdir errors
    }
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (info?.exists) {
        return stripFileScheme(dir);
      }
    } catch (error) {
      // ignore
    }
    return null;
  };

  const preferred = await ensureDir(docDir);
  if (preferred) {
    return {
      path: preferred,
      debug: { docDir, cacheDir },
    };
  }
  const fallback = await ensureDir(cacheDir);
  if (fallback) {
    return {
      path: fallback,
      debug: { docDir, cacheDir },
    };
  }
  return {
    path: null,
    debug: { docDir, cacheDir },
  };
};

export default function WifiCameraRecordScreen({ route, navigation }) {
  const { t } = useLanguage();
  const { addRecording } = useRecordings();
  const wifiCamera = route?.params?.wifiCamera || {};
  const [rtspUrl, setRtspUrl] = useState('');
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [connectDiagnostics, setConnectDiagnostics] = useState(null);
  const [networkSnapshot, setNetworkSnapshot] = useState(null);
  const [networkDiagnostics, setNetworkDiagnostics] = useState(null);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [isPlayerMounted, setIsPlayerMounted] = useState(false);
  const [playerDisabledReason, setPlayerDisabledReason] = useState('');
  const [stableRtspUrl, setStableRtspUrl] = useState('');
  const [playerSessionId, setPlayerSessionId] = useState(0);
  const [debugActionMessage, setDebugActionMessage] = useState('');

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
  const playerMountTimerRef = useRef(null);
  const stableUrlTimerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const playerSessionRef = useRef(0);
  const debugActionTimerRef = useRef(null);
  const successfulCameraKeyRef = useRef('');
  const diagnosticsRef = useRef({
    running: false,
    lastKey: '',
    lastAt: 0,
  });
  const networkDiagRef = useRef({
    running: false,
    lastAt: 0,
  });

  const debugInfo = useMemo(() => {
    if (!FILESYSTEM_DEBUG_UI) return null;
    const nativeModules = NativeModules || {};
    const expoOs =
      typeof process !== 'undefined' ? process?.env?.EXPO_OS : undefined;
    const sdkVersion = Constants?.expoConfig?.sdkVersion || null;
    const legacyFileSystemKeys = Object.keys(FileSystem || {})
      .slice(0, 40)
      .join(', ');
    const modernFileSystemKeys = Object.keys(ModernFileSystem || {})
      .slice(0, 40)
      .join(', ');
    const modernPaths = ModernFileSystem?.Paths;
    const modernDocumentUri = modernPaths?.document?.uri || '-';
    const modernCacheUri = modernPaths?.cache?.uri || '-';
    const nativeModuleKeys = Object.keys(nativeModules)
      .filter(
        (key) =>
          key.toLowerCase().includes('file') ||
          key.toLowerCase().includes('expo')
      )
      .slice(0, 50)
      .join(', ');

    return {
      platform: Platform.OS,
      expoOs,
      sdkVersion,
      fileSystemType: typeof FileSystem,
      fileSystemApi: 'legacy',
      legacyDocumentDirectory: FileSystem?.documentDirectory || '-',
      legacyCacheDirectory: FileSystem?.cacheDirectory || '-',
      modernDocumentDirectory: modernDocumentUri,
      modernCacheDirectory: modernCacheUri,
      legacyFileSystemKeys,
      modernFileSystemKeys,
      exponentFileSystemExists: Boolean(nativeModules?.ExponentFileSystem),
      nativeModuleKeys,
    };
  }, []);

  const networkSnapshotText = useMemo(() => {
    if (!networkSnapshot) return null;
    const lines = [
      `Platform.OS: ${networkSnapshot.platform || '-'}`,
      `Android API: ${networkSnapshot.apiLevel || '-'}`,
      `Network type: ${networkSnapshot.networkType || '-'}`,
      `isConnected: ${String(networkSnapshot.isConnected)}`,
      `isInternetReachable: ${String(networkSnapshot.isInternetReachable)}`,
      `isWifiEnabled: ${
        networkSnapshot.isWifiEnabled === undefined
          ? '-'
          : String(networkSnapshot.isWifiEnabled)
      }`,
      `nativeIp: ${networkSnapshot.nativeIp || '-'}`,
      `expoIp: ${networkSnapshot.expoIp || '-'}`,
      `ssid: ${networkSnapshot.ssid || '-'}`,
      `bssid: ${networkSnapshot.bssid || '-'}`,
    ];
    return lines.join('\n');
  }, [networkSnapshot]);

  const vlcSource = useMemo(() => {
    if (!stableRtspUrl) return null;
    return {
      uri: stableRtspUrl,
      initType: 2,
      initOptions: VLC_INIT_OPTIONS,
      mediaOptions: VLC_MEDIA_OPTIONS,
    };
  }, [stableRtspUrl]);

  const flashDebugMessage = useCallback((message) => {
    if (!FILESYSTEM_DEBUG_UI) return;
    if (debugActionTimerRef.current) {
      clearTimeout(debugActionTimerRef.current);
    }
    setDebugActionMessage(message);
    debugActionTimerRef.current = setTimeout(() => {
      setDebugActionMessage('');
    }, 2500);
  }, []);

  const logPlayerStage = useCallback((stage, payload) => {
    if (!FILESYSTEM_DEBUG_UI) return;
    const meta = {
      ts: new Date().toISOString(),
      stage,
      sessionId: playerSessionRef.current,
    };
    if (payload !== undefined) {
      console.log('[VLC][lifecycle]', { ...meta, payload });
    } else {
      console.log('[VLC][lifecycle]', meta);
    }
  }, []);

  const unmountPlayer = useCallback(
    (reason) => {
      if (playerMountTimerRef.current) {
        clearTimeout(playerMountTimerRef.current);
        playerMountTimerRef.current = null;
      }
      setIsPlayerMounted((prevMounted) => {
        if (prevMounted) {
          logPlayerStage('vlc_unmount', { reason: reason || '-' });
        }
        return false;
      });
      if (reason) {
        setPlayerDisabledReason(reason);
      }
    },
    [logPlayerStage]
  );

  const showSafeAlert = useCallback(
    (title, message, buttons, options) => {
      if (isPlayerMounted) {
        setPreviewEnabled(false);
        unmountPlayer(t('wifiCameraRecord.previewPaused'));
      }
      Alert.alert(title, message, buttons, options);
    },
    [isPlayerMounted, t, unmountPlayer]
  );

  const requestPreviewStart = useCallback(() => {
    setConnectError('');
    setPlayerDisabledReason('');
    setIsStreamReady(false);
    setPreviewEnabled(true);
    logPlayerStage('preview_start_request');
  }, [logPlayerStage]);

  const runConnectDiagnostics = useCallback(
    async ({ stage, error, rtspUrlOverride } = {}) => {
      if (!FILESYSTEM_DEBUG_UI) return;
      logPlayerStage('debug_action', {
        action: 'run_connect_diagnostics',
        stage: stage || '-',
      });
      const targetFromUrl = parseRtspTarget(rtspUrlOverride || rtspUrl);
      const targetIp = wifiCamera?.ip || targetFromUrl?.host || null;
      const targetPort =
        wifiCamera?.rtspPort || targetFromUrl?.port || 554;
      const targetPath =
        wifiCamera?.rtspPath || targetFromUrl?.path || DEFAULT_RTSP_PATH;
      if (!targetIp) return;

      const key = `${targetIp}:${targetPort}:${targetPath}:${stage || ''}`;
      const now = Date.now();
      if (diagnosticsRef.current.running) return;
      if (
        diagnosticsRef.current.lastKey === key &&
        now - diagnosticsRef.current.lastAt < 3000
      ) {
        return;
      }
      diagnosticsRef.current.running = true;
      diagnosticsRef.current.lastKey = key;
      diagnosticsRef.current.lastAt = now;

      const startedAt = Date.now();
      try {
        const localInfo = await getLocalNetworkInfo();
        const tcpResult = await probeTcpConnect(
          targetIp,
          targetPort,
          500
        );
        const optionsNoAuth = await probeRtspRequest({
          ip: targetIp,
          port: targetPort,
          path: targetPath,
          method: 'OPTIONS',
          timeoutMs: 1200,
        });
        const describeNoAuth = await probeRtspRequest({
          ip: targetIp,
          port: targetPort,
          path: targetPath,
          method: 'DESCRIBE',
          timeoutMs: 1200,
        });
        const hasAuth =
          Boolean(wifiCamera?.username) || Boolean(wifiCamera?.password);
        const describeAuth = hasAuth
          ? await probeRtspRequest({
              ip: targetIp,
              port: targetPort,
              path: targetPath,
              method: 'DESCRIBE',
              auth: {
                username: wifiCamera?.username || '',
                password: wifiCamera?.password || '',
              },
              timeoutMs: 1500,
            })
          : { ok: false, reason: 'skipped_no_credentials', elapsedMs: 0 };
        const elapsedMs = Date.now() - startedAt;
        const errorMessage = error
          ? error?.message || String(error)
          : null;
        const errorStack = error?.stack || null;

        const formatResult = (label, result) => {
          if (!result) return `${label}: -`;
          if (result.ok) {
            return `${label}: ok (${result.statusLine || result.reason || 'ok'}) ${result.elapsedMs}ms`;
          }
          return `${label}: fail (${result.reason || 'error'}) ${result.elapsedMs}ms`;
        };

        const lines = [
          `[Connect Diagnostics] ${new Date().toISOString()}`,
          `stage: ${stage || '-'}`,
          `error: ${errorMessage || '-'}`,
          errorStack ? `stack: ${errorStack}` : null,
          '',
          'device:',
          `  localIp: ${localInfo?.localIp || '-'}`,
          `  ssid: ${localInfo?.ssid || '-'}`,
          '',
          'target:',
          `  ip: ${targetIp}`,
          `  port: ${targetPort}`,
          `  path: ${targetPath}`,
          `  rtspUrl: ${rtspUrlOverride || rtspUrl || '-'}`,
          `  username: ${wifiCamera?.username || '-'}`,
          `  hasPassword: ${wifiCamera?.password ? 'yes' : 'no'}`,
          '',
          `tcp_connect: ${tcpResult.ok ? 'connected' : 'fail'} (${tcpResult.reason}) ${tcpResult.elapsedMs}ms`,
          formatResult('rtsp_options_no_auth', optionsNoAuth),
          formatResult('rtsp_describe_no_auth', describeNoAuth),
          formatResult('rtsp_describe_auth', describeAuth),
          '',
          `totalMs: ${elapsedMs}`,
        ].filter(Boolean);

        const text = lines.join('\n');
        setConnectDiagnostics({
          text,
          ts: Date.now(),
          stage: stage || null,
        });
        console.log('[FS][diagnostics]\n' + text);
      } catch (diagError) {
        const text = [
          `[Connect Diagnostics] ${new Date().toISOString()}`,
          `stage: ${stage || '-'}`,
          `error: ${diagError?.message || diagError || 'unknown'}`,
        ].join('\n');
        setConnectDiagnostics({ text, ts: Date.now(), stage: stage || null });
        console.log('[FS][diagnostics]\n' + text);
      } finally {
        diagnosticsRef.current.running = false;
      }
    },
    [logPlayerStage, rtspUrl, wifiCamera]
  );

  const handleCopyDiagnostics = useCallback(async () => {
    if (!connectDiagnostics?.text) return;
    logPlayerStage('debug_action', { action: 'copy_connect_logs' });
    try {
      await Clipboard.setStringAsync(connectDiagnostics.text);
      flashDebugMessage('Log de conexao copiado.');
    } catch (error) {
      flashDebugMessage('Falha ao copiar log.');
    }
  }, [connectDiagnostics, flashDebugMessage, logPlayerStage]);

  const loadNetworkSnapshot = useCallback(async () => {
    if (!FILESYSTEM_DEBUG_UI) return;
    try {
      const nativeInfo = await getLocalNetworkInfo();
      const networkState = await Network.getNetworkStateAsync();
      let expoIp = null;
      try {
        expoIp = await Network.getIpAddressAsync();
      } catch (error) {
        expoIp = null;
      }
      const details = networkState?.details || {};
      const ssid =
        nativeInfo?.ssid || details?.ssid || details?.ssidName || null;
      const bssid = nativeInfo?.bssid || details?.bssid || null;

      setNetworkSnapshot({
        platform: Platform.OS,
        apiLevel: Platform.OS === 'android' ? Platform.Version : null,
        networkType: networkState?.type || '-',
        isConnected: networkState?.isConnected,
        isInternetReachable: networkState?.isInternetReachable,
        isWifiEnabled: networkState?.isWifiEnabled,
        expoIp,
        nativeIp: nativeInfo?.localIp || null,
        ssid,
        bssid,
        details,
      });
    } catch (error) {
      setNetworkSnapshot({
        platform: Platform.OS,
        apiLevel: Platform.OS === 'android' ? Platform.Version : null,
        error: error?.message || 'failed',
      });
    }
  }, []);

  const runNetworkDiagnostics = useCallback(
    async ({ stage } = {}) => {
      if (!FILESYSTEM_DEBUG_UI) return;
      logPlayerStage('debug_action', {
        action: 'run_network_diagnostics',
        stage: stage || '-',
      });
      if (networkDiagRef.current.running) return;
      const now = Date.now();
      if (now - networkDiagRef.current.lastAt < 1500) return;
      networkDiagRef.current.running = true;
      networkDiagRef.current.lastAt = now;

      const startedAt = Date.now();
      try {
        const permissionResult = await ensureAndroidNetworkPermissions();
        const nativeInfo = await getLocalNetworkInfo();
        const networkState = await Network.getNetworkStateAsync();
        let expoIp = null;
        try {
          expoIp = await Network.getIpAddressAsync();
        } catch (error) {
          expoIp = null;
        }
        const details = networkState?.details || {};
        const ssid =
          nativeInfo?.ssid || details?.ssid || details?.ssidName || null;
        const bssid = nativeInfo?.bssid || details?.bssid || null;
        const wifiType =
          Network?.NetworkStateType?.WIFI || Network?.NetworkStateType?.Wifi || 'WIFI';
        const wifiConnected =
          networkState?.type === wifiType && networkState?.isConnected;

        const targetFromUrl = parseRtspTarget(rtspUrl);
        const targetIp = wifiCamera?.ip || targetFromUrl?.host || '192.168.0.18';
        const targetPort = wifiCamera?.rtspPort || targetFromUrl?.port || 554;
        const gatewayIp = targetIp
          ? `${targetIp.split('.').slice(0, 3).join('.')}.1`
          : '192.168.0.1';

        const bindResult = await tryBindProcessToWifi();

        const gatewayTcp = await probeTcpConnect(
          gatewayIp,
          80,
          NETWORK_DIAG_TIMEOUT_MS
        );
        const cameraTcp = await probeTcpConnect(
          targetIp,
          targetPort,
          NETWORK_DIAG_TIMEOUT_MS
        );

        const backendBaseUrl = getBackendDiagnosticBaseUrl();
        const healthUrl = `${backendBaseUrl.replace(/\/+$/, '')}/health`;
        let backendHealth = null;
        let backendRoot = null;
        try {
          backendHealth = await fetchWithTimeout(
            healthUrl,
            NETWORK_HTTP_TIMEOUT_MS
          );
        } catch (error) {
          backendHealth = { ok: false, error: error?.message || 'error' };
        }
        if (!backendHealth?.ok) {
          try {
            backendRoot = await fetchWithTimeout(
              backendBaseUrl,
              NETWORK_HTTP_TIMEOUT_MS
            );
          } catch (error) {
            backendRoot = { ok: false, error: error?.message || 'error' };
          }
        }

        const nativeIp = nativeInfo?.localIp || null;
        const isLocalIp =
          typeof nativeIp === 'string' && nativeIp.startsWith('192.168.');
        const suspectIsolation =
          isLocalIp && !gatewayTcp.ok && !cameraTcp.ok;
        const suspectMobileRouting =
          wifiConnected &&
          (!nativeIp || !nativeIp.startsWith('192.168.')) &&
          !cameraTcp.ok;

        const lines = [
          `[Network Diagnostics] ${new Date().toISOString()}`,
          `stage: ${stage || '-'}`,
          '',
          'platform:',
          `  os: ${Platform.OS}`,
          `  apiLevel: ${Platform.OS === 'android' ? Platform.Version : '-'}`,
          '',
          'permissions:',
          `  requested: ${
            permissionResult.requested?.length
              ? permissionResult.requested.join(', ')
              : '-'
          }`,
          `  results: ${
            Object.keys(permissionResult.results || {}).length
              ? JSON.stringify(permissionResult.results)
              : '-'
          }`,
          '',
          'connectivity:',
          `  type: ${networkState?.type || '-'}`,
          `  isConnected: ${String(networkState?.isConnected)}`,
          `  isInternetReachable: ${String(
            networkState?.isInternetReachable
          )}`,
          `  isWifiEnabled: ${
            networkState?.isWifiEnabled === undefined
              ? '-'
              : String(networkState?.isWifiEnabled)
          }`,
          '',
          'ip/ssid:',
          `  nativeIp: ${nativeIp || '-'}`,
          `  expoIp: ${expoIp || '-'}`,
          `  ssid: ${ssid || '-'}`,
          `  bssid: ${bssid || '-'}`,
          '',
          'binding:',
          `  attempted: ${bindResult.attempted ? 'yes' : 'no'}`,
          `  bound: ${bindResult.bound ? 'yes' : 'no'}`,
          `  module: ${bindResult.module || '-'}`,
          `  reason: ${bindResult.reason || '-'}`,
          '',
          'tcp:',
          `  gateway ${gatewayIp}:80 => ${
            gatewayTcp.ok ? 'connected' : 'fail'
          } (${gatewayTcp.reason}) ${gatewayTcp.elapsedMs}ms`,
          `  camera ${targetIp}:${targetPort} => ${
            cameraTcp.ok ? 'connected' : 'fail'
          } (${cameraTcp.reason}) ${cameraTcp.elapsedMs}ms`,
          '',
          'http:',
          `  ${healthUrl} => ${
            backendHealth?.ok ? 'ok' : 'fail'
          } ${backendHealth?.status || backendHealth?.error || '-'}`,
          backendRoot
            ? `  ${backendBaseUrl} => ${
                backendRoot?.ok ? 'ok' : 'fail'
              } ${backendRoot?.status || backendRoot?.error || '-'}`
            : null,
          '',
          suspectIsolation
            ? 'suspect: AP isolation / guest network (device cannot reach gateway or camera)'
            : null,
          suspectMobileRouting
            ? 'suspect: Wi-Fi connected but traffic routing via mobile data (disable mobile data to test)'
            : null,
          '',
          `details: ${JSON.stringify(details || {})}`,
          `totalMs: ${Date.now() - startedAt}`,
        ].filter(Boolean);

        const text = lines.join('\n');
        setNetworkDiagnostics({ text, ts: Date.now(), stage: stage || null });
        setNetworkSnapshot({
          platform: Platform.OS,
          apiLevel: Platform.OS === 'android' ? Platform.Version : null,
          networkType: networkState?.type || '-',
          isConnected: networkState?.isConnected,
          isInternetReachable: networkState?.isInternetReachable,
          isWifiEnabled: networkState?.isWifiEnabled,
          expoIp,
          nativeIp,
          ssid,
          bssid,
          details,
        });
        console.log('[Network][diagnostics]\n' + text);
      } catch (error) {
        const text = [
          `[Network Diagnostics] ${new Date().toISOString()}`,
          `stage: ${stage || '-'}`,
          `error: ${error?.message || error || 'unknown'}`,
        ].join('\n');
        setNetworkDiagnostics({ text, ts: Date.now(), stage: stage || null });
        console.log('[Network][diagnostics]\n' + text);
      } finally {
        networkDiagRef.current.running = false;
      }
    },
    [logPlayerStage, rtspUrl, wifiCamera]
  );

  const handleCopyNetworkDiagnostics = useCallback(async () => {
    if (!networkDiagnostics?.text) return;
    logPlayerStage('debug_action', { action: 'copy_network_logs' });
    try {
      await Clipboard.setStringAsync(networkDiagnostics.text);
      flashDebugMessage('Log de rede copiado.');
    } catch (error) {
      flashDebugMessage('Falha ao copiar log.');
    }
  }, [networkDiagnostics, flashDebugMessage, logPlayerStage]);

  useEffect(() => {
    if (!FILESYSTEM_DEBUG_UI || !debugInfo) return;
    console.log('[FS][debug] Platform.OS', debugInfo.platform);
    console.log('[FS][debug] EXPO_OS', debugInfo.expoOs || '-');
    console.log('[FS][debug] sdkVersion', debugInfo.sdkVersion || '-');
    console.log('[FS][debug] typeof FileSystem', debugInfo.fileSystemType);
    console.log('[FS][debug] API in use', debugInfo.fileSystemApi);
    console.log(
      '[FS][debug] legacy documentDirectory',
      debugInfo.legacyDocumentDirectory
    );
    console.log(
      '[FS][debug] legacy cacheDirectory',
      debugInfo.legacyCacheDirectory
    );
    console.log(
      '[FS][debug] modern documentDirectory',
      debugInfo.modernDocumentDirectory
    );
    console.log(
      '[FS][debug] modern cacheDirectory',
      debugInfo.modernCacheDirectory
    );
    console.log('[FS][debug] legacy FileSystem keys', debugInfo.legacyFileSystemKeys);
    console.log('[FS][debug] modern FileSystem keys', debugInfo.modernFileSystemKeys);
    console.log(
      '[FS][debug] ExponentFileSystem exists',
      debugInfo.exponentFileSystemExists
    );
    console.log('[FS][debug] NativeModules keys', debugInfo.nativeModuleKeys);
  }, [debugInfo]);

  useEffect(() => {
    if (!FILESYSTEM_DEBUG_UI) return;
    void loadNetworkSnapshot();
  }, [loadNetworkSnapshot]);

  useEffect(() => {
    if (stableUrlTimerRef.current) {
      clearTimeout(stableUrlTimerRef.current);
      stableUrlTimerRef.current = null;
    }
    if (!rtspUrl) {
      setStableRtspUrl('');
      return;
    }
    stableUrlTimerRef.current = setTimeout(() => {
      setStableRtspUrl(rtspUrl);
    }, 300);
    return () => {
      if (stableUrlTimerRef.current) {
        clearTimeout(stableUrlTimerRef.current);
        stableUrlTimerRef.current = null;
      }
    };
  }, [rtspUrl]);

  useEffect(() => {
    if (previewEnabled && stableRtspUrl && !isConnecting) {
      if (playerMountTimerRef.current) {
        clearTimeout(playerMountTimerRef.current);
      }
      setIsPlayerMounted(false);
      playerMountTimerRef.current = setTimeout(() => {
        playerSessionRef.current += 1;
        const nextSession = playerSessionRef.current;
        setPlayerSessionId(nextSession);
        setIsPlayerMounted(true);
        logPlayerStage('vlc_mount', { url: stableRtspUrl });
      }, 150);
      return () => {
        if (playerMountTimerRef.current) {
          clearTimeout(playerMountTimerRef.current);
          playerMountTimerRef.current = null;
        }
      };
    }
    unmountPlayer();
    return undefined;
  }, [previewEnabled, stableRtspUrl, isConnecting, unmountPlayer, logPlayerStage]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      logPlayerStage('appstate_change', { state: nextState });
      if (nextState === 'background' || nextState === 'inactive') {
        logPlayerStage('appstate_pause', { state: nextState });
        setPreviewEnabled(false);
        unmountPlayer(t('wifiCameraRecord.previewPaused'));
      }
      if (nextState === 'active') {
        logPlayerStage('appstate_active');
      }
      appStateRef.current = nextState;
    });
    return () => {
      subscription.remove();
    };
  }, [logPlayerStage, t, unmountPlayer]);

  useFocusEffect(
    useCallback(() => {
      logPlayerStage('screen_focus');
      return () => {
        logPlayerStage('screen_blur');
        setPreviewEnabled(false);
        unmountPlayer(t('wifiCameraRecord.previewPaused'));
      };
    }, [logPlayerStage, t, unmountPlayer])
  );

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
          showSafeAlert(
            t('wifiCameraRecord.recordErrorTitle'),
            buildRecordErrorMessage(
              `Arquivo nao encontrado. Pasta: ${recordingDirRef.current || '-'}`
            )
          );
        }
        isFinalizingRef.current = false;
        return;
      }

      let { uri: outputUri, info } = fileResult;
      const targetPath = recordingFileRef.current;
      const outputPath = stripFileScheme(outputUri);
      const sourceExtension = getPathExtension(outputPath);
      const normalizedTargetPath =
        targetPath && sourceExtension
          ? replacePathExtension(targetPath, sourceExtension)
          : targetPath;
      if (targetPath && outputUri) {
        const targetUri = ensureFileUri(normalizedTargetPath);
        if (targetUri && targetUri !== outputUri) {
          try {
            await FileSystem.moveAsync({ from: outputUri, to: targetUri });
            const movedInfo = await FileSystem.getInfoAsync(targetUri, {
              size: true,
            });
            if (movedInfo?.exists) {
              outputUri = targetUri;
              info = movedInfo;
            }
          } catch (error) {
            // ignore move failures
          }
        }
      }
      const stableInfo = await waitForStableRecording(outputUri);
      if (stableInfo?.exists) {
        info = stableInfo;
      }

      if (!info?.exists || !info.size || info.size < MIN_FILE_BYTES) {
        showSafeAlert(
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
        originalDurationMs: elapsedRef.current * 1000,
      };

      let recordingId = null;
      try {
        recordingId = await addRecording({
          name: buildWifiRecordingName(wifiCamera, recordedAsset.fileName),
          createdAt: new Date().toISOString(),
          localVideoUri: recordedAsset.uri,
          fileName: recordedAsset.fileName,
          mimeType: recordedAsset.mimeType,
          durationMs: recordedAsset.duration,
          source: 'wifi_camera',
          cameraIp: wifiCamera?.ip || null,
          cameraName: wifiCamera?.name || null,
          cameraModel: wifiCamera?.model || null,
          cameraManufacturer: wifiCamera?.manufacturer || null,
          rtspUrl: stableRtspUrl || rtspUrl || null,
        });
      } catch (error) {
        console.warn('Failed to save wifi recording metadata:', error);
      }

      navigation.replace('VideoEditor', {
        asset: {
          ...recordedAsset,
          recordingId,
        },
      });
      isFinalizingRef.current = false;
    },
    [
      addRecording,
      buildRecordErrorMessage,
      navigation,
      rtspUrl,
      showSafeAlert,
      stableRtspUrl,
      stopTimer,
      t,
      wifiCamera,
    ]
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
    logPlayerStage('connect_onvif_start');
    if (!wifiCamera?.ip) {
      setConnectError(t('wifiCameraRecord.missingCamera'));
      setIsConnecting(false);
      return;
    }
    requestPreviewStart();
    const fallbackUrl = buildRtspUrlFromPath({
      ip: wifiCamera?.ip,
      path: wifiCamera?.rtspPath || DEFAULT_RTSP_PATH,
      port: wifiCamera?.rtspPort || 554,
      username: wifiCamera?.username,
      password: wifiCamera?.password,
    });
    setIsConnecting(true);
    setConnectError('');
    try {
      let resolved = null;
      try {
        resolved = await resolveOnvifRtspUrl({
          ip: wifiCamera.ip,
          xaddrs: wifiCamera.xaddrs,
          username: wifiCamera.username,
          password: wifiCamera.password,
        });
      } catch (onvifError) {
        logPlayerStage('connect_onvif_resolve_failed', onvifError?.message || 'unknown');
      }

      if (!resolved) {
        const probeHit = await tryResolveRtspPathFromProbes({
          ip: wifiCamera.ip,
          port: wifiCamera?.rtspPort || 554,
          preferredPath: wifiCamera?.rtspPath || DEFAULT_RTSP_PATH,
          username: wifiCamera?.username,
          password: wifiCamera?.password,
        });
        if (probeHit?.path) {
          resolved = buildRtspUrlFromPath({
            ip: wifiCamera.ip,
            path: probeHit.path,
            port: wifiCamera?.rtspPort || 554,
            username: wifiCamera?.username,
            password: wifiCamera?.password,
          });
          logPlayerStage('connect_rtsp_probe_hit', probeHit);
        }
      }

      const finalUrl = resolved || fallbackUrl;
      if (!finalUrl) {
        throw new Error('RTSP not found');
      }
      setRtspUrl(finalUrl);
      setManualInput((prev) => prev || finalUrl);
    } catch (error) {
      logPlayerStage('connect_onvif_error', error?.message || 'unknown');
      setConnectError(t('wifiCameraRecord.connectError'));
      setRtspUrl('');
      if (FILESYSTEM_DEBUG_UI) {
        void runConnectDiagnostics({ stage: 'onvif-resolve', error });
      }
      setManualInput((prev) => {
        if (prev) return prev;
        return fallbackUrl || DEFAULT_RTSP_PATH;
      });
    } finally {
      setIsConnecting(false);
    }
  }, [logPlayerStage, requestPreviewStart, runConnectDiagnostics, t, wifiCamera]);

  useEffect(() => {
    handleConnectOnvif();
  }, [handleConnectOnvif]);

  useEffect(() => {
    if (isConnecting || !rtspUrl) {
      setIsStreamReady(false);
    }
  }, [isConnecting, rtspUrl]);

  useEffect(() => {
    if (!FILESYSTEM_DEBUG_UI) return;
    if (connectError) {
      void runNetworkDiagnostics({ stage: 'connect-error' });
    }
  }, [connectError, runNetworkDiagnostics]);

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
    logPlayerStage('manual_connect');
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
      showSafeAlert(
        t('common.error'),
        t('wifiCameraRecord.manualInvalidMessage')
      );
      return;
    }
    requestPreviewStart();
    if (!trimmedInput && fallbackUrl) {
      setManualInput(fallbackUrl);
    }
    setConnectError('');
    setRtspUrl(manualUrl);
  };

  const persistConnectedCamera = useCallback(async () => {
    const parsed = parseRtspTarget(stableRtspUrl || rtspUrl);
    const ip = parsed?.host || wifiCamera?.ip || null;
    if (!isValidIpAddress(ip || '')) return;
    const rtspPort =
      parsed?.port || Number(wifiCamera?.rtspPort) || 554;
    const rtspPath =
      parsed?.path || wifiCamera?.rtspPath || DEFAULT_RTSP_PATH;
    const key = `${ip}:${rtspPort}:${rtspPath}`.toLowerCase();
    if (successfulCameraKeyRef.current === key) return;
    successfulCameraKeyRef.current = key;
    await upsertSavedCamera({
      ip,
      rtspPort,
      rtspPath,
      discoverySource:
        wifiCamera?.discoverySource ||
        (wifiCamera?.manualConnect ? 'manual' : 'rtsp-scan'),
      possibleCamera: false,
      onvifOk: Boolean(wifiCamera?.onvifOk),
      xaddrs: Array.isArray(wifiCamera?.xaddrs) ? wifiCamera.xaddrs : [],
      name: wifiCamera?.name || null,
      manufacturer: wifiCamera?.manufacturer || null,
      model: wifiCamera?.model || null,
    });
  }, [rtspUrl, stableRtspUrl, wifiCamera]);

  const startRecording = async () => {
    logPlayerStage('start_recording');
    if (!rtspUrl) {
      showSafeAlert(
        t('common.error'),
        t('wifiCameraRecord.missingRtspMessage')
      );
      return;
    }
    if (!isStreamReady) {
      showSafeAlert(
        t('wifiCameraRecord.recordNotReadyTitle'),
        t('wifiCameraRecord.recordNotReadyMessage')
      );
      return;
    }
    if (isRecording) return;
    if (recordingPendingRef.current) return;
    recordingPendingRef.current = true;
    const docDir = isNonEmptyString(FileSystem.documentDirectory)
      ? FileSystem.documentDirectory
      : null;
    const cacheDir = isNonEmptyString(FileSystem.cacheDirectory)
      ? FileSystem.cacheDirectory
      : null;
    if (!docDir && !cacheDir) {
      const details = FILESYSTEM_DEBUG_UI
        ? `\n\nDocDir: ${FileSystem.documentDirectory || '-'}\nCacheDir: ${
            FileSystem.cacheDirectory || '-'
          }`
        : '';
      showSafeAlert(
        t('wifiCameraRecord.recordErrorTitle'),
        `${t('wifiCameraRecord.fileSystemUnavailable')}${details}`
      );
      recordingPendingRef.current = false;
      return;
    }
    const recorderReady = await waitForRecorderReady();
    if (!recorderReady) {
      showSafeAlert(
        t('wifiCameraRecord.recordUnsupportedTitle'),
        t('wifiCameraRecord.recordUnsupportedMessage')
      );
      recordingPendingRef.current = false;
      return;
    }

    const recordingResolution = await getRecordingDir();
    const recordingDir = recordingResolution?.path;
    if (!recordingDir) {
      const details = FILESYSTEM_DEBUG_UI
        ? `\n\nDocDir: ${recordingResolution?.debug?.docDir || '-'}\nCacheDir: ${
            recordingResolution?.debug?.cacheDir || '-'
          }`
        : '';
      showSafeAlert(
        t('wifiCameraRecord.recordErrorTitle'),
        `${t('wifiCameraRecord.fileSystemUnavailable')}${details}`
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
      logPlayerStage('start_recording_error', error?.message || 'unknown');
      stopTimer();
      setIsRecording(false);
      showSafeAlert(
        t('wifiCameraRecord.recordErrorTitle'),
        buildRecordErrorMessage(error?.message || 'Falha ao iniciar gravacao.')
      );
    } finally {
      recordingPendingRef.current = false;
    }
  };

  const stopRecording = async () => {
    logPlayerStage('stop_recording');
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

  const shouldShowPlayer =
    Boolean(stableRtspUrl) && previewEnabled && isPlayerMounted;

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

          {FILESYSTEM_DEBUG_UI && debugInfo ? (
            <View style={styles.debugPanel}>
              <Text style={styles.debugTitle}>Filesystem Debug</Text>
              <Text style={styles.debugText}>
                {[
                  `Platform.OS: ${debugInfo.platform}`,
                  `EXPO_OS: ${debugInfo.expoOs || '-'}`,
                  `SDK: ${debugInfo.sdkVersion || '-'}`,
                  `typeof FileSystem: ${debugInfo.fileSystemType}`,
                  `API in use: ${debugInfo.fileSystemApi}`,
                  `legacy documentDirectory: ${debugInfo.legacyDocumentDirectory}`,
                  `legacy cacheDirectory: ${debugInfo.legacyCacheDirectory}`,
                  `modern documentDirectory: ${debugInfo.modernDocumentDirectory}`,
                  `modern cacheDirectory: ${debugInfo.modernCacheDirectory}`,
                  `ExponentFileSystem: ${debugInfo.exponentFileSystemExists}`,
                  `legacy FileSystem keys: ${debugInfo.legacyFileSystemKeys || '-'}`,
                  `modern FileSystem keys: ${debugInfo.modernFileSystemKeys || '-'}`,
                  `NativeModules keys: ${debugInfo.nativeModuleKeys || '-'}`,
                  `VLC sessionId: ${playerSessionId}`,
                ].join('\n')}
              </Text>
              <Text style={styles.debugTitle}>Network Sanity</Text>
              <Text style={styles.debugText}>
                {networkSnapshotText || 'Carregando...'}
              </Text>
              <TouchableOpacity
                style={styles.debugCopyButton}
                onPress={() => runNetworkDiagnostics({ stage: 'manual' })}
              >
                <Text style={styles.debugCopyText}>
                  Rodar diagnostico de rede
                </Text>
              </TouchableOpacity>
              {networkDiagnostics?.text ? (
                <>
                  <Text style={styles.debugTitle}>Network Diagnostics</Text>
                  <Text style={styles.debugText} selectable>
                    {networkDiagnostics.text}
                  </Text>
                  <TouchableOpacity
                    style={styles.debugCopyButton}
                    onPress={handleCopyNetworkDiagnostics}
                  >
                    <Text style={styles.debugCopyText}>
                      Copiar diagnostico de rede
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {connectDiagnostics?.text ? (
                <>
                  <Text style={styles.debugTitle}>Connect Diagnostics</Text>
                  <Text style={styles.debugText} selectable>
                    {connectDiagnostics.text}
                  </Text>
                  <TouchableOpacity
                    style={styles.debugCopyButton}
                    onPress={handleCopyDiagnostics}
                  >
                    <Text style={styles.debugCopyText}>
                      Copiar diagnostico
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.debugHint}>
                  Diagnostico aparece apos falha de conexao RTSP.
                </Text>
              )}
              {debugActionMessage ? (
                <Text style={styles.debugHint}>{debugActionMessage}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.previewWrapper}>
            {isConnecting ? (
              <View style={styles.centered}>
                <CustomActivityIndicator size="large" color="#fff" />
                <Text style={styles.statusText}>
                  {t('wifiCameraRecord.connecting')}
                </Text>
              </View>
            ) : stableRtspUrl ? (
              shouldShowPlayer ? (
                <>
                  <VLCPlayer
                    ref={vlcRef}
                    source={vlcSource}
                    style={styles.preview}
                    autoplay={true}
                    paused={false}
                    onError={(event) => {
                      logPlayerStage('player_error', event);
                      setIsStreamReady(false);
                      setConnectError(t('wifiCameraRecord.previewError'));
                      setPreviewEnabled(false);
                      unmountPlayer(t('wifiCameraRecord.previewError'));
                      if (FILESYSTEM_DEBUG_UI) {
                        void runConnectDiagnostics({
                          stage: 'vlc-player',
                          error: event,
                          rtspUrlOverride: stableRtspUrl,
                        });
                      }
                    }}
                    onPlaying={() => {
                      setIsStreamReady(true);
                      setConnectError('');
                      setPlayerDisabledReason('');
                      void persistConnectedCamera();
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
                  {previewEnabled ? (
                    <>
                      <CustomActivityIndicator size="large" color="#fff" />
                      <Text style={styles.statusText}>
                        {t('wifiCameraRecord.connecting')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.statusText}>
                        {connectError ||
                          playerDisabledReason ||
                          t('wifiCameraRecord.previewPaused')}
                      </Text>
                      <TouchableOpacity
                        style={styles.previewButton}
                        onPress={requestPreviewStart}
                      >
                        <Text style={styles.previewButtonText}>
                          {t('wifiCameraRecord.startPreview')}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )
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
  previewButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  previewButtonText: { color: '#fff', fontWeight: '600' },
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
  debugPanel: {
    marginTop: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  debugTitle: { color: '#e5e7eb', fontWeight: '700', marginBottom: 6 },
  debugText: { color: '#9ca3af', fontSize: 12, lineHeight: 16 },
  debugHint: { color: '#6b7280', fontSize: 12, marginTop: 8 },
  debugCopyButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  debugCopyText: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
});
