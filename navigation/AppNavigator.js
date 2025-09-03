import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Remova a importação de TouchableOpacity e MaterialCommunityIcons daqui, pois agora estão no CustomHeader
// import { TouchableOpacity } from 'react-native';
// import { MaterialCommunityIcons } from '@expo/vector-icons';

import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
import CameraTestScreen from '../screens/CameraTestScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CustomHeader from '../components/CustomHeader'; // <<< Importa nosso novo cabeçalho

const Stack = createNativeStackNavigator();

export default function AppNavigator({ isFirstLaunch, onOnboardingComplete }) {
  return (
    <NavigationContainer>
      <Stack.Navigator
      // Removemos as screenOptions daqui, pois agora controlamos tudo no CustomHeader
      >
        {isFirstLaunch ? (
          <Stack.Screen
            name="OnboardingInitial"
            options={{ headerShown: false }}
          >
            {(props) => (
              <OnboardingScreen
                {...props}
                onComplete={onOnboardingComplete}
                isInitial={true}
              />
            )}
          </Stack.Screen>
        ) : (
          <React.Fragment>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              // --- CORREÇÃO PRINCIPAL AQUI ---
              // A propriedade 'header' substitui completamente o cabeçalho padrão
              options={{
                header: () => <CustomHeader title="KYO DAY GadoCount" />,
              }}
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
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Configurações' }}
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
