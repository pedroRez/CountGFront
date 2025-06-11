// navigation/AppNavigator.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
// --- MUDANÇA IMPORTANTE AQUI ---
// Importamos createNativeStackNavigator em vez de createStackNavigator
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Importe todas as suas telas
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
import CameraTestScreen from '../screens/CameraTestScreen';

// --- MUDANÇA IMPORTANTE AQUI ---
// Criamos o Stack usando o createNativeStackNavigator
const Stack = createNativeStackNavigator();

export default function AppNavigator({ isFirstLaunch, onOnboardingComplete }) {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isFirstLaunch ? (
          // Se for o primeiro lançamento
          <Stack.Screen
            name="OnboardingInitial"
            options={{ headerShown: false }}
          >
            {props => (
              <OnboardingScreen
                {...props}
                onComplete={onOnboardingComplete}
                isInitial={true}
              />
            )}
          </Stack.Screen>
        ) : (
          // Telas principais do aplicativo
          <React.Fragment>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'KYO DAY GadoCount' }}
            />
             <Stack.Screen
              name="RecordVideo"
              component={RecordVideoScreen}
              options={{ headerShown: false }} // Tela cheia para a câmera
            />
            <Stack.Screen
              name="ResultsScreen"
              component={ResultsScreen}
              options={{ title: 'Resultados da Análise' }}
            />
            <Stack.Screen
              name="OnboardingTutorial"
              component={OnboardingScreen}
              options={{ title: 'Guia de Filmagem' }}
            />
            <Stack.Screen 
              name="CameraTest" 
              component={CameraTestScreen} 
              options={{ title: 'Teste de Câmera' }} 
            />
          </React.Fragment>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}