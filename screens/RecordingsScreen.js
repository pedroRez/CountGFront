import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system/legacy';

import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useRecordings } from '../context/RecordingsContext';
import { useLanguage } from '../context/LanguageContext';
import { resolveVideoMimeType } from '../utils/videoMime';

const formatDateTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

const toShareableUri = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `file://${value}`;
  return `file:///${value}`;
};

const toNullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const RecordingsScreen = () => {
  const navigation = useNavigation();
  const { recordings, refreshRecordings, isLoading } = useRecordings();
  const { t } = useLanguage();
  const [thumbnails, setThumbnails] = useState({});

  const recordingList = useMemo(
    () => (Array.isArray(recordings) ? recordings : []),
    [recordings]
  );

  useFocusEffect(
    useCallback(() => {
      refreshRecordings();
    }, [refreshRecordings])
  );

  useEffect(() => {
    let isActive = true;
    const missing = recordingList.filter((recording) => {
      if (!recording?.local_video_uri) return false;
      const key = String(recording.id);
      return !Object.prototype.hasOwnProperty.call(thumbnails, key);
    });

    if (missing.length === 0) return undefined;

    const loadThumbnails = async () => {
      const updates = {};
      for (const recording of missing) {
        const key = String(recording.id);
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(
            toShareableUri(recording.local_video_uri),
            { time: 800 }
          );
          updates[key] = uri;
        } catch (_error) {
          updates[key] = null;
        }
      }
      if (!isActive) return;
      setThumbnails((prev) => ({ ...prev, ...updates }));
    };

    void loadThumbnails();

    return () => {
      isActive = false;
    };
  }, [recordingList, thumbnails]);

  const handleOpenRecording = (recording) => {
    navigation.navigate('ProcessedVideo', {
      count: {
        name: recording?.name || recording?.file_name || t('home.recordings.unnamed'),
        description:
          recording?.settings_count_description ||
          recording?.settings_count_name ||
          null,
        created_at: recording?.created_at || null,
        total_count: recording?.last_total_count || null,
        local_video_uri: toShareableUri(recording?.local_video_uri),
      },
    });
  };

  const handleCountAgain = async (recording) => {
    const uri = toShareableUri(recording?.local_video_uri);
    if (!uri) {
      Alert.alert(t('common.error'), t('home.recordings.noVideo'));
      return;
    }

    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      if (!info?.exists || info?.isDirectory) {
        Alert.alert(t('common.error'), t('home.recordings.videoMissing'));
        return;
      }
    } catch (_error) {
      Alert.alert(t('common.error'), t('home.recordings.videoMissing'));
      return;
    }

    navigation.navigate('VideoEditor', {
      asset: {
        uri,
        fileName: recording?.file_name || uri.split('/').pop(),
        mimeType: resolveVideoMimeType(uri, recording?.mime_type || 'video/mp4'),
        duration: toNullableNumber(recording?.duration_ms) || 0,
        originalDurationMs: toNullableNumber(recording?.duration_ms) || 0,
        orientation: recording?.settings_orientation || null,
        trimStartMs: toNullableNumber(recording?.settings_trim_start_ms),
        trimEndMs: toNullableNumber(recording?.settings_trim_end_ms),
        linePositionRatio: toNullableNumber(
          recording?.settings_line_position_ratio
        ),
        recordingId: recording?.id || null,
        countName: recording?.settings_count_name || '',
        countDescription: recording?.settings_count_description || '',
        modelChoice: recording?.settings_model_choice || 'm',
      },
    });
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      {isLoading ? (
        <CustomActivityIndicator size="large" color="#007AFF" />
      ) : (
        <Text style={styles.emptyText}>{t('home.recordings.empty')}</Text>
      )}
    </View>
  );

  const renderRecordingItem = ({ item }) => {
    const key = String(item.id);
    const thumbnailUri = thumbnails[key] || null;
    const hasVideo = Boolean(item.local_video_uri);
    const dateLabel = formatDateTime(item.created_at);
    const displayName =
      item.name || item.file_name || t('home.recordings.unnamed');

    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.thumbnailWrapper}
            onPress={() => hasVideo && handleOpenRecording(item)}
            disabled={!hasVideo}
            activeOpacity={0.8}
          >
            {thumbnailUri ? (
              <Image source={{ uri: thumbnailUri }} style={styles.thumbnail} />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <MaterialCommunityIcons
                  name="video-outline"
                  size={30}
                  color="#9ca3af"
                />
              </View>
            )}
            {hasVideo && (
              <View style={styles.playBadge}>
                <MaterialCommunityIcons name="play" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.infoColumn}>
            <Text style={styles.name} numberOfLines={2}>
              {displayName}
            </Text>
            {!!item.camera_ip && (
              <Text style={styles.meta}>{`IP: ${item.camera_ip}`}</Text>
            )}
            {!!dateLabel && <Text style={styles.meta}>{dateLabel}</Text>}
            {item.settings_model_choice ? (
              <Text style={styles.meta}>
                {t('home.recordings.lastModel', {
                  model: String(item.settings_model_choice).toUpperCase(),
                })}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => handleOpenRecording(item)}
            style={[styles.actionButton, styles.playButton]}
            disabled={!hasVideo}
          >
            <MaterialCommunityIcons
              name="play-circle-outline"
              size={18}
              color="#1d4ed8"
              style={styles.actionIcon}
            />
            <Text style={styles.playButtonText}>{t('home.recordings.playVideo')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCountAgain(item)}
            style={[styles.actionButton, styles.recountButton]}
            disabled={!hasVideo}
          >
            <MaterialCommunityIcons
              name="counter"
              size={18}
              color="#065f46"
              style={styles.actionIcon}
            />
            <Text style={styles.recountButtonText}>
              {t('home.recordings.countAgain')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('home.recordings.title')}</Text>
        <FlatList
          data={recordingList}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRecordingItem}
          contentContainerStyle={[
            styles.listContent,
            recordingList.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f2f5' },
  container: { flex: 1, padding: 16 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  listContent: { paddingBottom: 20 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row' },
  thumbnailWrapper: {
    width: 96,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  playBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  infoColumn: { flex: 1 },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  actionIcon: { marginRight: 6 },
  playButton: {
    backgroundColor: '#eef2ff',
  },
  playButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  recountButton: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#34d399',
  },
  recountButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#065f46',
  },
});

export default RecordingsScreen;
