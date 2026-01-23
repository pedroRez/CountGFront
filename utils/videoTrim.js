import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { trim } from 'react-native-video-trim';

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

const ensurePlainPath = (uri) =>
  typeof uri === 'string' && uri.startsWith('file://')
    ? uri.replace('file://', '')
    : uri;

const ensureFileUri = (value) => {
  if (!value) return value;
  return value.startsWith('file://') ? value : `file://${value}`;
};

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
  if (!trim || typeof trim !== 'function') {
    throw new Error('TRIM_UNAVAILABLE');
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

  const localUri = await ensureLocalFileUri(sourceUri, fileName);
  const inputPath = ensurePlainPath(localUri);
  const extension = inferExtension(fileName || localUri);
  const baseName = sanitizeBaseName(fileName || SAFE_NAME_FALLBACK);

  let result;
  try {
    result = await trim(inputPath, {
      startTime: Math.round(trimStartMs),
      endTime: Math.round(trimEndMs),
    });
  } catch (error) {
    throw new Error(error?.message || 'Trim failed.');
  }

  const outputPath =
    result?.outputPath ||
    result?.output ||
    (typeof result === 'string' ? result : null);
  if (!outputPath) {
    throw new Error('Trim output not found.');
  }

  await ensureTrimDir();
  let outputUri = ensureFileUri(outputPath);
  if (TRIM_DIR && !outputUri.startsWith(TRIM_DIR)) {
    const targetUri = `${TRIM_DIR}${baseName}_${Date.now()}.${extension}`;
    await FileSystem.copyAsync({ from: outputUri, to: targetUri });
    await FileSystem.deleteAsync(outputUri, { idempotent: true });
    outputUri = targetUri;
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
