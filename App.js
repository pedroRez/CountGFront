import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
// A importação agora inclui 'AppState'
import { View, StyleSheet, Alert, Platform, AppState } from 'react-native'; 
import axios from 'axios';
import AppNavigator from './navigation/AppNavigator';
import CustomActivityIndicator from './components/CustomActivityIndicator';

const APP_LAUNCHED_KEY = 'appAlreadyLaunched';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function App() {
  const [isFirstLaunch, setIsFirstLaunch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  // Função para "acordar" o servidor
  const wakeUpServer = async () => {
    console.log("App.js: Enviando requisição 'wake-up' para o servidor...");
    try {
      await axios.get(API_BASE_URL, { timeout: 25000 });
      console.log("App.js: Servidor respondeu ao 'wake-up call'.");
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.warn("App.js: 'Wake-up call' para o servidor demorou a responder (timeout).");
      } else {
        console.error("App.js: Erro no 'wake-up call':", error.message);
      }
    }
  };

  useEffect(() => {
    // Verifica se é o primeiro lançamento
    const checkIfFirstLaunch = async () => {
      try {
        const alreadyLaunched = await AsyncStorage.getItem(APP_LAUNCHED_KEY);
        setIsFirstLaunch(alreadyLaunched === null);
      } catch (error) {
        console.error("Erro ao verificar o estado do primeiro lançamento:", error);
        setIsFirstLaunch(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkIfFirstLaunch();
    
    // Lógica para o 'wake-up call'
    wakeUpServer(); // Chama na primeira vez que o app carrega
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App.js: App voltou para o estado ativo.');
        wakeUpServer(); // Chama novamente quando o app volta do segundo plano
      }
      appState.current = nextAppState;
    });

    // Função de limpeza
    return () => {
      subscription.remove();
    };
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

// Sua função de reset para desenvolvimento
export const developerResetFirstLaunch = async () => {
  try {
    await AsyncStorage.removeItem(APP_LAUNCHED_KEY);
    Alert.alert(
      "Reset para Primeiro Lançamento",
      "O indicador foi limpo. Por favor, reinicie o aplicativo completamente.",
      [{ text: "OK" }]
    );
  } catch (e) {
    console.error("Erro ao limpar 'appAlreadyLaunched':", e);
    Alert.alert("Erro", "Não foi possível limpar o indicador.");
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