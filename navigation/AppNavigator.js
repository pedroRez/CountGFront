import React from 'react';
import { TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Remove TouchableOpacity and MaterialCommunityIcons imports here; they are now in CustomHeader
// import { TouchableOpacity } from 'react-native';
// import { MaterialCommunityIcons } from '@expo/vector-icons';

import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import CountsScreen from '../screens/CountsScreen';
import ResultsScreen from '../screens/ResultsScreen';
import RecordVideoScreen from '../screens/RecordVideoScreen';
import CameraTestScreen from '../screens/CameraTestScreen';
import SettingsScreen from '../screens/SettingsScreen';
import VideoEditorScreen from '../screens/VideoEditorScreen';
import ProcessedVideoScreen from '../screens/ProcessedVideoScreen';
import WifiCameraScreen from '../screens/WifiCameraScreen';
import WifiCameraRecordScreen from '../screens/WifiCameraRecordScreen';
import CustomHeader from '../components/CustomHeader'; // <<< Import our new header
import { useLanguage } from '../context/LanguageContext';

const Stack = createNativeStackNavigator();

export default function AppNavigator({ isFirstLaunch, onOnboardingComplete }) {
  const { t } = useLanguage();
  const renderHeaderBack = (navigation) => (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      style={{ paddingHorizontal: 14, paddingVertical: 8, marginLeft: 6 }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MaterialCommunityIcons name="chevron-left" size={30} color="#007AFF" />
    </TouchableOpacity>
  );

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
              name="Counts"
              component={CountsScreen}
              options={({ navigation }) => ({
                title: t('nav.countsTitle'),
                headerLeft: () => renderHeaderBack(navigation),
              })}
            />
            <Stack.Screen
              name="RecordVideo"
              component={RecordVideoScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ResultsScreen"
              component={ResultsScreen}
              options={({ navigation }) => ({
                title: t('nav.resultsTitle'),
                headerLeft: () => renderHeaderBack(navigation),
              })}
            />
            <Stack.Screen
              name="ProcessedVideo"
              component={ProcessedVideoScreen}
              options={({ navigation }) => ({
                title: t('nav.processedVideoTitle'),
                headerLeft: () => renderHeaderBack(navigation),
              })}
            />
            <Stack.Screen
              name="OnboardingTutorial"
              component={OnboardingScreen}
              options={({ navigation }) => ({
                title: t('nav.filmingGuideTitle'),
                headerLeft: () => renderHeaderBack(navigation),
              })}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={({ navigation }) => ({
                title: t('nav.settingsTitle'),
                headerLeft: () => renderHeaderBack(navigation),
              })}
            />
            <Stack.Screen
              name="CameraTest"
              component={CameraTestScreen}
              options={({ navigation }) => ({
                title: t('nav.cameraTestTitle'),
                headerLeft: () => renderHeaderBack(navigation),
              })}
            />
            <Stack.Screen
              name="WifiCamera"
              component={WifiCameraScreen}
              options={({ navigation }) => ({
                title: t('nav.wifiCameraTitle'),
                headerLeft: () => renderHeaderBack(navigation),
              })}
            />
            <Stack.Screen
              name="WifiCameraRecord"
              component={WifiCameraRecordScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="VideoEditor"
              component={VideoEditorScreen}
              options={{ headerShown: false }}
            />
          </React.Fragment>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
