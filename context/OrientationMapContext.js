import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import axios from 'axios';
import { useApi } from './ApiContext';
import { useLanguage } from './LanguageContext';

const OrientationMapContext = createContext();

const FALLBACK_ORIENTATION_MAPS = {
  pt: {
    N: { label: 'Norte', arrow: '^' },
    E: { label: 'Leste', arrow: '>' },
    S: { label: 'Sul', arrow: 'v' },
    W: { label: 'Oeste', arrow: '<' },
  },
  en: {
    N: { label: 'North', arrow: '^' },
    E: { label: 'East', arrow: '>' },
    S: { label: 'South', arrow: 'v' },
    W: { label: 'West', arrow: '<' },
  },
};

export const OrientationMapProvider = ({ children }) => {
  const { apiUrl } = useApi();
  const { language } = useLanguage();
  const [orientationMap, setOrientationMap] = useState(null);
  const [remoteOrientationMap, setRemoteOrientationMap] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  const fallbackMap = useMemo(
    () => FALLBACK_ORIENTATION_MAPS[language] || FALLBACK_ORIENTATION_MAPS.pt,
    [language]
  );

  const mergeOrientationMap = useCallback((remoteMap, fallback) => {
    if (!remoteMap || typeof remoteMap !== 'object') return fallback;
    const keys = new Set([
      ...Object.keys(fallback || {}),
      ...Object.keys(remoteMap || {}),
    ]);
    const merged = {};
    keys.forEach((key) => {
      const remoteEntry = remoteMap?.[key] || {};
      const fallbackEntry = fallback?.[key] || {};
      merged[key] = {
        label: fallbackEntry.label || remoteEntry.label || key,
        arrow: remoteEntry.arrow || fallbackEntry.arrow || '',
      };
    });
    return merged;
  }, []);

  useEffect(() => {
    if (remoteOrientationMap) {
      setOrientationMap(mergeOrientationMap(remoteOrientationMap, fallbackMap));
      setIsFallback(false);
      return;
    }
    setOrientationMap(fallbackMap);
  }, [fallbackMap, mergeOrientationMap, remoteOrientationMap]);

  const fetchOrientationMap = useCallback(async () => {
    if (remoteOrientationMap || isLoading) return;
    setIsLoading(true);

    if (!apiUrl) {
      setRemoteOrientationMap(null);
      setIsFallback(true);
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${apiUrl}/orientation-map`);
      if (response?.data && typeof response.data === 'object') {
        setRemoteOrientationMap(response.data);
        setIsFallback(false);
      } else {
        setRemoteOrientationMap(null);
        setIsFallback(true);
      }
    } catch (error) {
      console.warn('Failed to load orientation map, using fallback.', error);
      setRemoteOrientationMap(null);
      setIsFallback(true);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, remoteOrientationMap, isLoading, fallbackMap]);

  return (
    <OrientationMapContext.Provider
      value={{ orientationMap, fetchOrientationMap, isLoading }}
    >
      {children}
    </OrientationMapContext.Provider>
  );
};

export const useOrientationMap = () => useContext(OrientationMapContext);
