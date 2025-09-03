import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

// Read the default URL from the .env file
const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://pedrorezp3-countg.hf.space/';
const STORAGE_KEY = '@api_settings';

// Create the context
export const ApiContext = createContext();

// Create the context provider that manages state
export const ApiProvider = ({ children }) => {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [isCustomUrlEnabled, setIsCustomUrlEnabled] = useState(false);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  // Load saved settings when the app starts
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedSettings !== null) {
          const { customUrl, enabled } = JSON.parse(savedSettings);
          setIsCustomUrlEnabled(enabled);
          setApiUrl(enabled && customUrl ? customUrl : DEFAULT_API_URL);
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

  const updateApiUrl = (newUrl) => {
    setApiUrl(newUrl);
    // Save the current configuration
    saveSettings({ customUrl: newUrl, enabled: isCustomUrlEnabled });
  };

  const updateIsCustomUrlEnabled = (enabled, currentCustomUrl) => {
    setIsCustomUrlEnabled(enabled);
    const newUrl =
      enabled && currentCustomUrl ? currentCustomUrl : DEFAULT_API_URL;
    setApiUrl(newUrl);
    saveSettings({ customUrl: currentCustomUrl, enabled: enabled });
  };

  const value = {
    apiUrl,
    setApiUrl: updateApiUrl,
    isCustomUrlEnabled,
    setIsCustomUrlEnabled: updateIsCustomUrlEnabled,
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
