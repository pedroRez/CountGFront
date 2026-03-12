import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import CustomActivityIndicator from '../components/CustomActivityIndicator';
import { useCounts } from '../context/CountsContext';
import { useLanguage } from '../context/LanguageContext';

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

const CountsScreen = () => {
  const navigation = useNavigation();
  const { counts, refreshCounts, isLoading } = useCounts();
  const { t } = useLanguage();
  const [thumbnails, setThumbnails] = useState({});

  const countList = useMemo(() => (Array.isArray(counts) ? counts : []), [counts]);

  useFocusEffect(
    useCallback(() => {
      refreshCounts();
    }, [refreshCounts])
  );

  useEffect(() => {
    let isActive = true;
    const missing = countList.filter((count) => {
      if (!count?.local_video_uri) return false;
      const key = String(count.id);
      return !Object.prototype.hasOwnProperty.call(thumbnails, key);
    });

    if (missing.length === 0) return undefined;

    const loadThumbnails = async () => {
      const updates = {};
      for (const count of missing) {
        const key = String(count.id);
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(
            count.local_video_uri,
            { time: 1000 }
          );
          updates[key] = uri;
        } catch (error) {
          updates[key] = null;
        }
      }
      if (!isActive) return;
      setThumbnails((prev) => ({ ...prev, ...updates }));
    };

    loadThumbnails();

    return () => {
      isActive = false;
    };
  }, [countList, thumbnails]);

  const handleOpenCount = (count) => {
    navigation.navigate('ProcessedVideo', { count });
  };

  const handleShareVideo = async (count) => {
    const videoUri = count?.local_video_uri;
    if (!videoUri) {
      Alert.alert(t('common.error'), t('home.counts.noVideo'));
      return;
    }
    const shareUri = toShareableUri(videoUri);
    if (!shareUri) {
      Alert.alert(t('common.error'), t('home.counts.noVideo'));
      return;
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        const info = await FileSystem.getInfoAsync(shareUri);
        if (info?.exists && !info?.isDirectory) {
          await Sharing.shareAsync(shareUri, {
            dialogTitle: count?.name || t('home.counts.unnamed'),
          });
          return;
        }
      }
      const result = await Share.share({
        title: count?.name || t('home.counts.unnamed'),
        url: shareUri,
      });
      if (result?.action !== Share.dismissedAction) return;
    } catch (_error) {
      Alert.alert(
        t('home.counts.shareUnsupportedTitle'),
        t('home.counts.shareUnsupportedMessage')
      );
    }
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      {isLoading ? (
        <CustomActivityIndicator size="large" color="#007AFF" />
      ) : (
        <Text style={styles.emptyText}>{t('home.counts.empty')}</Text>
      )}
    </View>
  );

  const renderCountItem = ({ item }) => {
    const key = String(item.id);
    const thumbnailUri = thumbnails[key] || null;
    const hasVideo = !!item.local_video_uri;
    const totalCount = Number.isFinite(Number(item.total_count))
      ? item.total_count
      : '-';

    const ThumbnailContainer = hasVideo ? TouchableOpacity : View;
    const thumbnailProps = hasVideo
      ? { onPress: () => handleOpenCount(item), activeOpacity: 0.8 }
      : {};

    return (
      <View style={styles.countCard}>
        <View style={styles.countHeader}>
          <ThumbnailContainer style={styles.thumbnailWrapper} {...thumbnailProps}>
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
          </ThumbnailContainer>
          <View style={styles.countInfo}>
            <Text style={styles.countName} numberOfLines={1}>
              {item.name || t('home.counts.unnamed')}
            </Text>
            {!!item.description && (
              <Text style={styles.countDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            {!!item.created_at && (
              <Text style={styles.countDate}>
                {formatDateTime(item.created_at)}
              </Text>
            )}
            <View style={styles.countMetaRow}>
              <Text style={styles.countMetaLabel}>
                {t('home.counts.countLabel')}
              </Text>
              <Text style={styles.countMetaValue}>{totalCount}</Text>
            </View>
          </View>
        </View>
        {hasVideo ? (
          <View style={styles.countActionsRow}>
            <TouchableOpacity
              onPress={() => handleOpenCount(item)}
              style={styles.countPlayButton}
            >
              <MaterialCommunityIcons
                name="play-circle-outline"
                size={18}
                color="#1d4ed8"
                style={styles.playIcon}
              />
              <Text style={styles.countPlayText}>
                {t('home.counts.playVideo')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleShareVideo(item)}
              style={styles.countShareButton}
            >
              <MaterialCommunityIcons
                name="share-variant-outline"
                size={18}
                color="#065f46"
                style={styles.playIcon}
              />
              <Text style={styles.countShareText}>
                {t('home.counts.shareVideo')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.countNoVideo}>{t('home.counts.noVideo')}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('home.counts.title')}</Text>
        <FlatList
          data={countList}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderCountItem}
          contentContainerStyle={[
            styles.listContent,
            countList.length === 0 && styles.listEmpty,
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
  countCard: {
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
  countHeader: { flexDirection: 'row' },
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
  countInfo: { flex: 1 },
  countName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  countDescription: {
    marginTop: 4,
    fontSize: 13,
    color: '#4b5563',
  },
  countDate: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  countMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  countMetaLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  countMetaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  countActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  countPlayButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  playIcon: { marginRight: 6 },
  countPlayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  countShareButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#34d399',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  countShareText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#065f46',
  },
  countNoVideo: {
    marginTop: 10,
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

export default CountsScreen;
