const SOAP_ENV_NS = 'http://www.w3.org/2003/05/soap-envelope';
const WSSE_NS =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const DEVICE_NS = 'http://www.onvif.org/ver10/device/wsdl';
const MEDIA_NS = 'http://www.onvif.org/ver10/media/wsdl';
const SCHEMA_NS = 'http://www.onvif.org/ver10/schema';

const DEFAULT_TIMEOUT_MS = 6000;
const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

const escapeXml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
      BASE64_CHARS.charAt(enc1) +
      BASE64_CHARS.charAt(enc2) +
      BASE64_CHARS.charAt(enc3) +
      BASE64_CHARS.charAt(enc4);
  }
  return output;
};

const buildSecurityHeader = (username, password) => {
  if (!password) return '';
  const safeUser = escapeXml(username || '');
  const safePass = escapeXml(password);
  return `
    <wsse:Security xmlns:wsse="${WSSE_NS}">
      <wsse:UsernameToken>
        <wsse:Username>${safeUser}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${safePass}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  `;
};

const buildSoapEnvelope = (body, securityHeader) => {
  const headerBlock = securityHeader ? `<s:Header>${securityHeader}</s:Header>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="${SOAP_ENV_NS}">
  ${headerBlock}
  <s:Body>${body}</s:Body>
</s:Envelope>`;
};

const buildAuthHeader = (username, password) => {
  if (!username && !password) return null;
  const token = encodeBase64(`${username || ''}:${password || ''}`);
  return `Basic ${token}`;
};

const buildGetCapabilitiesBody = () => `
  <tds:GetCapabilities xmlns:tds="${DEVICE_NS}">
    <tds:Category>All</tds:Category>
  </tds:GetCapabilities>
`;

const buildGetProfilesBody = () => `
  <trt:GetProfiles xmlns:trt="${MEDIA_NS}" />
`;

const buildGetStreamUriBody = (profileToken) => `
  <trt:GetStreamUri xmlns:trt="${MEDIA_NS}">
    <trt:StreamSetup>
      <tt:Stream xmlns:tt="${SCHEMA_NS}">RTP-Unicast</tt:Stream>
      <tt:Transport xmlns:tt="${SCHEMA_NS}">
        <tt:Protocol>RTSP</tt:Protocol>
      </tt:Transport>
    </trt:StreamSetup>
    <trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken>
  </trt:GetStreamUri>
`;

const fetchSoap = async (
  url,
  body,
  { username, password, timeoutMs = DEFAULT_TIMEOUT_MS, action } = {}
) => {
  if (!url) {
    throw new Error('Missing ONVIF URL.');
  }
  const securityHeader = buildSecurityHeader(username, password);
  const envelope = buildSoapEnvelope(body, securityHeader);
  const headers = {
    'Content-Type': action
      ? `application/soap+xml; charset=utf-8; action="${action}"`
      : 'application/soap+xml; charset=utf-8',
  };
  const authHeader = buildAuthHeader(username, password);
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: envelope,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`ONVIF HTTP ${response.status}`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
};

const extractTagValue = (xml, tagName) => {
  if (!xml) return null;
  const patterns = [
    new RegExp(`<\\w*:${tagName}[^>]*>([^<]+)</\\w*:${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>([^<]+)</${tagName}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return null;
};

const extractMediaXaddr = (xml) => {
  if (!xml) return null;
  const mediaBlockMatch = xml.match(
    /<\w*:Media[^>]*>([\s\S]*?)<\/\w*:Media>/i
  );
  if (mediaBlockMatch) {
    const xaddr = extractTagValue(mediaBlockMatch[1], 'XAddr');
    if (xaddr) return xaddr;
  }
  const allMatches = xml.match(
    /<\w*:XAddr[^>]*>([^<]+)<\/\w*:XAddr>/gi
  );
  if (!allMatches) return null;
  const candidates = allMatches
    .map((entry) => extractTagValue(entry, 'XAddr'))
    .filter(Boolean);
  const mediaCandidate = candidates.find((value) =>
    value.toLowerCase().includes('media')
  );
  return mediaCandidate || candidates[0] || null;
};

const extractProfileToken = (xml) => {
  if (!xml) return null;
  const patterns = [
    /<\w*:Profiles[^>]*token="([^"]+)"/i,
    /<Profiles[^>]*token="([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return null;
};

const ensureRtspCredentials = (uri, username, password) => {
  if (!uri || !password) return uri;
  if (!uri.startsWith('rtsp://')) return uri;
  const remainder = uri.slice('rtsp://'.length);
  if (remainder.includes('@')) return uri;
  const safeUser = encodeURIComponent(username || '');
  const safePass = encodeURIComponent(password);
  const creds = username ? `${safeUser}:${safePass}` : `:${safePass}`;
  return `rtsp://${creds}@${remainder}`;
};

const buildDefaultDeviceServiceUrl = (ip) => {
  if (!ip) return null;
  return `http://${ip}:80/onvif/device_service`;
};

const pickDeviceServiceUrl = ({ ip, xaddrs } = {}) => {
  if (Array.isArray(xaddrs)) {
    const httpAddr = xaddrs.find((value) => value?.startsWith('http'));
    if (httpAddr) return httpAddr;
  }
  return buildDefaultDeviceServiceUrl(ip);
};

const buildFallbackMediaUrl = (deviceServiceUrl) => {
  if (!deviceServiceUrl) return null;
  const trimmed = deviceServiceUrl.replace(/\/+$/, '');
  if (/device_service$/i.test(trimmed)) {
    return trimmed.replace(/device_service$/i, 'media');
  }
  return `${trimmed}/media`;
};

export const resolveOnvifRtspUrl = async ({
  ip,
  xaddrs,
  username,
  password,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
  const deviceServiceUrl = pickDeviceServiceUrl({ ip, xaddrs });
  if (!deviceServiceUrl) {
    throw new Error('Missing device service URL.');
  }

  const capabilitiesXml = await fetchSoap(deviceServiceUrl, buildGetCapabilitiesBody(), {
    username,
    password,
    timeoutMs,
    action: `${DEVICE_NS}/GetCapabilities`,
  });
  const mediaXaddr =
    extractMediaXaddr(capabilitiesXml) || buildFallbackMediaUrl(deviceServiceUrl);
  if (!mediaXaddr) {
    throw new Error('Media service not found.');
  }

  const profilesXml = await fetchSoap(mediaXaddr, buildGetProfilesBody(), {
    username,
    password,
    timeoutMs,
    action: `${MEDIA_NS}/GetProfiles`,
  });
  const profileToken = extractProfileToken(profilesXml);
  if (!profileToken) {
    throw new Error('No profiles found.');
  }

  const streamXml = await fetchSoap(mediaXaddr, buildGetStreamUriBody(profileToken), {
    username,
    password,
    timeoutMs,
    action: `${MEDIA_NS}/GetStreamUri`,
  });
  const streamUri = extractTagValue(streamXml, 'Uri');
  if (!streamUri) {
    throw new Error('Stream URI not found.');
  }

  return ensureRtspCredentials(streamUri, username, password);
};

export const buildRtspUrlFromPath = ({
  ip,
  path,
  username,
  password,
  port = 554,
} = {}) => {
  if (!ip || !path) return null;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const safeUser = username ? encodeURIComponent(username) : '';
  const safePass = password ? encodeURIComponent(password) : '';
  const creds =
    password && username
      ? `${safeUser}:${safePass}@`
      : password && !username
        ? `:${safePass}@`
        : '';
  return `rtsp://${creds}${ip}:${port}${normalizedPath}`;
};

export const normalizeManualRtspInput = ({
  input,
  ip,
  username,
  password,
} = {}) => {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('rtsp://')) {
    return ensureRtspCredentials(trimmed, username, password);
  }
  const hostMatch = trimmed.match(
    /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(\/.*)?$/
  );
  if (hostMatch) {
    const [hostPart, pathPart] = trimmed.split('/', 2);
    const remainder = pathPart ? `/${trimmed.split('/').slice(1).join('/')}` : '';
    const safeUser = username ? encodeURIComponent(username) : '';
    const safePass = password ? encodeURIComponent(password) : '';
    const creds =
      password && username
        ? `${safeUser}:${safePass}@`
        : password && !username
          ? `:${safePass}@`
          : '';
    return `rtsp://${creds}${hostPart}${remainder}`;
  }
  return buildRtspUrlFromPath({
    ip,
    path: trimmed,
    username,
    password,
  });
};
