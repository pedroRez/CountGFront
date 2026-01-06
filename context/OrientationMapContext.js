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
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  const fallbackMap = useMemo(
    () => FALLBACK_ORIENTATION_MAPS[language] || FALLBACK_ORIENTATION_MAPS.pt,
    [language]
  );

  useEffect(() => {
    if (isFallback) {
      setOrientationMap(fallbackMap);
    }
  }, [fallbackMap, isFallback]);

  const fetchOrientationMap = useCallback(async () => {
    if (orientationMap || isLoading) return;
    setIsLoading(true);

    if (!apiUrl) {
      setOrientationMap(fallbackMap);
      setIsFallback(true);
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${apiUrl}/orientation-map`);
      if (response?.data && typeof response.data === 'object') {
        setOrientationMap(response.data);
        setIsFallback(false);
      } else {
        setOrientationMap(fallbackMap);
        setIsFallback(true);
      }
    } catch (error) {
      console.warn('Failed to load orientation map, using fallback.', error);
      setOrientationMap(fallbackMap);
      setIsFallback(true);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, orientationMap, isLoading, fallbackMap]);

  return (
    <OrientationMapContext.Provider
      value={{ orientationMap, fetchOrientationMap, isLoading }}
    >
      {children}
    </OrientationMapContext.Provider>
  );
};

export const useOrientationMap = () => useContext(OrientationMapContext);
