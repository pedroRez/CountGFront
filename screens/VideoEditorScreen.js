import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { VideoEditor } from 'expo-video-editor';

/**
 * Screen allowing the user to trim a video.
 * After confirming, a new asset containing the trimmed
 * video URI and duration is passed back to the Home screen.
 * A placeholder for direction selection is kept for future use.
 */
export default function VideoEditorScreen({ route, navigation }) {
  const { asset } = route.params || {};
  const editorRef = useRef(null);

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleConfirm = async () => {
    try {
      const result = await editorRef.current?.trimAsync();
      if (result?.uri) {
        const trimmedAsset = {
          uri: result.uri,
          duration: result.duration,
        };
        navigation.navigate('Home', { trimmedVideo: trimmedAsset });
      }
    } catch (error) {
      console.warn('Video trimming failed', error);
    }
  };

  return (
    <View style={styles.container}>
      <VideoEditor
        ref={editorRef}
        style={styles.editor}
        videoUri={asset?.uri}
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
