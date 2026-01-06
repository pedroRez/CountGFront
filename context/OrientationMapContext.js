import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';
import { useApi } from './ApiContext';

const OrientationMapContext = createContext();

const FALLBACK_ORIENTATION_MAP = {
  N: { label: 'Norte', arrow: '^' },
  E: { label: 'Leste', arrow: '>' },
  S: { label: 'Sul', arrow: 'v' },
  W: { label: 'Oeste', arrow: '<' },
};

export const OrientationMapProvider = ({ children }) => {
  const { apiUrl } = useApi();
  const [orientationMap, setOrientationMap] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOrientationMap = useCallback(async () => {
    if (orientationMap || isLoading) return;
    setIsLoading(true);

    if (!apiUrl) {
      setOrientationMap(FALLBACK_ORIENTATION_MAP);
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${apiUrl}/orientation-map`);
      if (response?.data && typeof response.data === 'object') {
        setOrientationMap(response.data);
      } else {
        setOrientationMap(FALLBACK_ORIENTATION_MAP);
      }
    } catch (error) {
      console.warn('Failed to load orientation map, using fallback.', error);
      setOrientationMap(FALLBACK_ORIENTATION_MAP);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, orientationMap, isLoading]);

  return (
    <OrientationMapContext.Provider
      value={{ orientationMap, fetchOrientationMap, isLoading }}
    >
      {children}
    </OrientationMapContext.Provider>
  );
};

export const useOrientationMap = () => useContext(OrientationMapContext);
