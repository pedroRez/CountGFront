const VIDEO_MIME_BY_EXTENSION = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
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
