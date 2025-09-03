import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, StyleSheet, Alert, AppState } from 'react-native';
import axios from 'axios';
import AppNavigator from './navigation/AppNavigator';
import CustomActivityIndicator from './components/CustomActivityIndicator';
import { ApiProvider, useApi } from './context/ApiContext'; // Import our provider and hook

const APP_LAUNCHED_KEY = 'appAlreadyLaunched';

// This component now contains the main app logic
// and lives "inside" the ApiProvider, allowing it to use the useApi() hook
const AppContent = () => {
  const [isFirstLaunch, setIsFirstLaunch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  // Retrieve the API URL from our global context
  const { apiUrl } = useApi();

  // Function to "wake" the server, now using the context URL
  const wakeUpServer = async () => {
    if (!apiUrl) {
      console.log('App.js: No API URL defined, skipping wake-up call.');
      return;
    }
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
    }
  };

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

    // Logic for the wake-up call
    wakeUpServer();
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        wakeUpServer();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [apiUrl]); // Added apiUrl as a dependency to wake the server if the URL changes

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
    <ApiProvider>
      <AppContent />
    </ApiProvider>
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
