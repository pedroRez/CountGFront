import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BigButton from '../components/BigButton';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';
import { discoverOnvifDevices } from '../utils/onvifDiscovery';

const DEFAULT_ONVIF_USERNAME = 'admin';

const WifiCameraScreen = ({ navigation }) => {
  const { t } = useLanguage();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isAuthVisible, setIsAuthVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [username, setUsername] = useState(DEFAULT_ONVIF_USERNAME);
  const [password, setPassword] = useState('');

  const handleScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setErrorMessage('');
    setDevices([]);
    try {
      const results = await discoverOnvifDevices({ timeoutMs: 5000, retries: 2 });
      setDevices(Array.isArray(results) ? results : []);
    } catch (error) {
      setErrorMessage(error?.message || 'Scan failed.');
    } finally {
      setIsScanning(false);
    }
  };

  const openAuthModal = (device) => {
    setSelectedDevice(device);
    setShowAdvanced(false);
    setUsername(DEFAULT_ONVIF_USERNAME);
    setPassword('');
    setIsAuthVisible(true);
  };

  const closeAuthModal = () => {
    setIsAuthVisible(false);
    setSelectedDevice(null);
    setShowAdvanced(false);
    setPassword('');
  };

  const handleStartRecording = () => {
    if (!selectedDevice?.ip) {
      Alert.alert(t('common.error'), t('wifiCamera.noDeviceSelected'));
      return;
    }
    if (!password.trim()) {
      Alert.alert(
        t('wifiCamera.passwordRequiredTitle'),
        t('wifiCamera.passwordRequiredMessage')
      );
      return;
    }
    const trimmedUsername = username.trim();
    const wifiCamera = {
      ip: selectedDevice.ip,
      username: trimmedUsername,
      password,
      xaddrs: selectedDevice.xaddrs || [],
    };
    setIsAuthVisible(false);
    setSelectedDevice(null);
    setPassword('');
    navigation.navigate('WifiCameraRecord', { wifiCamera });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('wifiCamera.title')}</Text>
        <Text style={styles.subtitle}>{t('wifiCamera.subtitle')}</Text>

        <View style={styles.card}>
          <Text style={styles.hintText}>{t('wifiCamera.hint')}</Text>
        </View>

        <BigButton
          title={isScanning ? t('wifiCamera.scanning') : t('wifiCamera.scan')}
          onPress={handleScan}
          disabled={isScanning}
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('wifiCamera.resultsTitle')}</Text>
          {isScanning && (
            <CustomActivityIndicator size="large" color="#007AFF" />
          )}

          {!isScanning && errorMessage ? (
            <Text style={styles.errorText}>
              {t('wifiCamera.errorMessage', { details: errorMessage })}
            </Text>
          ) : null}

          {!isScanning && !errorMessage && devices.length === 0 ? (
            <Text style={styles.helperText}>{t('wifiCamera.noResults')}</Text>
          ) : null}

          {!isScanning && devices.length > 0 ? (
            <>
              <Text style={styles.metaText}>
              {t('wifiCamera.foundCount', { count: devices.length })}
            </Text>
            {devices.map((device) => (
              <View key={device.ip} style={styles.resultRow}>
                <View style={styles.resultRowHeader}>
                  <Text style={styles.resultTitle}>
                    {t('wifiCamera.deviceLabel', { ip: device.ip })}
                  </Text>
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={() => openAuthModal(device)}
                  >
                    <Text style={styles.connectButtonText}>
                      {t('wifiCamera.connect')}
                    </Text>
                  </TouchableOpacity>
                </View>
                {(device.xaddrs || []).map((url) => (
                  <Text key={`${device.ip}-${url}`} style={styles.resultSubtitle}>
                    {t('wifiCamera.xaddrsLabel', { url })}
                  </Text>
                ))}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        visible={isAuthVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAuthModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeAuthModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalWrapper}
          >
            <Pressable
              style={styles.modalCard}
              onPress={(event) => event.stopPropagation()}
            >
              <Text style={styles.modalTitle}>{t('wifiCamera.authTitle')}</Text>
              {selectedDevice?.ip ? (
                <Text style={styles.modalSubtitle}>
                  {t('wifiCamera.selectedCameraLabel', {
                    ip: selectedDevice.ip,
                  })}
                </Text>
              ) : null}
              <Text style={styles.inputLabel}>
                {t('wifiCamera.passwordLabel')}
              </Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('wifiCamera.passwordPlaceholder')}
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced((prev) => !prev)}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvanced
                    ? t('wifiCamera.advancedHide')
                    : t('wifiCamera.advancedShow')}
                </Text>
              </TouchableOpacity>
              {showAdvanced ? (
                <>
                  <Text style={styles.inputLabel}>
                    {t('wifiCamera.usernameLabel')}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={t('wifiCamera.usernamePlaceholder')}
                    placeholderTextColor="#9ca3af"
                  />
                </>
              ) : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={closeAuthModal}
                >
                  <Text style={styles.modalCancelText}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalPrimaryButton]}
                  onPress={handleStartRecording}
                >
                  <Text style={styles.modalPrimaryText}>
                    {t('wifiCamera.startRecording')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 20, flexGrow: 1 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
  },
  hintText: {
    fontSize: 13,
    color: '#6b7280',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    color: '#111827',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  resultRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  resultRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resultTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  resultSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrapper: {
    width: '100%',
    maxWidth: 380,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 12,
  },
  advancedToggle: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  advancedToggleText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#e5e7eb',
  },
  modalPrimaryButton: {
    backgroundColor: '#2563eb',
  },
  modalCancelText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 14,
  },
  modalPrimaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default WifiCameraScreen;
