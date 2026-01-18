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
  CREATE TABLE IF NOT EXISTS counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    total_count INTEGER,
    processed_video_url TEXT,
    local_video_uri TEXT,
    saved_to_gallery INTEGER,
    original_video_name TEXT,
    orientation TEXT,
    trim_start_ms INTEGER,
    trim_end_ms INTEGER,
    line_position_ratio REAL,
    model_choice TEXT
  );
`;

const CountsContext = createContext({
  counts: [],
  isLoading: false,
  addCount: async () => null,
  refreshCounts: async () => [],
});

export const CountsProvider = ({ children }) => {
  const [counts, setCounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const initDb = useCallback(async () => {
    const db = await dbPromise;
    await db.execAsync(CREATE_TABLE_SQL);
    return db;
  }, []);

  const refreshCounts = useCallback(async () => {
    const db = await initDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM counts ORDER BY created_at DESC'
    );
    setCounts(rows);
    return rows;
  }, [initDb]);

  const addCount = useCallback(
    async (record) => {
      const db = await initDb();
      const result = await db.runAsync(
        `INSERT INTO counts (
          name,
          description,
          created_at,
          total_count,
          processed_video_url,
          local_video_uri,
          saved_to_gallery,
          original_video_name,
          orientation,
          trim_start_ms,
          trim_end_ms,
          line_position_ratio,
          model_choice
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.name,
          record.description || null,
          record.createdAt,
          Number.isFinite(record.totalCount) ? record.totalCount : null,
          record.processedVideoUrl || null,
          record.localVideoUri || null,
          record.savedToGallery ? 1 : 0,
          record.originalVideoName || null,
          record.orientation || null,
          Number.isFinite(record.trimStartMs) ? record.trimStartMs : null,
          Number.isFinite(record.trimEndMs) ? record.trimEndMs : null,
          Number.isFinite(record.linePositionRatio)
            ? record.linePositionRatio
            : null,
          record.modelChoice || null,
        ]
      );

      await refreshCounts();
      return result?.lastInsertRowId ?? null;
    },
    [initDb, refreshCounts]
  );

  useEffect(() => {
    refreshCounts().finally(() => setIsLoading(false));
  }, [refreshCounts]);

  const value = useMemo(
    () => ({ counts, isLoading, addCount, refreshCounts }),
    [counts, isLoading, addCount, refreshCounts]
  );

  return (
    <CountsContext.Provider value={value}>
      {children}
    </CountsContext.Provider>
  );
};

export const useCounts = () => useContext(CountsContext);
