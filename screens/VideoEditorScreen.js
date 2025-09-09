import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as VideoManipulator from 'expo-video-manipulator'; // ou métodos do ffmpeg-kit
import Slider from '@react-native-community/slider'; // UI para seleção de tempo

/**
 * Screen allowing the user to trim a video.
 * After confirming, a new asset containing the trimmed
 * video URI and duration is passed back to the Home screen.
 * A placeholder for direction selection is kept for future use.
 */
export default function VideoEditorScreen({ route, navigation }) {
  const { asset } = route.params || {};
  const [startTime, setStartTime] = useState(0);
  const initialDuration = asset?.duration ?? 0;
  const totalDuration =
    initialDuration > 1000 ? initialDuration / 1000 : initialDuration;
  const [endTime, setEndTime] = useState(totalDuration);
  const videoRef = useRef(null);

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleConfirm = async () => {
    try {
      const result = await VideoManipulator.manipulateAsync(
        asset?.uri,
        [{ trim: [startTime, endTime] }],
        { compress: 0, format: VideoManipulator.SaveFormat.MP4 }
      );
      if (result) {
        const duration = (endTime - startTime) * 1000;
        const trimmedAsset = {
          uri: result.uri,
          duration,
          fileName: asset?.fileName || result.uri.split('/').pop(),
          mimeType: asset?.mimeType || 'video/mp4',
          orientation: asset?.orientation,
        };
        navigation.navigate('Home', { trimmedVideo: trimmedAsset });
      }
    } catch (error) {
      console.warn('Video trimming failed', error);
    }
  };

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: asset?.uri }}
        style={styles.editor}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
      />

      <View style={styles.sliderContainer}>
        <Text style={styles.sliderLabel}>Start: {startTime.toFixed(2)}s</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={endTime}
          value={startTime}
          onValueChange={setStartTime}
        />
        <Text style={styles.sliderLabel}>End: {endTime.toFixed(2)}s</Text>
        <Slider
          style={styles.slider}
          minimumValue={startTime}
          maximumValue={totalDuration}
          value={endTime}
          onValueChange={setEndTime}
        />
      </View>

      {/* Future placeholder for direction selection */}
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Direction selector will appear here
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={handleCancel}
        >
          <Text style={styles.buttonText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.confirmButton]}
          onPress={handleConfirm}
        >
          <Text style={styles.buttonText}>Confirmar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  editor: {
    flex: 1,
  },
  sliderContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  slider: {
    width: Dimensions.get('window').width - 32,
    height: 40,
  },
  sliderLabel: {
    color: '#fff',
    textAlign: 'center',
  },
  placeholder: {
    padding: 16,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#888',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
