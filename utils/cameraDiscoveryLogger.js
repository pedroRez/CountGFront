const DEBUG_FLAG = String(
  process.env.EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG_LOGS ||
    process.env.EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG ||
    process.env.DEBUG_DISCOVERY_LOGS ||
    ''
).toLowerCase();
const DEBUG_ENABLED = ['1', 'true', 'yes', 'on'].includes(DEBUG_FLAG);
const MAX_LOGS = DEBUG_ENABLED ? 6000 : 240;
const THROTTLE_MS = DEBUG_ENABLED ? 0 : 200;

const lastLogTimes = new Map();

const logs = [];

const shouldRedactKey = (key) => {
  if (!key) return false;
  const lowered = String(key).toLowerCase();
  return (
    lowered.includes('password') ||
    lowered.includes('passwd') ||
    lowered.includes('pwd') ||
    lowered.includes('secret') ||
    lowered.includes('token') ||
    lowered.includes('authorization')
  );
};

const redactRtspCredentials = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(
    /(rtsp:\/\/)([^:@\s]+):([^@]+)@/gi,
    (_, prefix, user) => `${prefix}${user}:***@`
  );
};

const sanitizeValue = (value, key) => {
  if (shouldRedactKey(key)) return '***';
  if (typeof value === 'string') {
    return redactRtspCredentials(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }
  return value;
};

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const output = Array.isArray(obj) ? [] : {};
  Object.keys(obj).forEach((key) => {
    output[key] = sanitizeValue(obj[key], key);
  });
  return output;
};

export const logCameraDiscovery = (message, data = null, level = 'info') => {
  const now = Date.now();
  if (THROTTLE_MS > 0) {
    const key = String(message);
    const last = lastLogTimes.get(key);
    if (last && now - last < THROTTLE_MS) {
      return;
    }
    lastLogTimes.set(key, now);
  }
  const entry = {
    ts: new Date().toISOString(),
    level,
    message: String(message),
    data: data ? sanitizeValue(data) : null,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  if (DEBUG_ENABLED) {
    if (entry.data) {
      console.log('[camera-discovery]', entry.message, entry.data);
    } else {
      console.log('[camera-discovery]', entry.message);
    }
  }
};

export const clearCameraDiscoveryLogs = () => {
  logs.length = 0;
  lastLogTimes.clear();
};

export const getCameraDiscoveryLogsText = () => {
  return logs
    .map((entry) => {
      const base = `[${entry.ts}] ${entry.level.toUpperCase()} ${entry.message}`;
      if (entry.data === null || entry.data === undefined) return base;
      return `${base} ${JSON.stringify(entry.data)}`;
    })
    .join('\n');
};

export const isCameraDiscoveryDebugEnabled = () => DEBUG_ENABLED;

