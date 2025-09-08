import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  VideoPlayer,
  Trimmer,
  ProcessingManager,
} from 'react-native-video-processing';

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
  const [endTime, setEndTime] = useState(
    initialDuration > 1000 ? initialDuration / 1000 : initialDuration,
  );

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleConfirm = async () => {
    try {
      const result = await ProcessingManager.trim(asset?.uri, {
        startTime,
        endTime,
      });
      if (result) {
        const duration = (endTime - startTime) * 1000;
        const trimmedAsset = {
          uri: result,
          duration,
          fileName: asset?.fileName || result.split('/').pop(),
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
      <VideoPlayer
        source={asset?.uri}
        style={styles.editor}
        startTime={startTime}
        endTime={endTime}
        play={false}
        resizeMode={VideoPlayer.Constants.resizeMode.CONTAIN}
      />

      <Trimmer
        source={asset?.uri}
        onChange={({ startTime: s, endTime: e }) => {
          setStartTime(s);
          setEndTime(e);
        }}
        height={80}
        width={Dimensions.get('window').width}
        themeColor="#fff"
        thumbWidth={14}
        trackerColor="#007AFF"
      />

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
