import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BigButton from '../components/BigButton';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';
import { scanRtspDevices } from '../utils/rtspScan';

const DEFAULT_ONVIF_USERNAME = 'admin';
const COMMON_PREFIXES = ['192.168.0'];
const DEFAULT_HOST_MIN = 10;
const DEFAULT_HOST_MAX = 20;
const WIFI_CAMERA_CREDENTIALS_KEY = '@wifi_camera_credentials';

const isValidIp = (value) => {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
};

const getLocalPrefix = async () => {
  const netInfo = NativeModules?.NetworkInfo;
  if (!netInfo?.getIpAddress) return null;
  try {
    const ip = await netInfo.getIpAddress();
    if (typeof ip === 'string' && ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return parts.slice(0, 3).join('.');
      }
    }
  } catch (error) {
    // ignore ip lookup errors
  }
  return null;
};

const buildScanPrefixes = async (manualIp) => {
  if (isValidIp(manualIp)) {
    return [manualIp.split('.').slice(0, 3).join('.')];
  }
  const localPrefix = await getLocalPrefix();
  if (!localPrefix) return [...COMMON_PREFIXES];
  if (localPrefix.startsWith('192.168.')) {
    return [localPrefix];
  }
  return [localPrefix, ...COMMON_PREFIXES];
};

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
  const [manualIp, setManualIp] = useState('');
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loadSavedCredentials = useCallback(async (ip) => {
    setHasSavedCredentials(false);
    if (!ip) return;
    try {
      const raw = await AsyncStorage.getItem(WIFI_CAMERA_CREDENTIALS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const saved = parsed?.[ip];
      if (!saved) return;
      if (typeof saved.username === 'string' && saved.username.trim()) {
        setUsername(saved.username);
      }
      if (typeof saved.password === 'string') {
        setPassword(saved.password);
      }
      setHasSavedCredentials(true);
    } catch (error) {
      setHasSavedCredentials(false);
    }
  }, []);

  const saveCredentials = useCallback(async (ip, user, pass) => {
    if (!ip || !pass) return;
    try {
      const raw = await AsyncStorage.getItem(WIFI_CAMERA_CREDENTIALS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[ip] = {
        username: user || DEFAULT_ONVIF_USERNAME,
        password: pass,
        updatedAt: Date.now(),
      };
      await AsyncStorage.setItem(
        WIFI_CAMERA_CREDENTIALS_KEY,
        JSON.stringify(parsed)
      );
      setHasSavedCredentials(true);
    } catch (error) {
      // ignore storage failures
    }
  }, []);

  const clearSavedCredentials = useCallback(async () => {
    const ip = selectedDevice?.ip;
    if (!ip) return;
    try {
      const raw = await AsyncStorage.getItem(WIFI_CAMERA_CREDENTIALS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed[ip]) {
        delete parsed[ip];
        await AsyncStorage.setItem(
          WIFI_CAMERA_CREDENTIALS_KEY,
          JSON.stringify(parsed)
        );
      }
    } catch (error) {
      // ignore storage failures
    }
    setPassword('');
    setUsername(DEFAULT_ONVIF_USERNAME);
    setHasSavedCredentials(false);
  }, [selectedDevice?.ip]);

  useEffect(() => {
    if (!isAuthVisible || !selectedDevice?.ip) {
      setHasSavedCredentials(false);
      return;
    }
    void loadSavedCredentials(selectedDevice.ip);
  }, [isAuthVisible, loadSavedCredentials, selectedDevice?.ip]);

  const handleScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setErrorMessage('');
    setDevices([]);
    try {
      let nextDevices = [];
      if (!nextDevices.length) {
        const prefixes = await buildScanPrefixes(manualIp);
        let rtspDevices = [];
        for (const prefix of prefixes) {
          const scanResults = await scanRtspDevices({
            subnetPrefix: prefix,
            timeoutMs: 2500,
            concurrency: 4,
            probeDelayMs: 120,
            matchHint: 'HIipCamera',
            verifyOnvifPort: [5000, 80],
            hostMin: DEFAULT_HOST_MIN,
            hostMax: DEFAULT_HOST_MAX,
            allowConnectOnly: true,
          });
          if (scanResults.length) {
            rtspDevices = scanResults;
            break;
          }
        }
        nextDevices = Array.isArray(rtspDevices) ? rtspDevices : [];
      }
      setDevices(nextDevices);
    } finally {
      setIsScanning(false);
    }
  };

  const openAuthModal = (device) => {
    setSelectedDevice(device);
    setShowAdvanced(false);
    setUsername(DEFAULT_ONVIF_USERNAME);
    setPassword('');
    setShowPassword(false);
    setIsAuthVisible(true);
  };

  const closeAuthModal = () => {
    setIsAuthVisible(false);
    setSelectedDevice(null);
    setShowAdvanced(false);
    setPassword('');
    setShowPassword(false);
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
    void saveCredentials(selectedDevice.ip, trimmedUsername, password);
    const wifiCamera = {
      ip: selectedDevice.ip,
      username: trimmedUsername,
      password,
      xaddrs: selectedDevice.xaddrs || [],
      rtspPath: selectedDevice.rtspPath,
      rtspPort: selectedDevice.rtspPort,
    };
    setIsAuthVisible(false);
    setSelectedDevice(null);
    setPassword('');
    navigation.navigate('WifiCameraRecord', { wifiCamera });
  };

  const handleManualConnect = () => {
    const trimmed = manualIp.trim();
    if (!isValidIp(trimmed)) {
      Alert.alert(
        t('wifiCamera.manualIpInvalidTitle'),
        t('wifiCamera.manualIpInvalidMessage')
      );
      return;
    }
    openAuthModal({ ip: trimmed, xaddrs: [] });
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
          <Text style={styles.sectionTitle}>
            {t('wifiCamera.manualIpTitle')}
          </Text>
          <Text style={styles.inputLabel}>{t('wifiCamera.manualIpLabel')}</Text>
          <TextInput
            style={styles.input}
            value={manualIp}
            onChangeText={setManualIp}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numeric"
            placeholder={t('wifiCamera.manualIpPlaceholder')}
            placeholderTextColor="#9ca3af"
          />
          <TouchableOpacity
            style={styles.manualButton}
            onPress={handleManualConnect}
          >
            <Text style={styles.manualButtonText}>
              {t('wifiCamera.manualIpConnect')}
            </Text>
          </TouchableOpacity>
        </View>

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
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('wifiCamera.passwordPlaceholder')}
                  placeholderTextColor="#9ca3af"
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={t('wifiCamera.togglePassword')}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[
                  styles.clearCredentialsButton,
                  !hasSavedCredentials && styles.clearCredentialsButtonDisabled,
                ]}
                onPress={clearSavedCredentials}
                disabled={!hasSavedCredentials}
              >
                <Text style={styles.clearCredentialsText}>
                  {t('wifiCamera.clearCredentials')}
                </Text>
              </TouchableOpacity>
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    marginBottom: 0,
  },
  passwordToggle: {
    marginLeft: 8,
    padding: 8,
  },
  manualButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
  clearCredentialsButton: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  clearCredentialsButtonDisabled: {
    opacity: 0.5,
  },
  clearCredentialsText: {
    fontSize: 12,
    color: '#6b7280',
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
