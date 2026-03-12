export const COMMON_RTSP_PATH_CANDIDATES = [
  '/onvif1',
  '/live/ch00_0',
  '/Streaming/Channels/101',
  '/h264Preview_01_main',
  '/cam/realmonitor?channel=1&subtype=0',
  '/live.sdp',
  '/stream1',
  '/',
];

export const buildRtspPathCandidates = (preferredPath = null) => {
  const preferred =
    typeof preferredPath === 'string' && preferredPath.trim().length
      ? preferredPath.trim()
      : null;
  return Array.from(
    new Set([
      ...(preferred ? [preferred] : []),
      ...COMMON_RTSP_PATH_CANDIDATES,
    ])
  );
};
