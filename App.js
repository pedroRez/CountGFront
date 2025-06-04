import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import AppNavigator from './navigation/AppNavigator'; // Seu arquivo de navegação principal

// Chave para o AsyncStorage
const APP_LAUNCHED_KEY = 'appAlreadyLaunched';

export default function App() {
  const [isFirstLaunch, setIsFirstLaunch] = useState(null); // null: ainda verificando, true: primeiro lançamento, false: já lançado antes
  const [isLoading, setIsLoading] = useState(true); // Controla o estado de carregamento da verificação do AsyncStorage

  useEffect(() => {
    const checkIfFirstLaunch = async () => {
      try {
        const alreadyLaunched = await AsyncStorage.getItem(APP_LAUNCHED_KEY);
        if (alreadyLaunched === null) {
          // É o primeiro lançamento
          setIsFirstLaunch(true);
          // Não é necessário definir 'appAlreadyLaunched' como 'true' aqui,
          // isso será feito quando o onboarding for concluído.
        } else {
          // Já foi lançado antes
          setIsFirstLaunch(false);
        }
      } catch (error) {
        console.error("Erro ao verificar o estado do primeiro lançamento:", error);
        // Em caso de erro, assume que não é o primeiro lançamento para não bloquear o usuário.
        setIsFirstLaunch(false);
      } finally {
        // Terminou de verificar, para de carregar
        setIsLoading(false);
      }
    };

    checkIfFirstLaunch();
  }, []);

  const handleOnboardingComplete = async () => {
    console.log("App.js: handleOnboardingComplete INICIADO"); // LOG 1
    try {
      await AsyncStorage.setItem(APP_LAUNCHED_KEY, 'true');
      setIsFirstLaunch(false); // Esta mudança de estado é crucial
      console.log("App.js: AsyncStorage atualizado, isFirstLaunch definido como FALSE"); // LOG 2
    } catch (error) {
      console.error("App.js: Erro ao salvar 'appAlreadyLaunched':", error);
      setIsFirstLaunch(false);
    }
  };



  if (isLoading) {
    // Enquanto verifica o AsyncStorage, mostra um indicador de carregamento
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }
  console.log("App.js RENDER: isLoading:", isLoading, "isFirstLaunch:", isFirstLaunch); // LOG 3

  return (
    <>
      <StatusBar style="auto" />
      {/* O AppNavigator receberá isFirstLaunch e a função onOnboardingComplete.
        Ele usará isFirstLaunch para decidir qual tela mostrar primeiro (Onboarding ou Home).
        Ele passará onOnboardingComplete para OnboardingScreen.
      */}
      <AppNavigator
        isFirstLaunch={isFirstLaunch}
        onOnboardingComplete={handleOnboardingComplete}
      />
    </>
  );
}

export const developerResetFirstLaunch = async () => {
  try {
    await AsyncStorage.removeItem(APP_LAUNCHED_KEY);
    Alert.alert(
      "Reset para Primeiro Lançamento",
      "O indicador de primeiro lançamento foi limpo. Por favor, feche e reabra completamente o aplicativo para ver o tutorial.",
      [{ text: "OK" }]
    );
    // Para que a lógica em App.js (useEffect) seja reavaliada do zero,
    // um reinício completo do app (fechar e abrir de novo) é o mais garantido.
    // No Expo Go, você pode usar o menu de desenvolvedor para "Reload".
  } catch (e) {
    console.error("Erro ao limpar 'appAlreadyLaunched':", e);
    Alert.alert("Erro", "Não foi possível limpar o indicador de primeiro lançamento.");
  }
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9', // Ou sua cor de fundo de splash screen
  },
});