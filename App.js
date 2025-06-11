import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, StyleSheet, Alert } from 'react-native';
// Importa nosso componente customizado
import CustomActivityIndicator from './components/CustomActivityIndicator';
import AppNavigator from './navigation/AppNavigator';

const APP_LAUNCHED_KEY = 'appAlreadyLaunched';

export default function App() {
  const [isFirstLaunch, setIsFirstLaunch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkIfFirstLaunch = async () => {
      try {
        const alreadyLaunched = await AsyncStorage.getItem(APP_LAUNCHED_KEY);
        setIsFirstLaunch(alreadyLaunched === null);
      } catch (error) {
        console.error("Erro ao verificar primeiro lançamento:", error);
        setIsFirstLaunch(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkIfFirstLaunch();
  }, []);

  const handleOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem(APP_LAUNCHED_KEY, 'true');
      setIsFirstLaunch(false); 
    } catch (error) {
      console.error("Erro ao salvar 'appAlreadyLaunched':", error);
      setIsFirstLaunch(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <CustomActivityIndicator 
          size="large"
          color="#007AFF" 
        />
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
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', 
  },
});