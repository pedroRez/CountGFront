import dgram from 'react-native-udp';
import { NativeModules, Platform } from 'react-native';

const MULTICAST_ADDRESS = '239.255.255.250';
const MULTICAST_PORT = 3702;
const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const BROADCAST_ADDRESS = '255.255.255.255';
const PROBE_TYPES = [
  null,
  'dn:NetworkVideoTransmitter',
  'tds:Device',
  'dn:Device',
];
const SSDP_ST_VALUES = [
  'ssdp:all',
  'upnp:rootdevice',
  'urn:schemas-upnp-org:device:Basic:1',
  'urn:schemas-upnp-org:device:MediaServer:1',
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

const buildSsdpMessage = (stValue = 'ssdp:all') =>
  [
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    'MX: 2',
    `ST: ${stValue}`,
    '',
    '',
  ].join('\r\n');

const extractXAddrs = (text) => {
  if (!text) return [];
  const regex = /<\w*:XAddrs>([^<]+)<\/\w*:XAddrs>/gi;
  const matches = [];
  let match = regex.exec(text);
  while (match) {
    if (match[1]) {
      matches.push(match[1].trim());
    }
    match = regex.exec(text);
  }
  if (!matches.length) {
    const altRegex = /<XAddrs>([^<]+)<\/XAddrs>/gi;
    let altMatch = altRegex.exec(text);
    while (altMatch) {
      if (altMatch[1]) {
        matches.push(altMatch[1].trim());
      }
      altMatch = altRegex.exec(text);
    }
  }
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
} = {}) =>
  new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const devices = new Map();
    let finished = false;
    let sendCount = 0;
    let lockReleased = false;

    const addDevice = (ip, xaddrs = []) => {
      if (!ip) return;
      const existing = devices.get(ip);
      if (existing) {
        const mergedXaddrs = Array.from(
          new Set([...(existing.xaddrs || []), ...xaddrs].filter(Boolean))
        );
        if (mergedXaddrs.length !== (existing.xaddrs || []).length) {
          devices.set(ip, { ...existing, xaddrs: mergedXaddrs });
        }
        return;
      }
      devices.set(ip, { ip, xaddrs });
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
      try {
        socket.close();
      } catch (error) {
        // ignore close errors
      }
      resolve(Array.from(devices.values()));
    };

    const handleMessage = (message, rinfo) => {
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

      const ssdpLocation = extractSsdpLocation(text);
      const ssdpIps = ssdpLocation ? extractIps([ssdpLocation]) : [];
      if (rinfo?.address) {
        ssdpIps.push(rinfo.address);
      }
      ssdpIps.forEach((ip) => addDevice(ip, []));
    };

    const sendUdp = (message, port, address) => {
      if (!message) return;
      const payload = typeof message === 'string' ? message : String(message);
      try {
        socket.send(payload, 0, payload.length, port, address, () => {});
      } catch (error) {
        // ignore send errors
      }
    };

    const sendProbe = () => {
      if (finished) return;
      PROBE_TYPES.forEach((types) => {
        const message = buildProbeMessage(types);
        sendUdp(message, MULTICAST_PORT, MULTICAST_ADDRESS);
        sendUdp(message, MULTICAST_PORT, BROADCAST_ADDRESS);
      });
      SSDP_ST_VALUES.forEach((stValue) => {
        const ssdpMessage = buildSsdpMessage(stValue);
        sendUdp(ssdpMessage, SSDP_PORT, SSDP_ADDRESS);
        sendUdp(ssdpMessage, SSDP_PORT, BROADCAST_ADDRESS);
      });
      sendCount += 1;
      if (sendCount < retries) {
        setTimeout(sendProbe, 500);
      }
    };

    socket.on('message', handleMessage);
    socket.on('error', (error) => {
      if (finished) return;
      finished = true;
      releaseLockOnce();
      try {
        socket.close();
      } catch (closeError) {
        // ignore close errors
      }
      reject(error);
    });

    void acquireMulticastLock();

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch (error) {
        // ignore
      }
      try {
        socket.addMembership(MULTICAST_ADDRESS);
      } catch (error) {
        // ignore
      }
      sendProbe();
      setTimeout(finish, timeoutMs);
    });
  });
