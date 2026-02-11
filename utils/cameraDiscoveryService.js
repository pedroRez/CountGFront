import { discoverOnvifDevices } from './onvifDiscovery';
import { scanRtspDevices } from './rtspScan';
import {
  isCameraDiscoveryDebugEnabled,
  logCameraDiscovery,
} from './cameraDiscoveryLogger';

const DEFAULT_RTSP_TIMEOUT_MS = 1800;
const DEFAULT_ONVIF_TIMEOUT_MS = 4500;
const DEFAULT_ONVIF_RETRIES = 3;
const DEFAULT_CONCURRENCY = 10;
const PROGRESS_THROTTLE_MS = 200;

const sourceRank = {
  'ws-discovery': 3,
  'rtsp-scan': 2,
  'rtsp-port': 1,
  unknown: 0,
};

const confidenceFromDevice = (device) => {
  if (device?.onvifOk) return 0.95;
  if (device?.possibleCamera) return 0.55;
  return 0.8;
};

const pickBestString = (current, next) => {
  if (!next) return current || null;
  if (!current) return next;
  return next.length >= current.length ? next : current;
};

const normalizeDeviceId = (device) => {
  if (!device) return null;
  const uuid = device.uuid || device.onvifUuid;
  if (uuid) return String(uuid);
  const mac = device.mac || device.macAddress;
  if (mac) return String(mac).toLowerCase();
  if (device.ip) {
    const port = device.rtspPort || device.port || '';
    return `${device.ip}:${port}`.toLowerCase();
  }
  return null;
};

const normalizeDevice = (device) => {
  if (!device) return null;
  const id = normalizeDeviceId(device);
  if (!id) return null;
  const discoverySource = device.discoverySource || device.source || 'unknown';
  const onvifOk = Boolean(device.onvifOk);
  const possibleCamera = Boolean(device.possibleCamera);
  const protocol = onvifOk
    ? 'onvif'
    : device.rtspPath || device.rtspPort
      ? 'rtsp'
      : 'unknown';
  const confidence = Number.isFinite(device.confidence)
    ? device.confidence
    : confidenceFromDevice(device);
  return {
    id,
    ip: device.ip || null,
    port: device.port || null,
    rtspPort: device.rtspPort || null,
    rtspPath: device.rtspPath || null,
    protocol,
    name: device.name || null,
    manufacturer: device.manufacturer || null,
    model: device.model || null,
    xaddrs: Array.isArray(device.xaddrs) ? device.xaddrs : [],
    uuid: device.uuid || device.onvifUuid || null,
    mac: device.mac || device.macAddress || null,
    discoverySource,
    onvifOk,
    possibleCamera,
    lastSeenAt: Date.now(),
    confidence,
  };
};

const mergeDevice = (current, incoming) => {
  if (!current) return incoming;
  const next = { ...current };
  next.ip = incoming.ip || next.ip;
  next.port = incoming.port || next.port;
  next.rtspPort = incoming.rtspPort || next.rtspPort;
  next.rtspPath = incoming.rtspPath || next.rtspPath;
  next.name = pickBestString(next.name, incoming.name);
  next.manufacturer = pickBestString(next.manufacturer, incoming.manufacturer);
  next.model = pickBestString(next.model, incoming.model);
  next.uuid = incoming.uuid || next.uuid;
  next.mac = incoming.mac || next.mac;
  next.xaddrs = Array.from(
    new Set([...(next.xaddrs || []), ...(incoming.xaddrs || [])])
  );
  if (incoming.onvifOk) {
    next.onvifOk = true;
  }
  if (!incoming.possibleCamera || incoming.onvifOk) {
    next.possibleCamera = false;
  } else if (incoming.possibleCamera) {
    next.possibleCamera = true;
  }
  const currentRank = sourceRank[next.discoverySource] || 0;
  const incomingRank = sourceRank[incoming.discoverySource] || 0;
  if (incomingRank >= currentRank) {
    next.discoverySource = incoming.discoverySource;
  }
  next.protocol = next.onvifOk
    ? 'onvif'
    : next.rtspPath || next.rtspPort
      ? 'rtsp'
      : 'unknown';
  next.confidence = Math.max(
    next.confidence || 0,
    incoming.confidence || confidenceFromDevice(incoming)
  );
  next.lastSeenAt = Date.now();
  return next;
};

const hasDeviceChanges = (current, incoming) => {
  if (!current) return true;
  const keys = [
    'ip',
    'port',
    'rtspPort',
    'rtspPath',
    'name',
    'manufacturer',
    'model',
    'uuid',
    'mac',
    'discoverySource',
    'onvifOk',
    'possibleCamera',
    'protocol',
  ];
  for (const key of keys) {
    if (current[key] !== incoming[key]) return true;
  }
  if ((current.xaddrs || []).length !== (incoming.xaddrs || []).length) {
    return true;
  }
  return false;
};

const createEmitter = () => {
  const listeners = new Map();
  const on = (event, cb) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event)?.delete(cb);
  };
  const emit = (event, payload) => {
    const set = listeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb(payload);
      } catch (error) {
        // ignore listener errors
      }
    });
  };
  const clear = () => listeners.clear();
  return { on, emit, clear };
};

export const startScan = ({
  broadcastAddresses = [],
  prefixes = [],
  fallbackPrefixes = [],
  priorityIps = [],
  excludeIps = [],
  lastPassword = null,
  username = null,
  password = null,
  scanLocalOnly = false,
  hostMin = 1,
  hostMax = 254,
  onStage = null,
  verifyOnvifPort = [80, 5000, 8000, 8080, 8899],
  openPorts = [554, 8554, 10554],
  openPortTimeoutMs = 500,
  onvifTimeoutMs = DEFAULT_ONVIF_TIMEOUT_MS,
  onvifRetries = DEFAULT_ONVIF_RETRIES,
  rtspTimeoutMs = DEFAULT_RTSP_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
  probeDelayMs = 60,
  allowConnectOnly = false,
  stopAfterConfirmed = false,
} = {}) => {
  const emitter = createEmitter();
  const controller = new AbortController();
  let cancelled = false;
  let state = 'scanning';
  let checkedCount = 0;
  let foundCount = 0;
  let wsDiscoveryResponses = 0;
  const startedAt = Date.now();
  let lastProgressEmit = 0;
  const deviceMap = new Map();
  const excludedSet = new Set((excludeIps || []).filter(Boolean));
  const progressTimer = setInterval(() => {
    if (state !== 'scanning') return;
    emitProgress();
  }, 1000);

  const emitProgress = (extra = {}) => {
    const now = Date.now();
    if (now - lastProgressEmit < PROGRESS_THROTTLE_MS) return;
    lastProgressEmit = now;
    emitter.emit('progress', {
      state,
      checked: checkedCount,
      found: foundCount,
      wsDiscoveryResponses,
      elapsedMs: now - startedAt,
      ...extra,
    });
  };

  const emitDevice = (incoming) => {
    const normalized = normalizeDevice(incoming);
    if (!normalized) return;
    if (normalized.ip && excludedSet.has(normalized.ip)) return;
    const existing = deviceMap.get(normalized.id);
    const merged = mergeDevice(existing, normalized);
    const changed = hasDeviceChanges(existing, merged);
    deviceMap.set(merged.id, merged);
    if (!existing) {
      foundCount += 1;
    }
    if (changed) {
      emitter.emit('found', merged);
    }
    emitProgress();
  };

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    state = 'cancelled';
    controller.abort();
    clearInterval(progressTimer);
    emitProgress({ state });
    emitter.emit('done', { state, devices: Array.from(deviceMap.values()) });
  };

  const handle = {
    on: emitter.on,
    cancel,
    getState: () => state,
  };

  const runOnvifDiscovery = async () => {
    if (typeof onStage === 'function') onStage('ws_discovery', '');
    const onDevice = (device) => {
      if (cancelled) return;
      wsDiscoveryResponses += 1;
      emitDevice({
        ...device,
        discoverySource: 'ws-discovery',
        onvifOk: true,
        possibleCamera: false,
      });
    };
    const results = await discoverOnvifDevices({
      timeoutMs: onvifTimeoutMs,
      retries: onvifRetries,
      broadcastAddresses,
      onLog: isCameraDiscoveryDebugEnabled() ? logCameraDiscovery : null,
      onDevice,
      signal: controller.signal,
    });
    if (cancelled) return;
    if (Array.isArray(results) && results.length) {
      results.forEach((device) =>
        emitDevice({
          ...device,
          discoverySource: 'ws-discovery',
          onvifOk: true,
          possibleCamera: false,
        })
      );
    }
  };

  const runRtspScan = async () => {
    const runPrefixList = async (list) => {
      if (!Array.isArray(list) || !list.length) return false;
      let confirmedFound = false;
      for (const prefix of list) {
        if (cancelled) return confirmedFound;
        if (typeof onStage === 'function') {
          onStage('rtsp_scan', prefix);
        }
        const results = await scanRtspDevices({
          subnetPrefix: prefix,
          timeoutMs: rtspTimeoutMs,
          concurrency,
          probeDelayMs,
          priorityIps,
          matchHint: null,
          verifyOnvifPort,
          username: lastPassword ? username : null,
          password: lastPassword || password || null,
          hostMin,
          hostMax,
          allowConnectOnly,
          openPorts,
          openPortTimeoutMs,
          refusedRetries: 1,
          refusedRetryDelayMs: 200,
          onStage: (stage, payload) => {
            if (stage === 'onvif_verify') {
              if (typeof onStage === 'function') {
                onStage('onvif_verify', payload?.ip || '');
              }
            }
            if (stage === 'rtsp_scan') {
              if (typeof onStage === 'function') {
                onStage('rtsp_scan', payload?.ip || '');
              }
            }
          },
          onHostResult: (result) => {
            if (cancelled) return;
            checkedCount += 1;
            if (result?.result === 'hit') {
              confirmedFound = true;
              emitDevice({
                ...result,
                discoverySource: 'rtsp-scan',
                possibleCamera: false,
              });
            } else if (result?.result === 'possible_camera') {
              emitDevice({
                ...result,
                discoverySource: 'rtsp-port',
                possibleCamera: true,
                onvifOk: false,
              });
            }
            emitProgress();
          },
          onPortOpenResult: (data) => {
            if (!isCameraDiscoveryDebugEnabled()) return;
            logCameraDiscovery('rtsp_port_open_result', data);
          },
          signal: controller.signal,
        });
        if (cancelled) return confirmedFound;
        if (Array.isArray(results)) {
          results.forEach((item) => {
            emitDevice({
              ...item,
              discoverySource: item?.possibleCamera ? 'rtsp-port' : 'rtsp-scan',
              possibleCamera: Boolean(item?.possibleCamera),
            });
            if (!item?.possibleCamera) confirmedFound = true;
          });
        }
        if (stopAfterConfirmed && confirmedFound) return confirmedFound;
      }
      return confirmedFound;
    };

    const primaryPrefixes = Array.isArray(prefixes) ? prefixes : [];
    let confirmedFound = await runPrefixList(primaryPrefixes);
    if (!confirmedFound && Array.isArray(fallbackPrefixes)) {
      const fallbackList = fallbackPrefixes.filter(
        (item) => !primaryPrefixes.includes(item)
      );
      if (fallbackList.length) {
        confirmedFound = await runPrefixList(fallbackList);
      }
    }
  };

  const run = async () => {
    try {
      emitProgress();
      await runOnvifDiscovery();
      await runRtspScan();
      if (cancelled) return;
      state = 'completed';
      clearInterval(progressTimer);
      emitProgress({ state });
      emitter.emit('done', { state, devices: Array.from(deviceMap.values()) });
    } catch (error) {
      if (cancelled) return;
      state = 'error';
      clearInterval(progressTimer);
      emitProgress({ state });
      emitter.emit('error', error);
    }
  };

  run();

  return handle;
};
