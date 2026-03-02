import TcpSocket from 'react-native-tcp-socket';
import { NativeModules } from 'react-native';

const DEFAULT_PORT = 554;
const DEFAULT_PATHS = ['/', '/onvif0', '/onvif1'];
const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_HTTP_TIMEOUT_MS = 900;
const DEFAULT_CONCURRENCY = 18;
const DEFAULT_ALLOW_CONNECT_ONLY = false;
const DEFAULT_DEBUG = false;
const DEFAULT_REFUSED_RETRIES = 1;
const DEFAULT_REFUSED_RETRY_DELAY_MS = 150;
const DEFAULT_OPEN_PORTS = [554, 8554, 10554];
const DEFAULT_OPEN_PORT_TIMEOUT_MS = 500;
const ENFORCED_HOST_MIN = 0;
const ENFORCED_HOST_MAX = 255;
const ENFORCED_CONCURRENCY = 10;
const ENFORCED_TCP_TIMEOUT_MS = 2000;
const ENFORCED_RTSP_TIMEOUT_MS = 2500;
const ENFORCED_HOST_MIN_TIME_MS = 0;
const ENFORCED_CONNECT_DELAY_MS = 120;
const ENFORCED_RTSP_PATH = '/onvif1';
const ENFORCED_RTSP_PORT = 554;
const PRIORITY_NEIGHBOR_RADIUS = 24;
const PREFERRED_DHCP_RANGE_MIN = 100;
const PREFERRED_DHCP_RANGE_MAX = 199;
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

const isValidIp = (value) => {
  if (!value) return false;
  const parts = String(value).split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
};

const getHostOctet = (ip) => {
  if (!isValidIp(ip)) return null;
  const parts = String(ip).split('.');
  const host = Number(parts[3]);
  return Number.isFinite(host) ? host : null;
};

const isInPrefix = (ip, prefix) => {
  if (!ip || !prefix) return false;
  return String(ip).startsWith(`${prefix}.`);
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

const selectPreferredPath = (paths) => {
  if (!Array.isArray(paths) || !paths.length) return '/onvif1';
  const normalized = paths.map(normalizePath);
  return normalized.find((path) => path === '/onvif1') || normalized[0];
};

const probeTcpConnect = (host, port, timeoutMs = 400, onLog = null) =>
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
      resolve({ ok, reason, port, elapsedMs: Date.now() - startedAt });
    };

    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
    try {
      socket = TcpSocket.createConnection({ host, port }, () => {
        clearTimeout(timer);
        if (typeof onLog === 'function') {
          onLog('[rtsp-scan] port_open', host, port);
        }
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

const isConnectionRefused = (stop) => {
  if (!stop) return false;
  const error = String(stop.error || '').toLowerCase();
  return error.includes('econnrefused') || error.includes('refused');
};

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
  { allowConnectOnly, onLog, onStop, auth, connectDelayMs = 0 } = {}
) =>
  new Promise((resolve) => {
    let done = false;
    let buffer = '';
    let socket = null;
    let timer = null;
    let followupTimer = null;
    let sawResponse = false;
    let connected = false;
    let sawRtspResponse = false;

    const finish = (result, reason, details = {}) => {
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
      if (typeof onStop === 'function') {
        onStop({
          ip,
          port,
          path,
          reason,
          connected,
          sawResponse,
          rtspResponse: sawRtspResponse,
          ...details,
        });
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
      const sendRequest = () => {
        if (done) return;
        try {
          socket.write(request);
        } catch (error) {
          finish(null, 'write_error', {
            error: error?.message || 'write_error',
          });
        }
      };
      if (connectDelayMs > 0) {
        setTimeout(sendRequest, connectDelayMs);
      } else {
        sendRequest();
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
        }, 'connect_only');
      } else {
        finish(null, 'timeout');
      }
    }, timeoutMs);

    socket.on('data', (data) => {
      sawResponse = true;
      if (typeof onLog === 'function') {
        onLog('[rtsp-scan] response', ip, port);
      }
      buffer += data?.toString ? data.toString('utf8') : String(data);
      if (!buffer.length) return;
      if (!buffer.includes('RTSP/1.0')) {
        return;
      }
      sawRtspResponse = true;
      const hints = extractMatchHints(buffer);
      finish(
        {
          ip,
          rtspPath: path,
          rtspPort: port,
          realm: hints.realm,
          server: hints.server,
          source: 'rtsp-scan',
          rtspResponse: true,
        },
        'hit'
      );
    });

    socket.on('error', (error) => {
      if (typeof onLog === 'function') {
        onLog('[rtsp-scan] error', ip, port, error?.message || 'unknown');
      }
      if (allowConnectOnly && connected && !sawResponse) {
        finish({
          ip,
          rtspPath: path,
          rtspPort: port,
          realm: null,
          server: null,
          source: 'rtsp-scan',
          connectOnly: true,
        }, 'connect_only_error', { error: error?.message || 'error' });
        return;
      }
      finish(null, 'error', { error: error?.message || 'error' });
    });
    socket.on('close', () => {
      if (typeof onLog === 'function' && !done) {
        onLog('[rtsp-scan] close', ip, port);
      }
      if (allowConnectOnly && connected && !sawResponse) {
        finish({
          ip,
          rtspPath: path,
          rtspPort: port,
          realm: null,
          server: null,
          source: 'rtsp-scan',
          connectOnly: true,
        }, 'connect_only_close');
        return;
      }
      finish(null, 'closed');
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
  priorityIps = [],
  matchHint = null,
  verifyOnvifPort = null,
  verifyTimeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
  allowConnectOnly = DEFAULT_ALLOW_CONNECT_ONLY,
  verifyConnectOnly = true,
  debug = DEFAULT_DEBUG,
  onLog = null,
  onHostResult = null,
  onStage = null,
  username = null,
  password = null,
  hostMin = 0,
  hostMax = 255,
  refusedRetries = DEFAULT_REFUSED_RETRIES,
  refusedRetryDelayMs = DEFAULT_REFUSED_RETRY_DELAY_MS,
  openPorts = DEFAULT_OPEN_PORTS,
  openPortTimeoutMs = DEFAULT_OPEN_PORT_TIMEOUT_MS,
  onPortOpenResult = null,
  signal = null,
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
  if (signal?.aborted) return [];
  const prefix = await getSubnetPrefix(subnetPrefix);
  if (!prefix) return [];

  const normalizedPaths = paths?.length
    ? Array.from(new Set(paths.map(normalizePath)))
    : [normalizePath(ENFORCED_RTSP_PATH)];
  const preferredPath = selectPreferredPath(normalizedPaths);
  const probePortsBase = [ENFORCED_RTSP_PORT];
  const openPortsList = Array.from(
    new Set(
      (Array.isArray(openPorts) ? openPorts : [openPorts])
        .map((portValue) => Number(portValue))
        .filter((portValue) => Number.isFinite(portValue) && portValue > 0)
        .concat([ENFORCED_RTSP_PORT])
    )
  );
  const safeMin = Math.min(Math.max(0, hostMin), 255);
  const safeMax = Math.min(Math.max(safeMin, hostMax), 255);
  const enforcedMin = Math.max(safeMin, ENFORCED_HOST_MIN);
  const enforcedMax = Math.min(safeMax, ENFORCED_HOST_MAX);
  const tcpTimeoutMs = clamp(
    Number(openPortTimeoutMs) || ENFORCED_TCP_TIMEOUT_MS,
    250,
    5000
  );
  const rtspTimeoutMs = clamp(
    Number(timeoutMs) || ENFORCED_RTSP_TIMEOUT_MS,
    600,
    8000
  );
  const connectDelayMs = clamp(
    Math.round(rtspTimeoutMs * 0.08),
    60,
    ENFORCED_CONNECT_DELAY_MS
  );
  const ips = [];
  for (let i = enforcedMin; i <= enforcedMax; i += 1) {
    ips.push(`${prefix}.${i}`);
  }
  const priorityList = Array.from(
    new Set(
      (priorityIps || [])
        .filter((item) => isValidIp(item))
        .filter((item) => isInPrefix(item, prefix))
        .filter((item) => {
          const host = getHostOctet(item);
          return (
            Number.isFinite(host) && host >= enforcedMin && host <= enforcedMax
          );
        })
    )
  );
  const prioritySet = new Set(priorityList);
  const nearPriorityIps = [];
  const nearPrioritySet = new Set();
  const priorityHosts = priorityList
    .map((ip) => getHostOctet(ip))
    .filter((host) => Number.isFinite(host));
  for (let delta = 1; delta <= PRIORITY_NEIGHBOR_RADIUS; delta += 1) {
    priorityHosts.forEach((host) => {
      const lower = host - delta;
      const upper = host + delta;
      if (lower >= enforcedMin) {
        const candidate = `${prefix}.${lower}`;
        if (!prioritySet.has(candidate) && !nearPrioritySet.has(candidate)) {
          nearPrioritySet.add(candidate);
          nearPriorityIps.push(candidate);
        }
      }
      if (upper <= enforcedMax) {
        const candidate = `${prefix}.${upper}`;
        if (!prioritySet.has(candidate) && !nearPrioritySet.has(candidate)) {
          nearPrioritySet.add(candidate);
          nearPriorityIps.push(candidate);
        }
      }
    });
  }

  const dhcpStart = Math.max(enforcedMin, PREFERRED_DHCP_RANGE_MIN);
  const dhcpEnd = Math.min(enforcedMax, PREFERRED_DHCP_RANGE_MAX);
  const dhcpPriorityIps = [];
  const dhcpPrioritySet = new Set();
  if (dhcpStart <= dhcpEnd) {
    for (let host = dhcpStart; host <= dhcpEnd; host += 1) {
      const candidate = `${prefix}.${host}`;
      if (prioritySet.has(candidate) || nearPrioritySet.has(candidate)) continue;
      dhcpPrioritySet.add(candidate);
      dhcpPriorityIps.push(candidate);
    }
  }

  const scheduledSet = new Set([
    ...prioritySet,
    ...nearPrioritySet,
    ...dhcpPrioritySet,
  ]);
  const orderedIps = [
    ...priorityList,
    ...nearPriorityIps,
    ...dhcpPriorityIps,
    ...ips.filter((ip) => !scheduledSet.has(ip)),
  ];
  const authCandidates =
    username || password
      ? [
          null,
          {
            username: username || '',
            password: password || '',
          },
        ]
      : [null];

  const results = [];
  let index = 0;
  const isAborted = () => Boolean(signal?.aborted);

  log(
    '[rtsp-scan] start',
    `prefix=${prefix}`,
    `range=${enforcedMin}-${enforcedMax}`,
    `priority=${priorityList.length}`,
    `nearPriority=${nearPriorityIps.length}`,
    `dhcpPriority=${dhcpPriorityIps.length}`,
    `refusedRetries=${refusedRetries}`,
    `openPorts=${openPortsList.length ? openPortsList.join(',') : 'none'}`,
    `tcpTimeoutMs=${tcpTimeoutMs}`,
    `rtspTimeoutMs=${rtspTimeoutMs}`
  );

  const worker = async () => {
    while (index < orderedIps.length) {
      if (isAborted()) break;
      const ip = orderedIps[index];
      index += 1;
      const hostStart = Date.now();
      let lastReason = 'no_response';
      let lastStop = null;
      let finalHit = null;
      let possibleHit = null;
      let openPort = null;
      let tcpConnected = false;
      let tcpTimeMs = null;
      let rtspResponse = false;
      if (openPortsList.length) {
        for (const candidatePort of openPortsList) {
          if (isAborted()) break;
          const openResult = await probeTcpConnect(
            ip,
            candidatePort,
            tcpTimeoutMs,
            (msg, ...rest) => log(msg, ...rest)
          );
          tcpConnected = openResult.ok;
          tcpTimeMs = openResult.elapsedMs;
          if (typeof onPortOpenResult === 'function') {
            onPortOpenResult({
              ip,
              port: candidatePort,
              connected: openResult.ok,
            });
          }
          if (openResult.ok) {
            openPort = candidatePort;
            possibleHit = {
              ip,
              rtspPath: preferredPath,
              rtspPort: candidatePort,
              realm: null,
              server: null,
              source: 'rtsp-port',
              possibleCamera: true,
              connectOnly: true,
              onvifOk: false,
            };
            break;
          }
        }
      }
      const probePorts = openPort
        ? [openPort, ...probePortsBase.filter((item) => item !== openPort)]
        : probePortsBase;
      for (const probePort of probePorts) {
        if (isAborted()) break;
        for (const path of normalizedPaths) {
          if (isAborted()) break;
          let attempt = 0;
          while (attempt <= refusedRetries) {
            if (isAborted()) break;
            const retryLabel = attempt > 0 ? `retry=${attempt}` : null;
            log(
              '[rtsp-scan] probe',
              ip,
              `port=${probePort}`,
              `path=${path}`,
              retryLabel || ''
            );
            let refusedInThisAttempt = false;
            for (const authCandidate of authCandidates) {
              let stopSnapshot = null;
              const hit = await probeRtspPath(
                ip,
                probePort,
                path,
                rtspTimeoutMs,
                {
                  allowConnectOnly,
                  connectDelayMs,
                  onLog: (msg, ...rest) => log(msg, ...rest),
                  onStop: (stop) => {
                    stopSnapshot = stop;
                    lastStop = stop;
                    if (stop?.reason) lastReason = stop.reason;
                    if (stop?.rtspResponse) {
                      rtspResponse = true;
                    }
                  },
                  auth: authCandidate,
                }
              );
              if (hit) {
                finalHit = hit;
                if (hit?.rtspResponse) rtspResponse = true;
                break;
              }
              if (isConnectionRefused(stopSnapshot)) {
                refusedInThisAttempt = true;
              }
            }
            if (finalHit) {
              break;
            }
            if (refusedInThisAttempt && attempt < refusedRetries) {
              attempt += 1;
              log(
                '[rtsp-scan] retry_refused',
                ip,
                `port=${probePort}`,
                `path=${path}`,
                `attempt=${attempt}`
              );
              if (refusedRetryDelayMs > 0) {
                await sleep(refusedRetryDelayMs);
              }
              continue;
            }
            break;
          }
          if (finalHit) {
            if (finalHit.connectOnly && verifyConnectOnly) {
              if (isAborted()) break;
              let verifyHit = null;
              for (const authCandidate of authCandidates) {
                verifyHit = await probeRtspPath(
                  ip,
                  probePort,
                  path,
                  Math.max(rtspTimeoutMs * 2, 2500),
                  {
                    allowConnectOnly: false,
                    connectDelayMs,
                    onLog: (msg, ...rest) => log(msg, ...rest),
                    onStop: (stop) => {
                      lastStop = stop;
                      if (stop?.reason) lastReason = stop.reason;
                      if (stop?.rtspResponse) {
                        rtspResponse = true;
                      }
                    },
                    auth: authCandidate,
                  }
                );
                if (verifyHit) break;
              }
              if (!verifyHit) {
                log('[rtsp-scan] connectOnly reject', ip);
                lastReason = 'connect_only_reject';
                finalHit = null;
                continue;
              }
              finalHit = verifyHit;
            }
            let onvifOk = true;
            if (verifyOnvifPort) {
              if (isAborted()) break;
              if (typeof onStage === 'function') {
                onStage('onvif_verify', { ip });
              }
              onvifOk = await verifyOnvifService(
                ip,
                verifyOnvifPort,
                verifyTimeoutMs
              );
              if (typeof onStage === 'function') {
                onStage('rtsp_scan', { ip });
              }
              if (!onvifOk) {
                log('[rtsp-scan] onvif reject', ip);
                lastReason = 'onvif_reject';
              }
            }
            if (matchHint) {
              const realmOk = matchesHint(finalHit.realm, matchHint);
              const serverOk = matchesHint(finalHit.server, matchHint);
              const hasHintData = Boolean(finalHit.realm || finalHit.server);
              if (hasHintData && !realmOk && !serverOk && !onvifOk) {
                log(
                  '[rtsp-scan] hint reject',
                  ip,
                  finalHit.realm,
                  finalHit.server
                );
                lastReason = 'hint_reject';
                finalHit = null;
                continue;
              }
            }
            const enrichedHit = { ...finalHit, onvifOk };
            log(
              '[rtsp-scan] hit',
              ip,
              `realm=${finalHit.realm || '-'}`,
              `server=${finalHit.server || '-'}`,
              `onvif=${onvifOk}`,
              `connectOnly=${finalHit.connectOnly ? 'yes' : 'no'}`
            );
            if (typeof onHostResult === 'function') {
              if (isAborted()) break;
              onHostResult({
                ip,
                result: 'hit',
                reason: 'hit',
                rtspPath: finalHit.rtspPath,
                rtspPort: finalHit.rtspPort,
                realm: finalHit.realm,
                server: finalHit.server,
                onvifOk,
              });
            }
            results.push(enrichedHit);
            break;
          }
        }
        if (finalHit) {
          break;
        }
      }
      if (!finalHit && possibleHit) {
        if (typeof onHostResult === 'function' && !isAborted()) {
          onHostResult({
            ip,
            result: 'possible_camera',
            reason: 'rtsp_port_open',
            rtspPort: possibleHit.rtspPort,
          });
        }
        results.push(possibleHit);
      } else if (
        typeof onHostResult === 'function' &&
        !results.some((r) => r.ip === ip) &&
        !isAborted()
      ) {
        const elapsedMs = Date.now() - hostStart;
        if (elapsedMs < ENFORCED_HOST_MIN_TIME_MS) {
          await sleep(ENFORCED_HOST_MIN_TIME_MS - elapsedMs);
        }
        onHostResult({
          ip,
          result: 'miss',
          reason: lastReason,
          lastStop,
        });
      }
      const totalTimeMs = Date.now() - hostStart;
      log(
        '[RTSP_SCAN]',
        `ip=${ip}`,
        `tcpConnected=${tcpConnected ? 'yes' : 'no'}`,
        `tcpTime=${tcpTimeMs != null ? tcpTimeMs : '-'}`,
        `rtspResponse=${rtspResponse ? 'yes' : 'no'}`,
        `totalTime=${totalTimeMs}`
      );
      if (probeDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, probeDelayMs));
      }
    }
  };

  const workerCount = Math.min(
    Math.max(1, Math.min(concurrency, ENFORCED_CONCURRENCY)),
    orderedIps.length
  );
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
  onHostResult = null,
  username = null,
  password = null,
  refusedRetries = DEFAULT_REFUSED_RETRIES,
  refusedRetryDelayMs = DEFAULT_REFUSED_RETRY_DELAY_MS,
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
      let lastReason = 'no_response';
      let lastStop = null;
      let finalHit = null;
      for (const path of normalizedPaths) {
        let attempt = 0;
        while (attempt <= refusedRetries) {
          let stopSnapshot = null;
          const hit = await probeRtspPath(ip, port, path, timeoutMs, {
            allowConnectOnly,
            onStop: (stop) => {
              stopSnapshot = stop;
              lastStop = stop;
              if (stop?.reason) lastReason = stop.reason;
            },
            auth:
              username || password
                ? {
                    username,
                    password,
                  }
                : null,
          });
          if (hit) {
            finalHit = hit;
            break;
          }
          if (isConnectionRefused(stopSnapshot) && attempt < refusedRetries) {
            attempt += 1;
            if (refusedRetryDelayMs > 0) {
              await sleep(refusedRetryDelayMs);
            }
            continue;
          }
          break;
        }
        if (!finalHit) continue;
        let onvifOk = true;
        if (verifyOnvifPort) {
          onvifOk = await verifyOnvifService(
            ip,
            verifyOnvifPort,
            verifyTimeoutMs
          );
          if (!onvifOk) {
            log('[rtsp-filter] onvif reject', ip);
            lastReason = 'onvif_reject';
          }
        }
        if (matchHint) {
          const realmOk = matchesHint(finalHit.realm, matchHint);
          const serverOk = matchesHint(finalHit.server, matchHint);
          const hasHintData = Boolean(finalHit.realm || finalHit.server);
          if (hasHintData && !realmOk && !serverOk && !onvifOk) {
            log(
              '[rtsp-filter] hint reject',
              ip,
              finalHit.realm,
              finalHit.server
            );
            lastReason = 'hint_reject';
            finalHit = null;
            continue;
          }
        }
        const enrichedHit = { ...finalHit, onvifOk };
        log(
          '[rtsp-filter] hit',
          ip,
          `realm=${finalHit.realm || '-'}`,
          `server=${finalHit.server || '-'}`,
          `onvif=${onvifOk}`
        );
        if (typeof onHostResult === 'function') {
          onHostResult({
            ip,
            result: 'hit',
            reason: 'hit',
            rtspPath: finalHit.rtspPath,
            rtspPort: finalHit.rtspPort,
            realm: finalHit.realm,
            server: finalHit.server,
            onvifOk,
          });
        }
        results.push(enrichedHit);
        break;
      }
      if (typeof onHostResult === 'function' && !results.some((r) => r.ip === ip)) {
        onHostResult({
          ip,
          result: 'miss',
          reason: lastReason,
          lastStop,
        });
      }
    }
  };

  const workerCount = Math.min(concurrency, uniqueIps.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  log('[rtsp-filter] done', `found=${results.length}`);
  return results;
};
