import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BigButton from '../components/BigButton';
import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useLanguage } from '../context/LanguageContext';
import { discoverOnvifDevices } from '../utils/onvifDiscovery';

const WifiCameraScreen = () => {
  const { t } = useLanguage();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

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
                  <Text style={styles.resultTitle}>
                    {t('wifiCamera.deviceLabel', { ip: device.ip })}
                  </Text>
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
  resultTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  resultSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});

export default WifiCameraScreen;
