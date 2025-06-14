import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
import CameraTestScreen from '../screens/CameraTestScreen';
import SettingsScreen from '../screens/SettingsScreen';
const Stack = createNativeStackNavigator();

export default function AppNavigator({ isFirstLaunch, onOnboardingComplete }) {
  return (
    <NavigationContainer>
      {/* A MUDANÇA ESTÁ AQUI: Adicionamos opções padrão ao Navigator.
        'animation: "none"' desabilita as animações de transição entre telas.
        Se o ActivityIndicator problemático é parte da animação, isso pode resolver.
      */}
      <Stack.Navigator 
        screenOptions={{
          animation: 'none' 
        }}
      >
        {isFirstLaunch ? (
          <Stack.Screen name="OnboardingInitial" options={{ headerShown: false }}>
            {props => (
              <OnboardingScreen {...props} onComplete={onOnboardingComplete} isInitial={true} />
            )}
          </Stack.Screen>
        ) : (
          <React.Fragment>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'KYO DAY GadoCount' }}
            />
             <Stack.Screen
              name="RecordVideo"
              component={RecordVideoScreen}
              options={{ headerShown: false }}
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
            <Stack.Screen 
              name="Settings"
              component={SettingsScreen} 
              options={{ title: 'Configurações' }} 
            /> 
          </React.Fragment>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}