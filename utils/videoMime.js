const VIDEO_MIME_BY_EXTENSION = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  '3gp': 'video/3gpp',
};

const VIDEO_EXTENSION_BY_MIME = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/mp2t': 'ts',
  'video/3gpp': '3gp',
};

export const resolveVideoMimeType = (uri, fallback = 'video/mp4') => {
  const extension = String(uri || '')
    .split('?')[0]
    .split('.')
    .pop()
    ?.toLowerCase();

  if (extension && VIDEO_MIME_BY_EXTENSION[extension]) {
    return VIDEO_MIME_BY_EXTENSION[extension];
  }

  return fallback;
};

export const resolveVideoExtensionFromMimeType = (
  mimeType,
  fallback = null
) => {
  const normalized = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (normalized && VIDEO_EXTENSION_BY_MIME[normalized]) {
    return VIDEO_EXTENSION_BY_MIME[normalized];
  }
  return fallback;
};
