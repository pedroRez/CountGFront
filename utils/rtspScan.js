import TcpSocket from 'react-native-tcp-socket';
import { NativeModules } from 'react-native';

const DEFAULT_PORT = 554;
const DEFAULT_PATHS = ['/onvif1'];
const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_HTTP_TIMEOUT_MS = 900;
const DEFAULT_CONCURRENCY = 18;
const DEFAULT_ALLOW_CONNECT_ONLY = false;
const DEFAULT_DEBUG = false;
const ONVIF_PROBE_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <tds:GetCapabilities xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
      <tds:Category>All</tds:Category>
    </tds:GetCapabilities>
  </s:Body>
</s:Envelope>`;

const normalizePath = (path) => {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
};

const getSubnetPrefix = async (manualPrefix) => {
  if (manualPrefix) return manualPrefix;
  const netInfo = NativeModules?.NetworkInfo;
  if (netInfo?.getIpAddress) {
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
  }
  return null;
};

const RTSP_USER_AGENT = 'AndroidXMedia3/1.8.0';

const buildOptionsRequest = (ip, port, path) =>
  [
    `OPTIONS rtsp://${ip}:${port}${path} RTSP/1.0`,
    'CSeq: 0',
    `User-Agent: ${RTSP_USER_AGENT}`,
    '',
    '',
  ].join('\r\n');

const buildDescribeRequest = (ip, port, path) =>
  [
    `DESCRIBE rtsp://${ip}:${port}${path} RTSP/1.0`,
    'CSeq: 1',
    'Accept: application/sdp',
    `User-Agent: ${RTSP_USER_AGENT}`,
    '',
    '',
  ].join('\r\n');

const extractMatchHints = (responseText) => {
  if (!responseText) return {};
  const realmMatch = responseText.match(/realm="([^"]+)"/i);
  const serverMatch = responseText.match(/Server:\s*([^\r\n]+)/i);
  return {
    realm: realmMatch ? realmMatch[1].trim() : null,
    server: serverMatch ? serverMatch[1].trim() : null,
  };
};

const matchesHint = (value, hint) => {
  if (!hint) return true;
  if (!value) return false;
  return value.toLowerCase().includes(hint.toLowerCase());
};

const normalizePorts = (ports) => {
  if (!ports) return [];
  return Array.isArray(ports) ? ports : [ports];
};

const verifyOnvifService = async (ip, ports, timeoutMs) => {
  const candidatePorts = normalizePorts(ports);
  if (!ip || !candidatePorts.length) return false;
  for (const port of candidatePorts) {
    const ok = await verifyOnvifServiceAtPort(ip, port, timeoutMs);
    if (ok) return true;
  }
  return false;
};

const verifyOnvifServiceAtPort = async (ip, port, timeoutMs) => {
  if (!ip || !port) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `http://${ip}:${port}/onvif/device_service`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
        },
        body: ONVIF_PROBE_BODY,
        signal: controller.signal,
      }
    );
    if ([200, 400, 401, 403, 405].includes(response.status)) {
      return true;
    }
    try {
      const text = await response.text();
      return text.toLowerCase().includes('onvif');
    } catch (error) {
      return false;
    }
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const probeRtspPath = (
  ip,
  port,
  path,
  timeoutMs,
  { allowConnectOnly } = {}
) =>
  new Promise((resolve) => {
    let done = false;
    let buffer = '';
    let socket = null;
    let timer = null;
    let followupTimer = null;
    let sawResponse = false;
    let connected = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (followupTimer) clearTimeout(followupTimer);
      if (socket) {
        try {
          socket.destroy();
        } catch (error) {
          // ignore socket close errors
        }
      }
      resolve(result);
    };

    socket = TcpSocket.createConnection({ host: ip, port }, () => {
      if (done) return;
      connected = true;
      const request = buildOptionsRequest(ip, port, path);
      try {
        socket.write(request);
      } catch (error) {
        finish(null);
      }
    });

    timer = setTimeout(() => {
      if (allowConnectOnly && connected) {
        finish({
          ip,
          rtspPath: path,
          rtspPort: port,
          realm: null,
          server: null,
          source: 'rtsp-scan',
          connectOnly: true,
        });
      } else {
        finish(null);
      }
    }, timeoutMs);

    socket.on('data', (data) => {
      sawResponse = true;
      buffer += data?.toString ? data.toString('utf8') : String(data);
      if (buffer.includes('RTSP/1.0')) {
        const hints = extractMatchHints(buffer);
        finish({
          ip,
          rtspPath: path,
          rtspPort: port,
          realm: hints.realm,
          server: hints.server,
          source: 'rtsp-scan',
        });
      }
    });

    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));

    followupTimer = setTimeout(() => {
      if (!connected || sawResponse || done) return;
      try {
        const request = buildDescribeRequest(ip, port, path);
        socket.write(request);
      } catch (error) {
        // ignore follow-up errors
      }
    }, 350);
  });

export const scanRtspDevices = async ({
  subnetPrefix = null,
  port = DEFAULT_PORT,
  paths = DEFAULT_PATHS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
  matchHint = null,
  verifyOnvifPort = null,
  verifyTimeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  allowConnectOnly = DEFAULT_ALLOW_CONNECT_ONLY,
  debug = DEFAULT_DEBUG,
  onLog = null,
} = {}) => {
  const log = (...args) => {
    if (debug) {
      console.log(...args);
    }
    if (typeof onLog === 'function') {
      const message = args.map((value) => String(value)).join(' ');
      onLog(message);
    }
  };
  if (!TcpSocket?.createConnection) {
    log('[rtsp-scan] tcp-socket unavailable');
    return [];
  }
  const prefix = await getSubnetPrefix(subnetPrefix);
  if (!prefix) return [];

  const normalizedPaths = paths.map(normalizePath);
  const ips = [];
  for (let i = 1; i <= 254; i += 1) {
    ips.push(`${prefix}.${i}`);
  }

  const results = [];
  let index = 0;

  log('[rtsp-scan] start', `prefix=${prefix}`);

  const worker = async () => {
    while (index < ips.length) {
      const ip = ips[index];
      index += 1;
      for (const path of normalizedPaths) {
        const hit = await probeRtspPath(ip, port, path, timeoutMs, {
          allowConnectOnly,
        });
        if (hit) {
          let onvifOk = true;
          if (verifyOnvifPort) {
            onvifOk = await verifyOnvifService(
              ip,
              verifyOnvifPort,
              verifyTimeoutMs
            );
            if (!onvifOk) {
              log('[rtsp-scan] onvif reject', ip);
            }
          }
          if (matchHint) {
            const realmOk = matchesHint(hit.realm, matchHint);
            const serverOk = matchesHint(hit.server, matchHint);
            const hasHintData = Boolean(hit.realm || hit.server);
            if (hasHintData && !realmOk && !serverOk && !onvifOk) {
              log('[rtsp-scan] hint reject', ip, hit.realm, hit.server);
              continue;
            }
          }
          log(
            '[rtsp-scan] hit',
            ip,
            `realm=${hit.realm || '-'}`,
            `server=${hit.server || '-'}`,
            `onvif=${onvifOk}`
          );
          results.push(hit);
          break;
        }
      }
    }
  };

  const workerCount = Math.min(concurrency, ips.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  log('[rtsp-scan] done', `found=${results.length}`);
  return results;
};

export const filterRtspDevices = async ({
  ips = [],
  port = DEFAULT_PORT,
  paths = DEFAULT_PATHS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = 6,
  matchHint = null,
  verifyOnvifPort = null,
  verifyTimeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  allowConnectOnly = DEFAULT_ALLOW_CONNECT_ONLY,
  debug = DEFAULT_DEBUG,
  onLog = null,
} = {}) => {
  const log = (...args) => {
    if (debug) {
      console.log(...args);
    }
    if (typeof onLog === 'function') {
      const message = args.map((value) => String(value)).join(' ');
      onLog(message);
    }
  };
  if (!TcpSocket?.createConnection) {
    log('[rtsp-filter] tcp-socket unavailable');
    return [];
  }
  const normalizedPaths = paths.map(normalizePath);
  const uniqueIps = Array.from(new Set(ips.filter(Boolean)));
  if (!uniqueIps.length) return [];

  const results = [];
  let index = 0;

  log('[rtsp-filter] start', `ips=${uniqueIps.length}`);

  const worker = async () => {
    while (index < uniqueIps.length) {
      const ip = uniqueIps[index];
      index += 1;
      for (const path of normalizedPaths) {
        const hit = await probeRtspPath(ip, port, path, timeoutMs, {
          allowConnectOnly,
        });
        if (!hit) continue;
        let onvifOk = true;
        if (verifyOnvifPort) {
          onvifOk = await verifyOnvifService(
            ip,
            verifyOnvifPort,
            verifyTimeoutMs
          );
          if (!onvifOk) {
            log('[rtsp-filter] onvif reject', ip);
          }
        }
        if (matchHint) {
          const realmOk = matchesHint(hit.realm, matchHint);
          const serverOk = matchesHint(hit.server, matchHint);
          const hasHintData = Boolean(hit.realm || hit.server);
          if (hasHintData && !realmOk && !serverOk && !onvifOk) {
            log('[rtsp-filter] hint reject', ip, hit.realm, hit.server);
            continue;
          }
        }
        log(
          '[rtsp-filter] hit',
          ip,
          `realm=${hit.realm || '-'}`,
          `server=${hit.server || '-'}`,
          `onvif=${onvifOk}`
        );
        results.push(hit);
        break;
      }
    }
  };

  const workerCount = Math.min(concurrency, uniqueIps.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  log('[rtsp-filter] done', `found=${results.length}`);
  return results;
};
