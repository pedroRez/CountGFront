import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Importe todas as suas telas
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
import CameraTestScreen from '../screens/CameraTestScreen';

const Stack = createStackNavigator();

export default function AppNavigator({ isFirstLaunch, onOnboardingComplete }) {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isFirstLaunch ? (
          // Se for o PRIMEIRO LANÇAMENTO:
          <Stack.Screen
            name="OnboardingInitial"
            options={{ headerShown: false }}
          >
            {/* CORREÇÃO: Removidos os colchetes desnecessários ao redor da função */}
            {props => (
              <OnboardingScreen
                {...props}
                onComplete={onOnboardingComplete}
                isInitial={true}
              />
            )}
          </Stack.Screen>
        ) : (
          // Se NÃO for o primeiro lançamento, renderiza as telas principais
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