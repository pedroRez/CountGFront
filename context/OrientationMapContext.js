import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';
import { useApi } from './ApiContext';

const OrientationMapContext = createContext();

export const OrientationMapProvider = ({ children }) => {
  const { apiUrl } = useApi();
  const [orientationMap, setOrientationMap] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOrientationMap = useCallback(async () => {
    if (orientationMap || isLoading) return;
    setIsLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/orientation-map`);
      setOrientationMap(response.data);
    } catch (error) {
      console.error('Failed to load orientation map:', error);
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
