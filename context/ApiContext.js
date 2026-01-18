import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

// Read the default URL from the .env file
const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://pedrorezp3-countg.hf.space/';
const STORAGE_KEY = '@api_settings';
const normalizeUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
};
const normalizeUrlList = (values) => {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const normalized = [];
  values.forEach((item) => {
    const url = normalizeUrl(item);
    if (!url || seen.has(url)) return;
    seen.add(url);
    normalized.push(url);
  });
  return normalized;
};

// Create the context
export const ApiContext = createContext();

// Create the context provider that manages state
export const ApiProvider = ({ children }) => {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [isCustomUrlEnabled, setIsCustomUrlEnabled] = useState(false);
  const [customUrls, setCustomUrls] = useState([]);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  // Load saved settings when the app starts
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedSettings !== null) {
          const parsed = JSON.parse(savedSettings);
          const legacyUrl = parsed?.customUrl;
          const urls = normalizeUrlList(parsed?.customUrls || []);
          const mergedUrls = legacyUrl
            ? normalizeUrlList([legacyUrl, ...urls])
            : urls;
          const enabled = Boolean(parsed?.enabled) && mergedUrls.length > 0;
          setCustomUrls(mergedUrls);
          setIsCustomUrlEnabled(enabled);
          setApiUrl(enabled ? mergedUrls[0] : DEFAULT_API_URL);
        }
      } catch (e) {
        console.error('Failed to load API settings:', e);
        setApiUrl(DEFAULT_API_URL);
      } finally {
        setIsSettingsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const saveSettings = async (settings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save API settings:', e);
    }
  };

  const applySettings = (nextUrls, enabled) => {
    const normalizedUrls = normalizeUrlList(nextUrls);
    const shouldEnable = Boolean(enabled) && normalizedUrls.length > 0;
    setCustomUrls(normalizedUrls);
    setIsCustomUrlEnabled(shouldEnable);
    setApiUrl(shouldEnable ? normalizedUrls[0] : DEFAULT_API_URL);
    saveSettings({ customUrls: normalizedUrls, enabled: shouldEnable });
  };

  const updateApiUrl = (newUrl) => {
    const normalized = normalizeUrl(newUrl);
    if (!normalized) return;
    const nextUrls = [normalized, ...customUrls.filter((item) => item !== normalized)];
    applySettings(nextUrls, isCustomUrlEnabled);
  };

  const updateIsCustomUrlEnabled = (enabled) => {
    applySettings(customUrls, enabled);
  };

  const addCustomServer = (newUrl) => {
    const normalized = normalizeUrl(newUrl);
    if (!normalized) return false;
    const nextUrls = [normalized, ...customUrls.filter((item) => item !== normalized)];
    applySettings(nextUrls, isCustomUrlEnabled);
    return true;
  };

  const removeCustomServer = (indexToRemove) => {
    const nextUrls = customUrls.filter((_, index) => index !== indexToRemove);
    applySettings(nextUrls, isCustomUrlEnabled);
  };

  const value = {
    apiUrl,
    setApiUrl: updateApiUrl,
    isCustomUrlEnabled,
    setIsCustomUrlEnabled: updateIsCustomUrlEnabled,
    customUrls,
    addCustomServer,
    removeCustomServer,
    isLoading: isSettingsLoading,
    DEFAULT_API_URL,
  };

  // Show a loader while the API settings are loaded from AsyncStorage
  if (isSettingsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

// Custom hook to simplify context usage
export const useApi = () => useContext(ApiContext);

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
