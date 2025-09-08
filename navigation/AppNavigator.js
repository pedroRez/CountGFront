import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Remove TouchableOpacity and MaterialCommunityIcons imports here; they are now in CustomHeader
// import { TouchableOpacity } from 'react-native';
// import { MaterialCommunityIcons } from '@expo/vector-icons';

import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
import CameraTestScreen from '../screens/CameraTestScreen';
import SettingsScreen from '../screens/SettingsScreen';
import VideoEditorScreen from '../screens/VideoEditorScreen';
import CustomHeader from '../components/CustomHeader'; // <<< Import our new header

const Stack = createNativeStackNavigator();

export default function AppNavigator({ isFirstLaunch, onOnboardingComplete }) {
  return (
    <NavigationContainer>
      <Stack.Navigator
      // Removed screenOptions here since CustomHeader handles everything
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
              // --- MAIN FIX HERE ---
              // The 'header' property completely replaces the default header
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
              options={{ title: 'Analysis Results' }}
            />
            <Stack.Screen
              name="OnboardingTutorial"
              component={OnboardingScreen}
              options={{ title: 'Filming Guide' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Settings' }}
            />
            <Stack.Screen
              name="CameraTest"
              component={CameraTestScreen}
              options={{ title: 'Camera Test' }}
            />
            <Stack.Screen
              name="VideoEditor"
              component={VideoEditorScreen}
              options={{ title: 'Edit Video' }}
            />
          </React.Fragment>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
