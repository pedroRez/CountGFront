import dgram from 'react-native-udp';
import { NativeModules, Platform } from 'react-native';

const MULTICAST_ADDRESS = '239.255.255.250';
const MULTICAST_PORT = 3702;
const BROADCAST_ADDRESS = '255.255.255.255';
const PROBE_TYPES = [
  null,
  'dn:NetworkVideoTransmitter',
  'tds:Device',
  'dn:Device',
];

const acquireMulticastLock = async () => {
  if (Platform.OS !== 'android') return;
  const module = NativeModules?.MulticastLock;
  if (!module?.acquire) return;
  try {
    await module.acquire();
  } catch (error) {
    // ignore lock errors
  }
};

const releaseMulticastLock = async () => {
  if (Platform.OS !== 'android') return;
  const module = NativeModules?.MulticastLock;
  if (!module?.release) return;
  try {
    await module.release();
  } catch (error) {
    // ignore lock errors
  }
};

const buildMessageId = () =>
  `uuid:${Math.random().toString(16).slice(2)}-${Date.now()}`;

const buildProbeMessage = (types) => `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope
  xmlns:e="http://www.w3.org/2003/05/soap-envelope"
  xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl"
  xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <e:Header>
    <w:MessageID>${buildMessageId()}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      ${types ? `<d:Types>${types}</d:Types>` : ''}
    </d:Probe>
  </e:Body>
</e:Envelope>`;

const hashPayload = (value) => {
  const text = typeof value === 'string' ? value : String(value || '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const extractXAddrs = (text) => {
  if (!text) return [];
  const collect = (regex) => {
    const out = [];
    let match = regex.exec(text);
    while (match) {
      if (match[1]) out.push(match[1].trim());
      match = regex.exec(text);
    }
    return out;
  };
  const matches = [
    ...collect(/<\w*:XAddrs>([^<]+)<\/\w*:XAddrs>/gi),
    ...collect(/<XAddrs>([^<]+)<\/XAddrs>/gi),
    ...collect(/<\w*:XAddr>([^<]+)<\/\w*:XAddr>/gi),
    ...collect(/<XAddr>([^<]+)<\/XAddr>/gi),
  ];
  const urls = matches
    .flatMap((value) => value.split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(urls));
};

const extractSsdpLocation = (text) => {
  if (!text) return null;
  const match = text.match(/(?:^|\r\n)LOCATION:\s*([^\r\n]+)/i);
  return match ? match[1].trim() : null;
};

const extractIps = (values) => {
  const ips = new Set();
  const regex = /(\d{1,3}(?:\.\d{1,3}){3})/g;
  values.forEach((value) => {
    let match = regex.exec(value);
    while (match) {
      ips.add(match[1]);
      match = regex.exec(value);
    }
  });
  return Array.from(ips);
};

export const discoverOnvifDevices = ({
  timeoutMs = 4000,
  retries = 2,
  broadcastAddresses = [],
  onLog,
  onDevice,
  signal,
} = {}) =>
  new Promise((resolve, reject) => {
    let socket = null;
    const devices = new Map();
    let finished = false;
    let sendCount = 0;
    let lockReleased = false;
    let responseCount = 0;

    const log = (message, data) => {
      if (typeof onLog === 'function') {
        onLog(message, data);
      }
    };

    const addDevice = (ip, xaddrs = []) => {
      if (!ip) return;
      const existing = devices.get(ip);
      if (existing) {
        const mergedXaddrs = Array.from(
          new Set([...(existing.xaddrs || []), ...xaddrs].filter(Boolean))
        );
        if (mergedXaddrs.length !== (existing.xaddrs || []).length) {
          const updated = { ...existing, xaddrs: mergedXaddrs };
          devices.set(ip, updated);
          if (typeof onDevice === 'function') {
            onDevice(updated);
          }
        }
        return;
      }
      const device = { ip, xaddrs };
      devices.set(ip, device);
      if (typeof onDevice === 'function') {
        onDevice(device);
      }
    };

    const releaseLockOnce = () => {
      if (lockReleased) return;
      lockReleased = true;
      void releaseMulticastLock();
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      releaseLockOnce();
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', handleAbort);
      }
      if (socket) {
        try {
          socket.close();
        } catch (error) {
          // ignore close errors
        }
      }
      log('onvif_discovery_done', {
        responses: responseCount,
        devices: devices.size,
      });
      resolve(Array.from(devices.values()));
    };

    const handleMessage = (message, rinfo) => {
      if (signal?.aborted) {
        finish();
        return;
      }
      responseCount += 1;
      log('onvif_discovery_message', {
        from: rinfo?.address,
        port: rinfo?.port,
        bytes: message?.length || 0,
      });
      const text = message?.toString ? message.toString('utf8') : String(message);
      const xaddrs = extractXAddrs(text);
      if (xaddrs.length) {
        const ips = extractIps(xaddrs);
        if (rinfo?.address) {
          ips.push(rinfo.address);
        }
        ips.forEach((ip) => addDevice(ip, xaddrs));
        return;
      }

      // Ignore SSDP/UPnP responses to avoid non-ONVIF devices.
    };

    const sendUdp = (message, port, address) => {
      if (!message) return;
      const payload = typeof message === 'string' ? message : String(message);
      try {
        socket.send(payload, 0, payload.length, port, address, () => {});
        log('onvif_discovery_send', {
          address,
          port,
          bytes: payload.length,
          hash: hashPayload(payload),
        });
      } catch (error) {
        // ignore send errors
      }
    };

    const sendProbe = () => {
      if (finished) return;
      const extraBroadcasts = Array.isArray(broadcastAddresses)
        ? broadcastAddresses.filter(Boolean)
        : [];
      const destinations = Array.from(
        new Set([MULTICAST_ADDRESS, BROADCAST_ADDRESS, ...extraBroadcasts])
      );
      PROBE_TYPES.forEach((types) => {
        const message = buildProbeMessage(types);
        destinations.forEach((address) => {
          sendUdp(message, MULTICAST_PORT, address);
        });
      });
      sendCount += 1;
      if (sendCount < retries) {
        setTimeout(sendProbe, 500);
      }
    };

    const handleAbort = () => {
      if (finished) return;
      finish();
    };

    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', handleAbort);
    }

    const start = async () => {
      await acquireMulticastLock();
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      socket.on('message', handleMessage);
      socket.on('error', (error) => {
        if (finished) return;
        const message = error?.message || '';
        if (message.toLowerCase().includes('socket is closed')) {
          finish();
          return;
        }
        finished = true;
        releaseLockOnce();
        try {
          socket.close();
        } catch (closeError) {
          // ignore close errors
        }
        reject(error);
      });

      socket.bind(0, () => {
        log('onvif_discovery_bound', { port: socket.address()?.port });
        try {
          socket.setBroadcast(true);
          log('onvif_discovery_broadcast_enabled');
        } catch (error) {
          log('onvif_discovery_broadcast_error', { error: error?.message });
        }
        try {
          socket.addMembership(MULTICAST_ADDRESS);
          log('onvif_discovery_multicast_joined', {
            address: MULTICAST_ADDRESS,
          });
        } catch (error) {
          log('onvif_discovery_multicast_error', { error: error?.message });
        }
        sendProbe();
        setTimeout(finish, timeoutMs);
      });
    };

    if (signal?.aborted) {
      finish();
      return;
    }

    start().catch((error) => {
      releaseLockOnce();
      reject(error);
    });
  });
