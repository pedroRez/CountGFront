import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, StyleSheet, Alert, AppState } from 'react-native';
import axios from 'axios';
import AppNavigator from './navigation/AppNavigator';
import CustomActivityIndicator from './components/CustomActivityIndicator';
import { ApiProvider, useApi } from './context/ApiContext'; // Importa nosso provedor e hook

const APP_LAUNCHED_KEY = 'appAlreadyLaunched';

// Este componente agora contém a lógica principal do seu app
// e está "dentro" do ApiProvider, então ele pode usar o hook useApi()
const AppContent = () => {
  const [isFirstLaunch, setIsFirstLaunch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  // Pega a URL da API do nosso contexto global
  const { apiUrl } = useApi();

  // Função para "acordar" o servidor, agora usando a URL do contexto
  const wakeUpServer = async () => {
    if (!apiUrl) {
      console.log(
        "App.js: Nenhuma URL de API definida, pulando 'wake-up call'."
      );
      return;
    }
    console.log(`App.js: Enviando requisição 'wake-up' para ${apiUrl}...`);
    try {
      await axios.get(apiUrl, { timeout: 25000 });
      console.log("App.js: Servidor respondeu ao 'wake-up call'.");
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.warn(
          "App.js: 'Wake-up call' para o servidor demorou a responder (timeout)."
        );
      } else {
        console.error("App.js: Erro no 'wake-up call':", error.message);
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

    // Lógica para o 'wake-up call'
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
  }, [apiUrl]); // Adicionado apiUrl como dependência para acordar o servidor se a URL mudar

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

// O componente principal App agora apenas fornece o contexto
export default function App() {
  return (
    <ApiProvider>
      <AppContent />
    </ApiProvider>
  );
}

/**
 * Reseta manualmente a flag de primeira execução do aplicativo.
 *
 * Função de **desenvolvimento** – não utilize em produção.
 * Remove `APP_LAUNCHED_KEY` do AsyncStorage e limpa configurações
 * de API salvas, permitindo que o app execute o onboarding novamente.
 */
export const developerResetFirstLaunch = async () => {
  try {
    await AsyncStorage.removeItem(APP_LAUNCHED_KEY);
    // Opcional: redefinir também as configurações da API
    await AsyncStorage.removeItem('@api_settings');
    console.log('developerResetFirstLaunch: APP_LAUNCHED_KEY removido.');
  } catch (error) {
    console.error('developerResetFirstLaunch: falha ao remover chave', error);
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
