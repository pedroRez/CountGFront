import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'countg.db';
const dbPromise = SQLite.openDatabaseAsync(DB_NAME);

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    local_video_uri TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    duration_ms INTEGER,
    source TEXT,
    camera_ip TEXT,
    camera_name TEXT,
    camera_model TEXT,
    camera_manufacturer TEXT,
    rtsp_url TEXT,
    settings_orientation TEXT,
    settings_trim_start_ms INTEGER,
    settings_trim_end_ms INTEGER,
    settings_line_position_ratio REAL,
    settings_model_choice TEXT,
    settings_count_name TEXT,
    settings_count_description TEXT,
    last_total_count INTEGER,
    last_processed_video_url TEXT,
    last_processed_local_video_uri TEXT
  );
`;

const stripFileScheme = (value) =>
  typeof value === 'string' && value.startsWith('file://')
    ? value.replace('file://', '')
    : value;

const ensureFileUri = (value) => {
  if (!value || typeof value !== 'string') return value;
  if (value.startsWith('file://')) return value;
  if (value.startsWith('/')) return `file://${value}`;
  return `file:///${value}`;
};

const buildUriCandidates = (uri) => {
  if (!uri || typeof uri !== 'string') return [];
  return Array.from(
    new Set([uri, stripFileScheme(uri), ensureFileUri(uri)].filter(Boolean))
  );
};

const toNullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const RecordingsContext = createContext({
  recordings: [],
  isLoading: false,
  addRecording: async () => null,
  refreshRecordings: async () => [],
  updateRecordingProcessing: async () => false,
});

export const RecordingsProvider = ({ children }) => {
  const [recordings, setRecordings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const initDb = useCallback(async () => {
    const db = await dbPromise;
    await db.execAsync(CREATE_TABLE_SQL);
    return db;
  }, []);

  const refreshRecordings = useCallback(async () => {
    const db = await initDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM recordings ORDER BY created_at DESC, id DESC'
    );
    setRecordings(rows);
    return rows;
  }, [initDb]);

  const addRecording = useCallback(
    async (record) => {
      const localVideoUri =
        typeof record?.localVideoUri === 'string' ? record.localVideoUri : null;
      if (!localVideoUri) return null;
      const nowIso = new Date().toISOString();
      const result = await (
        await initDb()
      ).runAsync(
        `INSERT INTO recordings (
          name,
          created_at,
          updated_at,
          local_video_uri,
          file_name,
          mime_type,
          duration_ms,
          source,
          camera_ip,
          camera_name,
          camera_model,
          camera_manufacturer,
          rtsp_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record?.name || null,
          record?.createdAt || nowIso,
          nowIso,
          localVideoUri,
          record?.fileName || null,
          record?.mimeType || null,
          toNullableNumber(record?.durationMs),
          record?.source || null,
          record?.cameraIp || null,
          record?.cameraName || null,
          record?.cameraModel || null,
          record?.cameraManufacturer || null,
          record?.rtspUrl || null,
        ]
      );
      await refreshRecordings();
      return result?.lastInsertRowId ?? null;
    },
    [initDb, refreshRecordings]
  );

  const resolveRecordingIdByUri = useCallback(
    async (videoUri) => {
      const db = await initDb();
      const candidates = buildUriCandidates(videoUri);
      for (const candidate of candidates) {
        const rows = await db.getAllAsync(
          'SELECT id FROM recordings WHERE local_video_uri = ? ORDER BY id DESC LIMIT 1',
          [candidate]
        );
        const id = rows?.[0]?.id;
        if (Number.isFinite(Number(id))) {
          return Number(id);
        }
      }
      return null;
    },
    [initDb]
  );

  const updateRecordingProcessing = useCallback(
    async (recordingId, payload = {}) => {
      const explicitId = toNullableNumber(recordingId);
      const resolvedId =
        explicitId ||
        (await resolveRecordingIdByUri(payload.localVideoUri || null));
      if (!resolvedId) return false;

      const nowIso = new Date().toISOString();
      const db = await initDb();
      await db.runAsync(
        `UPDATE recordings SET
          updated_at = ?,
          settings_orientation = ?,
          settings_trim_start_ms = ?,
          settings_trim_end_ms = ?,
          settings_line_position_ratio = ?,
          settings_model_choice = ?,
          settings_count_name = ?,
          settings_count_description = ?,
          last_total_count = ?,
          last_processed_video_url = ?,
          last_processed_local_video_uri = ?
        WHERE id = ?`,
        [
          nowIso,
          payload?.orientation || null,
          toNullableNumber(payload?.trimStartMs),
          toNullableNumber(payload?.trimEndMs),
          toNullableNumber(payload?.linePositionRatio),
          payload?.modelChoice || null,
          payload?.countName || null,
          payload?.countDescription || null,
          toNullableNumber(payload?.totalCount),
          payload?.processedVideoUrl || null,
          payload?.processedLocalVideoUri || null,
          resolvedId,
        ]
      );
      await refreshRecordings();
      return true;
    },
    [initDb, refreshRecordings, resolveRecordingIdByUri]
  );

  useEffect(() => {
    refreshRecordings().finally(() => setIsLoading(false));
  }, [refreshRecordings]);

  const value = useMemo(
    () => ({
      recordings,
      isLoading,
      addRecording,
      refreshRecordings,
      updateRecordingProcessing,
    }),
    [
      recordings,
      isLoading,
      addRecording,
      refreshRecordings,
      updateRecordingProcessing,
    ]
  );

  return (
    <RecordingsContext.Provider value={value}>
      {children}
    </RecordingsContext.Provider>
  );
};

export const useRecordings = () => useContext(RecordingsContext);
