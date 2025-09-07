import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  AppState,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

import BigButton from '../components/BigButton';
import VideoUploadSender from '../components/VideoUploadSender';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import MenuButton from '../components/MenuButton';
import { useApi } from '../context/ApiContext';

const { MediaTypeOptions } = ImagePicker;

const BackendProgressBar = ({ progress, text }) => (
  <View style={styles.backendProgressContainer}>
    <Text style={styles.processingInfoText}>{text}</Text>
    <View style={styles.progressBarContainer}>
      <View
        style={[
          styles.progressBarFill,
          { width: `${Math.min(progress * 100, 100)}%` },
        ]}
      />
    </View>
    <Text style={styles.progressPercentText}>
      {Math.round(progress * 100)}%
    </Text>
  </View>
);

const formatDuration = (millis) => {
  if (millis === null || isNaN(millis) || millis < 0) return '00:00';
  let totalSeconds = Math.floor(millis / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  let str = '';
  if (hours > 0) {
    str += `${pad(hours)}:`;
  }
  str += `${pad(minutes)}:${pad(seconds)}`;
  return str;
};

const ORIENTATIONS = [
  { id: 'N', label: 'Bottom ↑ Top' },
  { id: 'S', label: 'Top ↓ Bottom' },
  { id: 'E', label: 'Left → Right' },
  { id: 'W', label: 'Right ← Left' },
];

const MODEL_OPTIONS = [
  { id: 'n', label: 'Fast', description: 'Lower accuracy' },
  { id: 'm', label: 'Normal', description: 'Balanced' },
  { id: 'l', label: 'Precise', description: 'Slower' },
];

const HomeScreen = ({ route }) => {
  const navigation = useNavigation();
  const { apiUrl } = useApi();
  const [selectedVideoAsset, setSelectedVideoAsset] = useState(null);
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [appStatus, setAppStatus] = useState('idle');
  const [processingVideoName, setProcessingVideoName] = useState(null);
  const [backendProgressData, setBackendProgressData] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [userConsent, setUserConsent] = useState(false);
  const [selectedOrientation, setSelectedOrientation] = useState(null);
  const [modelChoice, setModelChoice] = useState('m');

  const pollingIntervalRef = useRef(null);
  const appStateListenerRef = useRef(AppState.currentState);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          style={{ marginRight: 15 }}
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={28}
            color="#007AFF"
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    React.useCallback(() => {
      if (route.params?.newlyRecordedVideo) {
        const video = route.params.newlyRecordedVideo;
        resetAllStates();
        setSelectedVideoAsset(video);
        if (video.orientation) {
          setSelectedOrientation(video.orientation);
        }
        setAppStatus('selected');
        navigation.setParams({ newlyRecordedVideo: null });
      }
    }, [route.params?.newlyRecordedVideo, navigation])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateListenerRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        appStatus === 'polling_progress'
      ) {
        if (processingVideoName) checkBackendProgress(processingVideoName);
      }
      appStateListenerRef.current = nextAppState;
    });
    return () => {
      subscription.remove();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [appStatus, processingVideoName]);

  const resetAllStates = () => {
    setSelectedVideoAsset(null);
    setProcessingVideoName(null);
    setBackendProgressData(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
    setAppStatus('idle');
    setIsPickerLoading(false);
    setUserEmail('');
    setUserConsent(false);
    setSelectedOrientation(null);
    setModelChoice('m');
  };

  const handlePickFromGallery = async () => {
    resetAllStates();
    setAppStatus('picking');
    setIsPickerLoading(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Gallery access is required.');
        resetAllStates();
        return;
      }
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: MediaTypeOptions.Videos,
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedVideoAsset(result.assets[0]);
        setAppStatus('selected');
      } else {
        resetAllStates();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load video from gallery.');
      resetAllStates();
    }
    setIsPickerLoading(false);
  };

  const handleProcessingStarted = (responseData) => {
    const videoName = responseData?.video_name || responseData?.nome_arquivo;
    if (videoName) {
      setProcessingVideoName(videoName);
      setAppStatus('polling_progress');
    } else {
      Alert.alert('Error', 'The server did not start processing correctly.');
      setAppStatus('selected');
    }
  };

  const handleUploadError = (error) => {
    setAppStatus('selected');
  };

  const checkBackendProgress = async (videoName) => {
    if (!videoName || appStatus !== 'polling_progress') {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      return;
    }
    try {
      const response = await axios.get(`${apiUrl}/progresso/${videoName}`);
      const progressData = response.data;
      setBackendProgressData(progressData);
      if (progressData.finalizado) {
        if (pollingIntervalRef.current)
          clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        if (progressData.erro) {
          Alert.alert(
            'Erro no Processamento',
            `O servidor retornou um erro: ${progressData.erro}`
          );
          resetAllStates();
        } else if (progressData.resultado) {
          Alert.alert('Analysis Complete!');
          navigation.navigate('ResultsScreen', {
            results: progressData.resultado,
          });
          setTimeout(() => resetAllStates(), 500);
        } else {
          Alert.alert('Processing Complete', 'Invalid backend result.');
          resetAllStates();
        }
      }
    } catch (error) {
      setBackendProgressData((prev) => ({
        ...(prev || {}),
        erro: 'Falha ao obter progresso.',
      }));
    }
  };

  useEffect(() => {
    if (appStatus === 'polling_progress' && processingVideoName) {
      checkBackendProgress(processingVideoName);
      pollingIntervalRef.current = setInterval(() => {
        checkBackendProgress(processingVideoName);
      }, 3000);
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [appStatus, processingVideoName]);

  const handleCancelProcessing = async () => {
    if (processingVideoName) {
      try {
        await axios.get(
          `${apiUrl}/cancelar-processamento/${processingVideoName}`
        );
        Alert.alert('Cancelled', 'Analysis cancellation request sent.');
      } catch (error) {
        Alert.alert('Error', 'Could not send cancellation request.');
      } finally {
        resetAllStates();
      }
    }
  };

  const renderProcessingContent = () => {
    if (!backendProgressData) {
      return (
        <CustomActivityIndicator
          size="large"
          color="#007AFF"
          style={{ marginVertical: 20 }}
        />
      );
    }
    if (backendProgressData.erro) {
      return (
        <Text style={styles.errorText}>Erro: {backendProgressData.erro}</Text>
      );
    }

    let progressValue = 0;
    let progressText = 'Preparando...';
    const statusMessage = backendProgressData.tempo_restante || '';

    if (statusMessage.includes('%')) {
      const percentageMatch = statusMessage.match(/(\d+)/);
      if (percentageMatch) {
        progressValue = parseInt(percentageMatch[0], 10) / 100;
      }
      progressText = statusMessage.split(':')[0];
    } else {
      progressValue =
        (backendProgressData.frame_atual || 0) /
        (backendProgressData.total_frames_estimado || 1);
      progressText = `Processando frames`;
    }

    return (
      <>
        <BackendProgressBar progress={progressValue} text={progressText} />
        <Text style={styles.etaText}>Status: {statusMessage}</Text>
      </>
    );
  };

  const renderContent = () => {
    switch (appStatus) {
      case 'idle':
        return (
          <>
            <Text style={styles.subtitle}>Select an option to start</Text>
            <View style={styles.menuContainer}>
              <MenuButton
                label="Record Video"
                icon="camera-outline"
                onPress={() => navigation.navigate('RecordVideo')}
                index={0}
              />
              <MenuButton
                label="Gallery Video"
                icon="image-multiple-outline"
                onPress={handlePickFromGallery}
                index={1}
              />
              <MenuButton
                label="Wi-Fi Camera"
                icon="wifi-strength-4"
                onPress={() =>
                  Alert.alert('Coming Soon', 'Integration with Wi-Fi cameras.')
                }
                index={2}
              />
              <MenuButton
                label="Tutorial"
                icon="help-circle-outline"
                onPress={() => navigation.navigate('OnboardingTutorial')}
                index={3}
              />
            </View>
          </>
        );
      case 'picking':
        return (
          <CustomActivityIndicator
            size="large"
            color="#007AFF"
            style={styles.loader}
          />
        );
      case 'selected':
        return (
          <View style={styles.selectionContainer}>
            <Text style={styles.selectedVideoTitle}>
              Video Ready for Analysis
            </Text>
            <Text style={styles.selectedVideoInfo} numberOfLines={1}>
              {selectedVideoAsset.fileName ||
                selectedVideoAsset.uri.split('/').pop()}
            </Text>
            {selectedVideoAsset.duration != null && (
              <Text style={styles.videoInfoText}>
                Duration: {formatDuration(selectedVideoAsset.duration)}
              </Text>
            )}
            <View style={styles.contributionSection}>
              <Text style={styles.contributionTitle}>Help train our AI!</Text>
              <TextInput
                style={styles.emailInput}
                placeholder="Your email (optional)"
                value={userEmail}
                onChangeText={setUserEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#888"
              />
              <TouchableOpacity
                style={[
                  styles.consentTouchable,
                  userConsent && styles.consentTouchableChecked,
                ]}
                onPress={() => setUserConsent(!userConsent)}
              >
                <MaterialCommunityIcons
                  name={
                    userConsent
                      ? 'checkbox-marked-circle'
                      : 'checkbox-blank-circle-outline'
                  }
                  size={26}
                  color={userConsent ? '#28a745' : '#555'}
                  style={styles.checkboxIcon}
                />
                <Text style={styles.consentText}>
                  I agree to use this video for training
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.choiceSection}>
              <Text style={styles.choiceTitle}>Movement Orientation</Text>
              <View style={styles.orientationButtonsContainer}>
                {ORIENTATIONS.map((orient) => (
                  <TouchableOpacity
                    key={orient.id}
                    style={[
                      styles.orientationButton,
                      selectedOrientation === orient.id &&
                        styles.orientationButtonSelected,
                    ]}
                    onPress={() => setSelectedOrientation(orient.id)}
                  >
                    <Text
                      style={[
                        styles.orientationButtonText,
                        selectedOrientation === orient.id &&
                          styles.orientationButtonTextSelected,
                      ]}
                    >
                      {orient.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.choiceSection}>
              <Text style={styles.choiceTitle}>Processing Level</Text>
              <View style={styles.modelButtonsContainer}>
                {MODEL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.modelButton,
                      modelChoice === opt.id && styles.modelButtonSelected,
                    ]}
                    onPress={() => setModelChoice(opt.id)}
                  >
                    <Text
                      style={[
                        styles.modelButtonText,
                        modelChoice === opt.id &&
                          styles.modelButtonTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.modelButtonDesc,
                        modelChoice === opt.id &&
                          styles.modelButtonTextSelected,
                      ]}
                    >
                      {opt.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <VideoUploadSender
              videoAsset={selectedVideoAsset}
              email={userEmail}
              consent={userConsent}
              orientation={selectedOrientation}
              modelChoice={modelChoice}
              onProcessingStarted={handleProcessingStarted}
              onUploadError={handleUploadError}
            />
            <TouchableOpacity
              onPress={resetAllStates}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>
                Cancel / Choose Another
              </Text>
            </TouchableOpacity>
          </View>
        );
      case 'prediction_requested':
      case 'polling_progress':
        return (
          <View style={styles.processingContainerFull}>
            <Text style={styles.statusTitle}>Analyzing video on server...</Text>
            {renderProcessingContent()}
            <BigButton
              title="Cancel Analysis"
              onPress={handleCancelProcessing}
              buttonStyle={styles.cancelAnalysisButton}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.title}>CountG</Text>
            {renderContent()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  container: { alignItems: 'center', paddingHorizontal: 15 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginTop: 8,
    marginBottom: 30,
    textAlign: 'center',
  },
  loader: { marginVertical: 20 },
  menuContainer: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionContainer: {
    alignItems: 'center',
    marginVertical: 15,
    width: '100%',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectedVideoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  selectedVideoInfo: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  videoInfoText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 15,
    textAlign: 'center',
  },
  contributionSection: {
    width: '100%',
    paddingVertical: 15,
    marginTop: 10,
    marginBottom: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e8e8e8',
  },
  contributionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#007AFF',
  },
  emailInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#f8f9fa',
  },
  consentTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#ced4da',
  },
  consentTouchableChecked: {
    backgroundColor: '#e6ffed',
    borderColor: '#28a745',
  },
  checkboxIcon: { marginRight: 10 },
  consentText: { fontSize: 14, color: '#495057', flexShrink: 1 },
  choiceSection: {
    width: '100%',
    marginTop: 10,
    marginBottom: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderColor: '#e8e8e8',
  },
  choiceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  orientationButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  orientationButton: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ddd',
    margin: 4,
    width: '47%',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orientationButtonSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#0056b3',
  },
  orientationButtonText: {
    color: '#333',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  orientationButtonTextSelected: { color: 'white' },
  modelButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modelButton: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#ddd',
    marginVertical: 5,
    width: '32%',
    alignItems: 'center',
    minHeight: 70,
    justifyContent: 'center',
  },
  modelButtonSelected: { backgroundColor: '#ff9800', borderColor: '#e68a00' },
  modelButtonText: { color: '#333', fontSize: 14, fontWeight: 'bold' },
  modelButtonDesc: {
    color: '#555',
    fontSize: 10,
    marginTop: 3,
    textAlign: 'center',
  },
  modelButtonTextSelected: { color: 'white' },
  cancelButton: { marginTop: 15, paddingVertical: 12 },
  cancelButtonText: { color: '#6c757d', fontSize: 16, fontWeight: '600' },
  processingContainerFull: {
    marginVertical: 20,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#007AFF',
  },
  backendProgressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  processingInfoText: { marginBottom: 8, fontSize: 15, color: '#333' },
  progressBarContainer: {
    height: 12,
    width: '100%',
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: '#28a745' },
  progressPercentText: { marginTop: 5, fontSize: 13, color: '#495057' },
  etaText: {
    marginTop: 8,
    fontSize: 13,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 16,
    color: '#dc3545',
    textAlign: 'center',
    marginBottom: 15,
  },
  cancelAnalysisButton: {
    backgroundColor: '#dc3545',
    marginTop: 20,
    width: '100%',
  },
  tutorialButton: { backgroundColor: '#6c757d', width: '100%', marginTop: 20 },
});

export default HomeScreen;
