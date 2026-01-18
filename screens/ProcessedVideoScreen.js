import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { useLanguage } from '../context/LanguageContext';

const formatDateTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

export default function ProcessedVideoScreen({ route }) {
  const { t } = useLanguage();
  const { count } = route.params || {};
  const videoRef = useRef(null);

  const title = count?.name || t('home.counts.unnamed');
  const description = count?.description;
  const dateLabel = formatDateTime(count?.created_at);
  const totalCount =
    Number.isFinite(Number(count?.total_count)) ? count.total_count : '-';
  const videoUri = count?.local_video_uri;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        {!!description && <Text style={styles.description}>{description}</Text>}
        {!!dateLabel && <Text style={styles.metaText}>{dateLabel}</Text>}
        <Text style={styles.metaText}>
          {t('home.counts.countLabel')}: {totalCount}
        </Text>
        <View style={styles.videoWrapper}>
          {videoUri ? (
            <Video
              ref={videoRef}
              source={{ uri: videoUri }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
            />
          ) : (
            <Text style={styles.noVideoText}>{t('home.counts.noVideo')}</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  description: {
    marginTop: 6,
    fontSize: 14,
    color: '#e2e8f0',
  },
  metaText: {
    marginTop: 6,
    fontSize: 12,
    color: '#94a3b8',
  },
  videoWrapper: {
    flex: 1,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  noVideoText: {
    color: '#9ca3af',
    fontSize: 14,
  },
});
