import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { useApi } from '../context/ApiContext'; // Import our custom hook
import BigButton from '../components/BigButton';

const SettingsScreen = () => {
  // Retrieve values and functions from our global context
  const {
    apiUrl,
    setApiUrl,
    isCustomUrlEnabled,
    setIsCustomUrlEnabled,
    DEFAULT_API_URL,
  } = useApi();

  // Local state for the text field, initialized with the context URL
  const [textInputUrl, setTextInputUrl] = useState(
    isCustomUrlEnabled ? apiUrl : ''
  );
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    const urlToTest = isCustomUrlEnabled ? textInputUrl : DEFAULT_API_URL;
    if (!urlToTest || !urlToTest.startsWith('http')) {
      Alert.alert(
        'Invalid URL',
        'Please enter a valid URL starting with http:// or https://'
      );
      return;
    }

    setIsTesting(true);
    Alert.alert('Testing...', `Trying to connect to ${urlToTest}`);

    try {
      // Attempt a GET request to the API root
      const response = await axios.get(urlToTest, { timeout: 10000 }); // 10-second timeout
      if (response.status === 200) {
        Alert.alert(
          'Success!',
          `Connection to ${urlToTest} successful.\nServer status: ${response.data.status || 'OK'}`
        );
      } else {
        Alert.alert(
          'Connection Failed',
          `The server responded with status: ${response.status}`
        );
      }
    } catch (error) {
      Alert.alert(
        'Connection Error',
        `Could not connect to the server. Check the URL and your connection.\n\nDetails: ${error.message}`
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleSwitch = (value) => {
    setIsCustomUrlEnabled(value);
    // If enabling the custom URL, save whatever is in the text field
    if (value) {
      setApiUrl(textInputUrl);
    }
  };

  const handleUrlChange = (text) => {
    setTextInputUrl(text);
    // If the custom URL is enabled, update the context in real time
    if (isCustomUrlEnabled) {
      setApiUrl(text);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>API Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Server</Text>
          <Text style={styles.infoText}>
            The default server configured in the app is:
          </Text>
          <Text style={styles.urlText}>{DEFAULT_API_URL}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.switchContainer}>
            <Text style={styles.sectionTitle}>Use Custom Server</Text>
            <Switch
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={isCustomUrlEnabled ? '#007AFF' : '#f4f3f4'}
              onValueChange={handleToggleSwitch}
              value={isCustomUrlEnabled}
            />
          </View>
          <TextInput
            style={[styles.input, !isCustomUrlEnabled && styles.inputDisabled]}
            placeholder="http://192.168.X.XX:8000"
            value={textInputUrl}
            onChangeText={handleUrlChange}
            editable={isCustomUrlEnabled} // Only editable if the switch is on
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <BigButton
          title={isTesting ? 'Testing...' : 'Test Connection'}
          onPress={handleTestConnection}
          disabled={isTesting}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 20 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  infoText: { fontSize: 14, color: '#666' },
  urlText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: 'bold',
    marginTop: 5,
    userSelect: 'all',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginTop: 10,
    backgroundColor: '#fff',
  },
  inputDisabled: { backgroundColor: '#e9ecef', color: '#6c757d' },
});

export default SettingsScreen;
