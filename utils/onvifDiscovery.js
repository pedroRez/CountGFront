import dgram from 'react-native-udp';

const MULTICAST_ADDRESS = '239.255.255.250';
const MULTICAST_PORT = 3702;

const buildMessageId = () =>
  `uuid:${Math.random().toString(16).slice(2)}-${Date.now()}`;

const buildProbeMessage = () => `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope
  xmlns:e="http://www.w3.org/2003/05/soap-envelope"
  xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
  xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>${buildMessageId()}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;

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
    const socket = dgram.createSocket({ type: 'udp4' });
    const devices = new Map();
    let finished = false;
    let sendCount = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
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
      const ips = extractIps(xaddrs);
      if (rinfo?.address) {
        ips.push(rinfo.address);
      }
      ips.forEach((ip) => {
        if (!devices.has(ip)) {
          devices.set(ip, { ip, xaddrs });
        }
      });
    };

    const sendProbe = () => {
      if (finished) return;
      const message = buildProbeMessage();
      socket.send(
        message,
        undefined,
        undefined,
        MULTICAST_PORT,
        MULTICAST_ADDRESS,
        () => {}
      );
      sendCount += 1;
      if (sendCount < retries) {
        setTimeout(sendProbe, 500);
      }
    };

    socket.on('message', handleMessage);
    socket.on('error', (error) => {
      if (finished) return;
      finished = true;
      try {
        socket.close();
      } catch (closeError) {
        // ignore close errors
      }
      reject(error);
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch (error) {
        // ignore
      }
      sendProbe();
      setTimeout(finish, timeoutMs);
    });
  });
