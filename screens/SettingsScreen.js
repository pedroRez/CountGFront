import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Switch,
  Alert,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { useApi } from '../context/ApiContext'; // Import our custom hook
import BigButton from '../components/BigButton';
import { useLanguage } from '../context/LanguageContext';

const DEV_MODE_KEY = '@dev_mode_enabled';
const DEV_MODE_TAPS = 10;

const SettingsScreen = () => {
  // Retrieve values and functions from our global context
  const {
    isCustomUrlEnabled,
    setIsCustomUrlEnabled,
    customUrls,
    addCustomServer,
    removeCustomServer,
    DEFAULT_API_URL,
  } = useApi();
  const { language, setLanguage, t } = useLanguage();

  const [textInputUrl, setTextInputUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    const loadDevMode = async () => {
      try {
        const saved = await AsyncStorage.getItem(DEV_MODE_KEY);
        if (saved === 'true') {
          setIsDevMode(true);
        }
      } catch (error) {
        console.warn('Failed to load dev mode flag:', error);
      }
    };
    loadDevMode();
  }, []);

  const normalizeUrl = (value) => value.trim().replace(/\/+$/, '');
  const isValidUrl = (value) => /^https?:\/\//i.test(value);

  const activateDevMode = async () => {
    setIsDevMode(true);
    setTapCount(0);
    try {
      await AsyncStorage.setItem(DEV_MODE_KEY, 'true');
    } catch (error) {
      console.warn('Failed to save dev mode flag:', error);
    }
    Alert.alert(
      t('settings.developerModeTitle'),
      t('settings.developerModeMessage')
    );
  };

  const handleLanguageTitlePress = () => {
    if (isDevMode) return;
    setTapCount((prev) => {
      const nextCount = prev + 1;
      if (nextCount >= DEV_MODE_TAPS) {
        activateDevMode();
        return 0;
      }
      return nextCount;
    });
  };

  const handleTestConnection = async () => {
    if (isCustomUrlEnabled && customUrls.length === 0) {
      Alert.alert(
        t('settings.noCustomServersTitle'),
        t('settings.noCustomServersMessage')
      );
      return;
    }
    const urlToTest = isCustomUrlEnabled ? customUrls[0] : DEFAULT_API_URL;
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
    if (value && customUrls.length === 0) {
      Alert.alert(
        t('settings.noCustomServersTitle'),
        t('settings.noCustomServersMessage')
      );
      return;
    }
    setIsCustomUrlEnabled(value);
  };

  const handleAddServer = () => {
    const normalized = normalizeUrl(textInputUrl);
    if (!normalized || !isValidUrl(normalized)) {
      Alert.alert(
        t('settings.invalidUrlTitle'),
        t('settings.invalidUrlMessage')
      );
      return;
    }
    const exists = customUrls.some(
      (url) => url.toLowerCase() === normalized.toLowerCase()
    );
    if (exists) {
      Alert.alert(
        t('settings.serverExistsTitle'),
        t('settings.serverExistsMessage')
      );
      return;
    }
    addCustomServer(normalized);
    setTextInputUrl('');
  };

  const handleRemoveServer = (index) => {
    removeCustomServer(index);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <View style={styles.section}>
          <TouchableOpacity onPress={handleLanguageTitlePress}>
            <Text style={styles.sectionTitle}>
              {t('settings.languageTitle')}
            </Text>
          </TouchableOpacity>
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

        {isDevMode && (
          <>
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
                  disabled={customUrls.length === 0}
                />
              </View>
              <Text style={styles.infoText}>
                {t('settings.customServersDescription')}
              </Text>
              <View style={styles.serverInputRow}>
                <TextInput
                  style={styles.input}
                  placeholder={t('settings.serverPlaceholder')}
                  value={textInputUrl}
                  onChangeText={setTextInputUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddServer}
                >
                  <Text style={styles.addButtonText}>
                    {t('settings.addServer')}
                  </Text>
                </TouchableOpacity>
              </View>
              {customUrls.length === 0 ? (
                <Text style={styles.infoText}>
                  {t('settings.noCustomServers')}
                </Text>
              ) : (
                <View style={styles.serverList}>
                  {customUrls.map((url, index) => (
                    <View key={`${url}-${index}`} style={styles.serverRow}>
                      <Text style={styles.serverUrl} numberOfLines={1}>
                        {url}
                      </Text>
                      {index === 0 && (
                        <Text style={styles.defaultBadge}>
                          {t('settings.defaultBadge')}
                        </Text>
                      )}
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemoveServer(index)}
                      >
                        <Text style={styles.removeButtonText}>
                          {t('settings.removeServer')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <BigButton
              title={
                isTesting ? t('settings.testing') : t('settings.testConnection')
              }
              onPress={handleTestConnection}
              disabled={isTesting}
            />
          </>
        )}
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
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  serverInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  addButton: {
    marginLeft: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  serverList: { marginTop: 12 },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  serverUrl: { flex: 1, fontSize: 13, color: '#111827' },
  defaultBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    fontSize: 10,
    fontWeight: '700',
  },
  removeButton: {
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  removeButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
});

export default SettingsScreen;
