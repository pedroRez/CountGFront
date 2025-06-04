import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Importe suas telas
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
// Certifique-se de que os caminhos de importação acima estão corretos
// para a localização dos seus arquivos de tela.

const Stack = createStackNavigator();

const AppNavigator = ({ isFirstLaunch, onOnboardingComplete }) => {
  /*
    Este componente recebe 'isFirstLaunch' e 'onOnboardingComplete' do App.js.
    - 'isFirstLaunch' (boolean): Determina se é o primeiro lançamento do app.
    - 'onOnboardingComplete' (função): Função a ser chamada quando o onboarding inicial é concluído.
                                      Esta função (definida no App.js) é responsável por
                                      atualizar o AsyncStorage e o estado 'isFirstLaunch' no App.js.
  */

  // console.log("AppNavigator Render - isFirstLaunch:", isFirstLaunch); // Para debug

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isFirstLaunch ? (
          // Se for o PRIMEIRO LANÇAMENTO, a única tela na stack de navegação é a de Onboarding.
          // O nome da rota é "OnboardingInitial".
          <Stack.Screen
            name="OnboardingInitial"
            options={{ headerShown: false }} // Geralmente não queremos cabeçalho na tela de onboarding inicial
          >
            {
              // Usamos uma função render prop para passar props customizadas para OnboardingScreen
              props => (
                <OnboardingScreen
                  {...props} // Passa as props de navegação padrão (navigation, route)
                  onComplete={onOnboardingComplete} // Passa a callback de App.js
                  isInitial={true} // Indica para OnboardingScreen que este é o fluxo inicial
                />
              )
            }
          </Stack.Screen>
        ) : (
          // Se NÃO for o primeiro lançamento, estas são as telas principais do aplicativo.
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'Contador de Gado IA' }} // Título da tela Home
            />
            <Stack.Screen
              name="ResultsScreen"
              component={ResultsScreen}
              options={{ title: 'Resultados da Análise' }}
            />
            <Stack.Screen
              name="OnboardingTutorial" // Rota para REVISITAR o tutorial a partir da HomeScreen
              component={OnboardingScreen} // Reutiliza o mesmo componente OnboardingScreen
              options={{ title: 'Guia de Filmagem' }} // Título quando acessado como tutorial
              // Para esta instância, a prop 'onComplete' não será passada de App.js.
              // A prop 'isInitial' será false (ou undefined, que resultará em false
              // na OnboardingScreen se o default for 'isInitial = false').
              // A OnboardingScreen usará sua prop 'navigation' para voltar.
            />

            <Stack.Screen
              name="RecordVideo"
              component={RecordVideoScreen}
              options={{ title: 'Gravar Vídeo para Análise', headerShown: true }} // Ou false se quiser tela cheia
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;