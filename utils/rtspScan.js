import TcpSocket from 'react-native-tcp-socket';
import { NativeModules } from 'react-native';

const DEFAULT_PORT = 554;
const DEFAULT_PATHS = ['/onvif1'];
const DEFAULT_TIMEOUT_MS = 700;
const DEFAULT_CONCURRENCY = 24;

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

const buildOptionsRequest = (ip, port, path) =>
  [
    `OPTIONS rtsp://${ip}:${port}${path} RTSP/1.0`,
    'CSeq: 1',
    'User-Agent: CountG',
    '',
    '',
  ].join('\r\n');

const probeRtspPath = (ip, port, path, timeoutMs) =>
  new Promise((resolve) => {
    let done = false;
    let buffer = '';
    let socket = null;
    let timer = null;

    const finish = (result) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
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
      const request = buildOptionsRequest(ip, port, path);
      socket.write(request);
    });

    timer = setTimeout(() => finish(null), timeoutMs);

    socket.on('data', (data) => {
      buffer += data?.toString ? data.toString('utf8') : String(data);
      if (buffer.includes('RTSP/1.0')) {
        const matchHint = buffer.includes('realm="HIipCamera"')
          ? 'HIipCamera'
          : null;
        finish({
          ip,
          rtspPath: path,
          rtspPort: port,
          matchHint,
          source: 'rtsp-scan',
        });
      }
    });

    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
  });

export const scanRtspDevices = async ({
  subnetPrefix = null,
  port = DEFAULT_PORT,
  paths = DEFAULT_PATHS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
} = {}) => {
  const prefix = await getSubnetPrefix(subnetPrefix);
  if (!prefix) return [];

  const normalizedPaths = paths.map(normalizePath);
  const ips = [];
  for (let i = 1; i <= 254; i += 1) {
    ips.push(`${prefix}.${i}`);
  }

  const results = [];
  let index = 0;

  const worker = async () => {
    while (index < ips.length) {
      const ip = ips[index];
      index += 1;
      for (const path of normalizedPaths) {
        const hit = await probeRtspPath(ip, port, path, timeoutMs);
        if (hit) {
          results.push(hit);
          break;
        }
      }
    }
  };

  const workerCount = Math.min(concurrency, ips.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
};
