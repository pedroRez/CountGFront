import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Switch,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { useApi } from '../context/ApiContext'; // Import our custom hook
import BigButton from '../components/BigButton';
import { useLanguage } from '../context/LanguageContext';

const SettingsScreen = () => {
  // Retrieve values and functions from our global context
  const {
    apiUrl,
    setApiUrl,
    isCustomUrlEnabled,
    setIsCustomUrlEnabled,
    DEFAULT_API_URL,
  } = useApi();
  const { language, setLanguage, t } = useLanguage();

  // Local state for the text field, initialized with the context URL
  const [textInputUrl, setTextInputUrl] = useState(
    isCustomUrlEnabled ? apiUrl : ''
  );
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    const urlToTest = isCustomUrlEnabled ? textInputUrl : DEFAULT_API_URL;
    if (!urlToTest || !urlToTest.startsWith('http')) {
      Alert.alert(
        t('settings.invalidUrlTitle'),
        t('settings.invalidUrlMessage')
      );
      return;
    }

    setIsTesting(true);
    Alert.alert(
      t('settings.testingTitle'),
      t('settings.testingMessage', { url: urlToTest })
    );

    try {
      // Attempt a GET request to the API root
      const response = await axios.get(urlToTest, { timeout: 10000 }); // 10-second timeout
      if (response.status === 200) {
        Alert.alert(
          t('settings.successTitle'),
          t('settings.successMessage', {
            url: urlToTest,
            status: response.data.status || 'OK',
          })
        );
      } else {
        Alert.alert(
          t('settings.connectionFailedTitle'),
          t('settings.connectionFailedMessage', { status: response.status })
        );
      }
    } catch (error) {
      Alert.alert(
        t('settings.connectionErrorTitle'),
        t('settings.connectionErrorMessage', { details: error.message })
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
        <Text style={styles.title}>{t('settings.title')}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('settings.defaultServerTitle')}
          </Text>
          <Text style={styles.infoText}>
            {t('settings.defaultServerDescription')}
          </Text>
          <Text style={styles.urlText}>{DEFAULT_API_URL}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.switchContainer}>
            <Text style={styles.sectionTitle}>
              {t('settings.useCustomServer')}
            </Text>
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
          title={isTesting ? t('settings.testing') : t('settings.testConnection')}
          onPress={handleTestConnection}
          disabled={isTesting}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('settings.languageTitle')}
          </Text>
          <Text style={styles.infoText}>
            {t('settings.languageDescription')}
          </Text>
          <View style={styles.languageOptions}>
            {[
              { id: 'pt', label: t('settings.languagePortuguese') },
              { id: 'en', label: t('settings.languageEnglish') },
            ].map((option) => {
              const isSelected = language === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.languageOption,
                    isSelected && styles.languageOptionSelected,
                  ]}
                  onPress={() => setLanguage(option.id)}
                >
                  <Text
                    style={[
                      styles.languageOptionText,
                      isSelected && styles.languageOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
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
  languageOptions: {
    flexDirection: 'row',
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  languageOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  languageOptionSelected: {
    backgroundColor: '#007AFF',
  },
  languageOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  languageOptionTextSelected: {
    color: '#fff',
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
