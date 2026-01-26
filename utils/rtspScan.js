import TcpSocket from 'react-native-tcp-socket';
import { NativeModules } from 'react-native';

const DEFAULT_PORT = 554;
const DEFAULT_PATHS = ['/onvif1'];
const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_HTTP_TIMEOUT_MS = 900;
const DEFAULT_CONCURRENCY = 18;
const DEFAULT_ALLOW_CONNECT_ONLY = false;
const DEFAULT_DEBUG = false;
const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
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
      BASE64_CHARS.charAt(enc1) +
      BASE64_CHARS.charAt(enc2) +
      BASE64_CHARS.charAt(enc3) +
      BASE64_CHARS.charAt(enc4);
  }
  return output;
};

const buildAuthHeader = (username, password) => {
  if (!username && !password) return null;
  const token = encodeBase64(`${username || ''}:${password || ''}`);
  return `Authorization: Basic ${token}`;
};

const buildRtspUrl = (ip, port, path, auth) => {
  const normalizedPath = normalizePath(path);
  if (!auth?.username && !auth?.password) {
    return `rtsp://${ip}:${port}${normalizedPath}`;
  }
  const safeUser = encodeURIComponent(auth.username || '');
  const safePass = encodeURIComponent(auth.password || '');
  const creds = auth.username ? `${safeUser}:${safePass}` : `:${safePass}`;
  return `rtsp://${creds}@${ip}:${port}${normalizedPath}`;
};

const buildOptionsRequest = (ip, port, path, auth) => {
  const authHeader = buildAuthHeader(auth?.username, auth?.password);
  const lines = [
    `OPTIONS ${buildRtspUrl(ip, port, path, auth)} RTSP/1.0`,
    'CSeq: 0',
    `User-Agent: ${RTSP_USER_AGENT}`,
  ];
  if (authHeader) {
    lines.push(authHeader);
  }
  lines.push('', '');
  return lines.join('\r\n');
};

const buildDescribeRequest = (ip, port, path, auth) => {
  const authHeader = buildAuthHeader(auth?.username, auth?.password);
  const lines = [
    `DESCRIBE ${buildRtspUrl(ip, port, path, auth)} RTSP/1.0`,
    'CSeq: 1',
    'Accept: application/sdp',
    `User-Agent: ${RTSP_USER_AGENT}`,
  ];
  if (authHeader) {
    lines.push(authHeader);
  }
  lines.push('', '');
  return lines.join('\r\n');
};

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
  { allowConnectOnly, onLog, auth } = {}
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
      if (typeof onLog === 'function') {
        onLog('[rtsp-scan] connected', ip, port);
      }
      const request = buildOptionsRequest(ip, port, path, auth);
      try {
        socket.write(request);
      } catch (error) {
        finish(null);
      }
    });

    timer = setTimeout(() => {
      if (typeof onLog === 'function') {
        onLog(
          '[rtsp-scan] timeout',
          ip,
          port,
          `connected=${connected ? 'yes' : 'no'}`,
          `response=${sawResponse ? 'yes' : 'no'}`
        );
      }
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
      if (typeof onLog === 'function') {
        onLog('[rtsp-scan] response', ip, port);
      }
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

    socket.on('error', (error) => {
      if (typeof onLog === 'function') {
        onLog('[rtsp-scan] error', ip, port, error?.message || 'unknown');
      }
      finish(null);
    });
    socket.on('close', () => {
      if (typeof onLog === 'function' && !done) {
        onLog('[rtsp-scan] close', ip, port);
      }
      finish(null);
    });

    followupTimer = setTimeout(() => {
      if (!connected || sawResponse || done) return;
      try {
        const request = buildDescribeRequest(ip, port, path, auth);
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
  probeDelayMs = 0,
  matchHint = null,
  verifyOnvifPort = null,
  verifyTimeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  allowConnectOnly = DEFAULT_ALLOW_CONNECT_ONLY,
  debug = DEFAULT_DEBUG,
  onLog = null,
  username = null,
  password = null,
  hostMin = 1,
  hostMax = 254,
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
  const safeMin = Math.min(Math.max(1, hostMin), 254);
  const safeMax = Math.min(Math.max(safeMin, hostMax), 254);
  const ips = [];
  for (let i = safeMin; i <= safeMax; i += 1) {
    ips.push(`${prefix}.${i}`);
  }

  const results = [];
  let index = 0;

  log('[rtsp-scan] start', `prefix=${prefix}`, `range=${safeMin}-${safeMax}`);

  const worker = async () => {
    while (index < ips.length) {
      const ip = ips[index];
      index += 1;
      for (const path of normalizedPaths) {
        log('[rtsp-scan] probe', ip, `path=${path}`);
        const hit = await probeRtspPath(ip, port, path, timeoutMs, {
          allowConnectOnly,
          onLog: (msg, ...rest) => log(msg, ...rest),
          auth:
            username || password
              ? {
                  username,
                  password,
                }
              : null,
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
            `onvif=${onvifOk}`,
            `connectOnly=${hit.connectOnly ? 'yes' : 'no'}`
          );
          results.push(hit);
          break;
        }
      }
      if (probeDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, probeDelayMs));
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
  username = null,
  password = null,
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
          auth:
            username || password
              ? {
                  username,
                  password,
                }
              : null,
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
