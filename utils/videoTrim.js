import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

const TRIM_DIR = `${FileSystem.cacheDirectory}trimmed/`;
const DEFAULT_EXTENSION = 'mp4';
const SAFE_NAME_FALLBACK = 'video';

const ensureTrimDir = async () => {
  if (!FileSystem.cacheDirectory) return;
  try {
    await FileSystem.makeDirectoryAsync(TRIM_DIR, { intermediates: true });
  } catch (error) {
    // Directory already exists or is not accessible.
  }
};

const sanitizeBaseName = (value) => {
  if (!value) return SAFE_NAME_FALLBACK;
  const base = value.replace(/\.[^/.]+$/, '');
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || SAFE_NAME_FALLBACK;
};

const inferExtension = (value) => {
  if (!value) return DEFAULT_EXTENSION;
  const parts = value.split('.');
  if (parts.length < 2) return DEFAULT_EXTENSION;
  const ext = parts.pop().toLowerCase();
  if (!ext || ext.length > 5) return DEFAULT_EXTENSION;
  return ext;
};

const normalizePath = (uri) =>
  typeof uri === 'string' && uri.startsWith('file://')
    ? uri.replace('file://', '')
    : uri;

const quotePath = (value) => `"${String(value).replace(/"/g, '\\"')}"`;

const toSeconds = (ms) => (ms / 1000).toFixed(3);

const ensureLocalFileUri = async (uri, fallbackName) => {
  if (!uri) return null;
  if (uri.startsWith('file://')) return uri;
  if (Platform.OS === 'android' && uri.startsWith('content://')) {
    await ensureTrimDir();
    const extension = inferExtension(fallbackName || uri);
    const targetUri = `${TRIM_DIR}${sanitizeBaseName(
      fallbackName
    )}_${Date.now()}.${extension}`;
    await FileSystem.copyAsync({ from: uri, to: targetUri });
    return targetUri;
  }
  return uri;
};

export const trimVideoToRange = async ({
  sourceUri,
  trimStartMs,
  trimEndMs,
  fileName,
}) => {
  if (
    !FFmpegKit ||
    typeof FFmpegKit.execute !== 'function' ||
    !ReturnCode ||
    typeof ReturnCode.isSuccess !== 'function'
  ) {
    throw new Error('FFMPEG_UNAVAILABLE');
  }
  if (!sourceUri) {
    throw new Error('Missing source uri.');
  }
  if (!Number.isFinite(trimStartMs) || !Number.isFinite(trimEndMs)) {
    throw new Error('Missing trim range.');
  }
  if (trimEndMs <= trimStartMs) {
    throw new Error('Invalid trim range.');
  }

  await ensureTrimDir();
  const localUri = await ensureLocalFileUri(sourceUri, fileName);
  const extension = inferExtension(fileName || localUri);
  const baseName = sanitizeBaseName(fileName || SAFE_NAME_FALLBACK);
  const outputUri = `${TRIM_DIR}${baseName}_${Date.now()}.${extension}`;
  const inputPath = normalizePath(localUri);
  const outputPath = normalizePath(outputUri);
  const startSeconds = toSeconds(trimStartMs);
  const durationSeconds = toSeconds(trimEndMs - trimStartMs);

  const command = [
    '-ss',
    startSeconds,
    '-i',
    quotePath(inputPath),
    '-t',
    durationSeconds,
    '-c',
    'copy',
    quotePath(outputPath),
  ].join(' ');

  const session = await FFmpegKit.execute(command);
  const returnCode = await session.getReturnCode();
  if (!ReturnCode.isSuccess(returnCode)) {
    const rcValue =
      typeof returnCode?.getValue === 'function'
        ? returnCode.getValue()
        : String(returnCode);
    throw new Error(`Trim failed (rc=${rcValue}).`);
  }

  const info = await FileSystem.getInfoAsync(outputUri, { size: true });
  if (!info?.exists) {
    throw new Error('Trim output not found.');
  }

  return {
    uri: outputUri,
    fileName: outputUri.split('/').pop(),
    mimeType: extension === 'mov' ? 'video/quicktime' : 'video/mp4',
  };
};
