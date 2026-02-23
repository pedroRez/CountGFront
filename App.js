import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, StyleSheet, AppState, InteractionManager } from 'react-native';
import axios from 'axios';
import AppNavigator from './navigation/AppNavigator';
import CustomActivityIndicator from './components/CustomActivityIndicator';
import { ApiProvider, useApi } from './context/ApiContext';
import { OrientationMapProvider } from './context/OrientationMapContext';
import { LanguageProvider } from './context/LanguageContext';
import { CountsProvider } from './context/CountsContext';

const APP_LAUNCHED_KEY = 'appAlreadyLaunched';
const DEFAULT_WAKEUP_MIN_INTERVAL_MS = __DEV__ ? 30_000 : 5 * 60_000;
const DEFAULT_WAKEUP_ENABLED = true;

const parseBooleanEnv = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseNumberEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const WAKEUP_CONFIG = {
  enabled: parseBooleanEnv(
    process.env.EXPO_PUBLIC_WAKEUP_ENABLED,
    DEFAULT_WAKEUP_ENABLED
  ),
  minIntervalMs: parseNumberEnv(
    process.env.EXPO_PUBLIC_WAKEUP_MIN_INTERVAL_MS,
    DEFAULT_WAKEUP_MIN_INTERVAL_MS
  ),
};

// This component now contains the main app logic
// and lives "inside" the ApiProvider, allowing it to use the useApi() hook
const AppContent = () => {
  const [isFirstLaunch, setIsFirstLaunch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const lastWakeAtRef = useRef(0);
  const wakeInFlightRef = useRef(false);

  // Retrieve the API URL from our global context
  const { apiUrl } = useApi();

  // Function to "wake" the server, now using the context URL
  const wakeUpServer = useCallback(async () => {
    if (!WAKEUP_CONFIG.enabled) {
      console.log('App.js: Wake-up disabled by environment config.');
      return;
    }

    if (!apiUrl) {
      console.log('App.js: No API URL defined, skipping wake-up call.');
      return;
    }

    if (wakeInFlightRef.current) {
      console.log(
        'App.js: Wake-up already in-flight, skipping duplicate call.'
      );
      return;
    }

    const now = Date.now();
    if (now - lastWakeAtRef.current < WAKEUP_CONFIG.minIntervalMs) {
      console.log(
        `App.js: Wake-up skipped due to min interval (${WAKEUP_CONFIG.minIntervalMs}ms).`
      );
      return;
    }

    wakeInFlightRef.current = true;
    lastWakeAtRef.current = now;

    console.log(`App.js: Sending wake-up request to ${apiUrl}...`);
    try {
      await axios.get(apiUrl, { timeout: 25000 });
      console.log('App.js: Server responded to wake-up call.');
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.warn('App.js: Server wake-up call timed out.');
      } else {
        console.error('App.js: Error during wake-up call:', error.message);
      }
    } finally {
      wakeInFlightRef.current = false;
    }
  }, [apiUrl]);

  useEffect(() => {
    const checkIfFirstLaunch = async () => {
      try {
        const alreadyLaunched = await AsyncStorage.getItem(APP_LAUNCHED_KEY);
        setIsFirstLaunch(alreadyLaunched === null);
      } catch (error) {
        setIsFirstLaunch(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkIfFirstLaunch();
  }, []);

  useEffect(() => {
    if (isFirstLaunch === null) return;

    let interactionHandle = null;
    const scheduleWake = () => {
      if (isFirstLaunch) return;
      interactionHandle = InteractionManager.runAfterInteractions(() => {
        wakeUpServer();
      });
    };

    scheduleWake();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        scheduleWake();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (interactionHandle) {
        interactionHandle.cancel();
      }
    };
  }, [isFirstLaunch, wakeUpServer]);

  const handleOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem(APP_LAUNCHED_KEY, 'true');
      setIsFirstLaunch(false);
    } catch (error) {
      console.error("Error saving 'appAlreadyLaunched':", error);
      setIsFirstLaunch(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <CustomActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <AppNavigator
        isFirstLaunch={isFirstLaunch}
        onOnboardingComplete={handleOnboardingComplete}
      />
    </>
  );
};

// The main App component now simply provides the context
export default function App() {
  return (
    <LanguageProvider>
      <ApiProvider>
        <CountsProvider>
          <OrientationMapProvider>
            <AppContent />
          </OrientationMapProvider>
        </CountsProvider>
      </ApiProvider>
    </LanguageProvider>
  );
}

/**
 * Manually resets the first-run flag for the application.
 *
 * **Development function** – do not use in production.
 * Removes `APP_LAUNCHED_KEY` from AsyncStorage and clears saved API
 * settings so the app can run onboarding again.
 */
export const developerResetFirstLaunch = async () => {
  try {
    await AsyncStorage.removeItem(APP_LAUNCHED_KEY);
    // Optional: also reset API settings
    await AsyncStorage.removeItem('@api_settings');
    console.log('developerResetFirstLaunch: APP_LAUNCHED_KEY removed.');
  } catch (error) {
    console.error('developerResetFirstLaunch: failed to remove key', error);
  }
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
