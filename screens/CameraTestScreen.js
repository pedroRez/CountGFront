import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
// Import the full module to use .CameraView and .Camera
import * as ExpoCameraModule from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';

export default function CameraTestScreen({ navigation }) {
  const [hasAllPermissions, setHasAllPermissions] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false); // New state to track when the camera is ready
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      console.log('[TEST] Requesting permissions...');
      // Request all required permissions
      const { status: cameraStatus } =
        await ExpoCameraModule.Camera.requestCameraPermissionsAsync();
      const { status: audioStatus } =
        await ExpoCameraModule.Camera.requestMicrophonePermissionsAsync();
      const { status: mediaStatus } =
        await MediaLibrary.requestPermissionsAsync();

      const granted =
        cameraStatus === 'granted' &&
        audioStatus === 'granted' &&
        mediaStatus === 'granted';
      setHasAllPermissions(granted);

      if (!granted) {
        Alert.alert(
          'Incomplete Permissions',
          'For this test, all permissions (camera, audio, gallery) are required.'
        );
      }
    })();
  }, []);

  const handleRecordButtonPress = async () => {
    // Check if the camera is ready and not currently recording
    if (!isCameraReady || !cameraRef.current) {
      Alert.alert('Wait', 'The camera is not ready yet.');
      return;
    }

    if (isRecording) {
      // --- Logic to STOP ---
      console.log('[TEST] Stop button pressed. Calling stopRecording()...');
      cameraRef.current.stopRecording();
      // The result will be handled by the ongoing recordAsync promise
    } else {
      // --- Logic to START ---
      setIsRecording(true);
      console.log('[TEST] Starting recording (recordAsync)...');
      try {
        // Minimal options, using mute:true as in the main use case
        const recordOptions = { mute: true };
        const data = await cameraRef.current.recordAsync(recordOptions);

        // If the promise resolves, recording was successful
        console.log('[TEST] Recording finished successfully! URI:', data.uri);

        Alert.alert(
          'Success!',
          'Video recorded. Attempting to save to gallery...'
        );
        await MediaLibrary.saveToLibraryAsync(data.uri);
        Alert.alert(
          'Saved!',
          'The test video was saved to your gallery successfully.'
        );
        navigation.goBack();
      } catch (error) {
        // Detailed error handling
        console.error(
          '[TEST] Detailed error during recording:',
          JSON.stringify(error, null, 2)
        );
        if (
          error.message.includes(
            'Recording was stopped before any data could be produced'
          )
        ) {
          Alert.alert(
            'Recording Too Short',
            'The video was stopped too quickly. Try recording longer.'
          );
        } else {
          Alert.alert(
            'Recording Error in Test',
            `An error occurred: ${error.message}`
          );
        }
      } finally {
        // Ensure state is always reset
        setIsRecording(false);
      }
    }
  };

  if (hasAllPermissions === null) {
    return (
      <View style={styles.centered}>
        <CustomActivityIndicator size="large" color="#FFF" />
        <Text style={styles.text}>Requesting permissions...</Text>
      </View>
    );
  }
  if (hasAllPermissions === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Required permissions denied.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoCameraModule.CameraView
        ref={cameraRef}
        style={styles.camera}
        type={'back'}
        mode="video" // <<< MAIN FIX ADDED HERE
        onCameraReady={() => setIsCameraReady(true)} // <<< ENSURES THE CAMERA IS READY
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.button,
            isRecording && styles.buttonStop,
            !isCameraReady && styles.buttonDisabled,
          ]}
          onPress={handleRecordButtonPress}
          disabled={!isCameraReady} // Disable button if the camera is not ready
        >
          <Text style={styles.text}>
            {!isCameraReady
              ? 'Please wait...'
              : isRecording
                ? 'Stop Recording'
                : 'Start Test'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    width: '100%',
    padding: 30,
    justifyContent: 'center',
  },
  button: {
    padding: 20,
    borderRadius: 10,
    backgroundColor: '#007AFF',
  },
  buttonStop: {
    backgroundColor: '#ff4757', // Red
  },
  buttonDisabled: {
    backgroundColor: '#8E8E93', // Gray
  },
  text: { fontSize: 18, color: 'white', fontWeight: 'bold' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
