import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider'; // UI para selecao de tempo
import { useOrientationMap } from '../context/OrientationMapContext';
import { useLanguage } from '../context/LanguageContext';

const MIN_GAP_SECONDS = 0.1;
const LINE_RATIO_STEP = 0.05;

const buildOrientationStyleMap = (t) => ({
  E: {
    lineStyle: 'vertical',
    arrowDirection: 'right',
    label: t('common.orientation.leftToRight'),
  },
  W: {
    lineStyle: 'vertical',
    arrowDirection: 'left',
    label: t('common.orientation.rightToLeft'),
  },
  S: {
    lineStyle: 'horizontal',
    arrowDirection: 'down',
    label: t('common.orientation.topToBottom'),
  },
  N: {
    lineStyle: 'horizontal',
    arrowDirection: 'up',
    label: t('common.orientation.bottomToTop'),
  },
});

const ARROW_TEXT_MAP = {
  right: '->',
  left: '<-',
  up: '^',
  down: 'v',
};

const ARROW_ICON_MAP = {
  right: 'arrow-right-bold-outline',
  left: 'arrow-left-bold-outline',
  up: 'arrow-up-bold-outline',
  down: 'arrow-down-bold-outline',
};

const buildFallbackOrientations = (orientationStyleMap) => [
  {
    id: 'E',
    label: orientationStyleMap.E.label,
    arrowText: ARROW_TEXT_MAP.right,
    lineStyle: orientationStyleMap.E.lineStyle,
    arrowDirection: orientationStyleMap.E.arrowDirection,
  },
  {
    id: 'W',
    label: orientationStyleMap.W.label,
    arrowText: ARROW_TEXT_MAP.left,
    lineStyle: orientationStyleMap.W.lineStyle,
    arrowDirection: orientationStyleMap.W.arrowDirection,
  },
  {
    id: 'S',
    label: orientationStyleMap.S.label,
    arrowText: ARROW_TEXT_MAP.down,
    lineStyle: orientationStyleMap.S.lineStyle,
    arrowDirection: orientationStyleMap.S.arrowDirection,
  },
  {
    id: 'N',
    label: orientationStyleMap.N.label,
    arrowText: ARROW_TEXT_MAP.up,
    lineStyle: orientationStyleMap.N.lineStyle,
    arrowDirection: orientationStyleMap.N.arrowDirection,
  },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const clampRatio = (value) => clamp(value, 0, 1);

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (num) => String(num).padStart(2, '0');
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  return `${pad(minutes)}:${pad(secs)}`;
};

const buildOrientationOptions = (
  orientationMap,
  fallbackOrientations,
  styleMap
) => {
  if (!orientationMap || typeof orientationMap !== 'object') {
    return fallbackOrientations;
  }

  const entries = Object.entries(orientationMap);
  if (entries.length === 0) {
    return fallbackOrientations;
  }

  return entries.map(([id, data]) => {
    const style = styleMap[id] || {
      lineStyle: 'vertical',
      arrowDirection: 'right',
      label: id,
    };
    const arrowText = data?.arrow || ARROW_TEXT_MAP[style.arrowDirection] || '';
    return {
      id,
      label: data?.label || style.label || id,
      arrowText,
      lineStyle: style.lineStyle,
      arrowDirection: style.arrowDirection,
    };
  });
};

/**
 * Screen allowing the user to mark start/end while previewing the video.
 * The selected range is sent to the Home screen for backend trimming.
 */
export default function VideoEditorScreen({ route, navigation }) {
  const { asset } = route.params || {};
  const { orientationMap, fetchOrientationMap } = useOrientationMap();
  const { t } = useLanguage();
  const initialDuration = asset?.duration ?? 0;
  const initialDurationSeconds =
    initialDuration > 1000 ? initialDuration / 1000 : initialDuration;

  const initialLineRatio = (() => {
    const parsed = Number(asset?.linePositionRatio);
    return Number.isFinite(parsed) ? clampRatio(parsed) : 0.5;
  })();

  const orientationStyleMap = useMemo(() => buildOrientationStyleMap(t), [t]);
  const fallbackOrientations = useMemo(
    () => buildFallbackOrientations(orientationStyleMap),
    [orientationStyleMap]
  );

  const [durationSeconds, setDurationSeconds] = useState(initialDurationSeconds);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(initialDurationSeconds);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedOrientationId, setSelectedOrientationId] = useState(
    asset?.orientation || fallbackOrientations[0].id
  );
  const [linePositionRatio, setLinePositionRatio] = useState(initialLineRatio);

  const safeDurationSeconds = Math.max(0, durationSeconds);
  const videoRef = useRef(null);

  useEffect(() => {
    fetchOrientationMap();
  }, [fetchOrientationMap]);

  const orientationOptions = useMemo(
    () =>
      buildOrientationOptions(
        orientationMap,
        fallbackOrientations,
        orientationStyleMap
      ),
    [orientationMap, fallbackOrientations, orientationStyleMap]
  );

  useEffect(() => {
    if (!orientationOptions.length) return;
    const exists = orientationOptions.some(
      (option) => option.id === selectedOrientationId
    );
    if (!exists) {
      setSelectedOrientationId(orientationOptions[0].id);
    }
  }, [orientationOptions, selectedOrientationId]);

  const selectedOrientation =
    orientationOptions.find((option) => option.id === selectedOrientationId) ||
    orientationOptions[0];

  const handlePlaybackStatusUpdate = (status) => {
    if (!status || !status.isLoaded) return;
    setCurrentTime(status.positionMillis / 1000);
    setIsPlaying(status.isPlaying);

    if (status.durationMillis && status.durationMillis > 0) {
      const nextDuration = status.durationMillis / 1000;
      if (Math.abs(nextDuration - durationSeconds) > 0.01) {
        setDurationSeconds(nextDuration);
      }
    }
  };

  useEffect(() => {
    setEndTime((prev) => {
      if (safeDurationSeconds === 0) return prev;
      if (prev === 0 || prev > safeDurationSeconds) return safeDurationSeconds;
      return prev;
    });
    setStartTime((prev) =>
      clamp(prev, 0, Math.max(0, safeDurationSeconds - MIN_GAP_SECONDS))
    );
  }, [safeDurationSeconds]);

  const handleStartChange = (value) => {
    const maxStart = Math.max(0, endTime - MIN_GAP_SECONDS);
    setStartTime(clamp(value, 0, maxStart));
  };

  const handleEndChange = (value) => {
    const minEnd = Math.min(safeDurationSeconds, startTime + MIN_GAP_SECONDS);
    setEndTime(clamp(value, minEnd, safeDurationSeconds));
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  const handleTogglePlayback = async () => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  const handleSeekToStart = async () => {
    if (!videoRef.current) return;
    await videoRef.current.setPositionAsync(Math.max(startTime, 0) * 1000);
  };

  const handleSeekToEnd = async () => {
    if (!videoRef.current) return;
    await videoRef.current.setPositionAsync(Math.max(endTime, 0) * 1000);
  };

  const handleMarkStart = () => {
    const nextStart = clamp(currentTime, 0, safeDurationSeconds);
    let nextEnd = endTime;
    if (nextEnd <= nextStart + MIN_GAP_SECONDS) {
      nextEnd = clamp(
        nextStart + MIN_GAP_SECONDS,
        nextStart,
        safeDurationSeconds
      );
    }
    setStartTime(nextStart);
    setEndTime(nextEnd);
  };

  const handleMarkEnd = () => {
    const nextEnd = clamp(currentTime, 0, safeDurationSeconds);
    let nextStart = startTime;
    if (nextEnd <= nextStart + MIN_GAP_SECONDS) {
      nextStart = clamp(nextEnd - MIN_GAP_SECONDS, 0, nextEnd);
    }
    setStartTime(nextStart);
    setEndTime(nextEnd);
  };

  const handleCycleOrientation = () => {
    if (!orientationOptions.length) return;
    const currentIndex = orientationOptions.findIndex(
      (option) => option.id === selectedOrientationId
    );
    const nextIndex =
      currentIndex >= 0
        ? (currentIndex + 1) % orientationOptions.length
        : 0;
    setSelectedOrientationId(orientationOptions[nextIndex].id);
  };

  const handleLineShift = (delta) => {
    setLinePositionRatio((prev) => {
      const nextValue = clampRatio(Number((prev + delta).toFixed(2)));
      return nextValue;
    });
  };

  const handleConfirm = () => {
    if (!asset?.uri) {
      Alert.alert(t('common.error'), t('videoEditor.videoNotFoundMessage'));
      return;
    }

    const safeStart = clamp(startTime, 0, safeDurationSeconds);
    const safeEnd = clamp(endTime, safeStart + MIN_GAP_SECONDS, safeDurationSeconds);
    const durationSecondsValue = safeEnd - safeStart;
    if (durationSecondsValue <= 0) {
      Alert.alert(t('common.error'), t('videoEditor.invalidTrimMessage'));
      return;
    }

    const trimmedAsset = {
      uri: asset.uri,
      duration: durationSecondsValue * 1000,
      fileName: asset?.fileName || asset.uri.split('/').pop(),
      mimeType: asset?.mimeType || 'video/mp4',
      orientation: selectedOrientationId,
      linePositionRatio: clampRatio(Number(linePositionRatio.toFixed(2))),
      trimStartMs: Math.round(safeStart * 1000),
      trimEndMs: Math.round(safeEnd * 1000),
    };

    navigation.navigate('Home', { trimmedVideo: trimmedAsset });
  };

  const orientationLabel =
    selectedOrientation?.label ||
    selectedOrientationId ||
    t('videoEditor.orientationNotDefined');
  const orientationArrowText = selectedOrientation?.arrowText
    ? ` ${selectedOrientation.arrowText}`
    : '';
  const lineStyle = selectedOrientation?.lineStyle || 'vertical';
  const arrowDirection = selectedOrientation?.arrowDirection || 'right';
  const linePositionPercent = `${linePositionRatio * 100}%`;
  const linePositionStyle =
    lineStyle === 'vertical'
      ? { left: linePositionPercent, transform: [{ translateX: -1 }] }
      : { top: linePositionPercent, transform: [{ translateY: -1 }] };
  const arrowPositionStyle =
    lineStyle === 'vertical'
      ? {
          left: linePositionPercent,
          top: '50%',
          transform: [{ translateX: -24 }, { translateY: -24 }],
        }
      : {
          top: linePositionPercent,
          left: '50%',
          transform: [{ translateX: -24 }, { translateY: -24 }],
        };
  const decrementIcon = lineStyle === 'vertical' ? 'chevron-left' : 'chevron-up';
  const incrementIcon = lineStyle === 'vertical' ? 'chevron-right' : 'chevron-down';

  return (
    <View style={styles.container}>
      <View style={styles.videoWrapper}>
        <Video
          ref={videoRef}
          source={{ uri: asset?.uri }}
          style={styles.editor}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={false}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          progressUpdateIntervalMillis={200}
        />
        <View pointerEvents="none" style={styles.overlay}>
          {lineStyle === 'vertical' ? (
            <View style={[styles.verticalLine, linePositionStyle]} />
          ) : (
            <View style={[styles.horizontalLine, linePositionStyle]} />
          )}
          <View style={[styles.arrowContainer, arrowPositionStyle]}>
            <MaterialCommunityIcons
              name={ARROW_ICON_MAP[arrowDirection] || ARROW_ICON_MAP.right}
              size={44}
              color="rgba(255, 230, 0, 0.85)"
            />
          </View>
        </View>
      </View>

      <View style={styles.controlsContainer}>
        <Text style={styles.timeText}>
          {t('videoEditor.timeLabel', {
            current: formatTime(currentTime),
            total: formatTime(safeDurationSeconds),
          })}
        </Text>
        <View style={styles.playbackRow}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleTogglePlayback}
          >
            <Text style={styles.controlButtonText}>
              {isPlaying ? t('videoEditor.pause') : t('videoEditor.play')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleSeekToStart}
          >
            <Text style={styles.controlButtonText}>
              {t('videoEditor.seekStart')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleSeekToEnd}
          >
            <Text style={styles.controlButtonText}>
              {t('videoEditor.seekEnd')}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.markRow}>
          <TouchableOpacity style={styles.markButton} onPress={handleMarkStart}>
            <Text style={styles.markButtonText}>
              {t('videoEditor.markStart')}
            </Text>
            <Text style={styles.markValue}>{formatTime(startTime)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.markButton} onPress={handleMarkEnd}>
            <Text style={styles.markButtonText}>
              {t('videoEditor.markEnd')}
            </Text>
            <Text style={styles.markValue}>{formatTime(endTime)}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.lineAdjustRow}>
          <TouchableOpacity
            style={styles.lineAdjustButton}
            onPress={() => handleLineShift(-LINE_RATIO_STEP)}
          >
            <MaterialCommunityIcons name={decrementIcon} size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.lineAdjustLabel}>
            <Text style={styles.lineAdjustText}>
              {t('videoEditor.lineLabel', {
                value: linePositionRatio.toFixed(2),
              })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.lineAdjustButton}
            onPress={() => handleLineShift(LINE_RATIO_STEP)}
          >
            <MaterialCommunityIcons name={incrementIcon} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.orientationRow}>
          <TouchableOpacity
            style={styles.orientationButton}
            onPress={handleCycleOrientation}
          >
            <MaterialCommunityIcons
              name="axis-arrow"
              size={18}
              color="#fff"
              style={styles.orientationIcon}
            />
            <Text style={styles.orientationButtonText}>
              {orientationLabel}{orientationArrowText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sliderContainer}>
        <Text style={styles.sliderLabel}>
          {t('videoEditor.sliderStart', { value: formatTime(startTime) })}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={safeDurationSeconds}
          value={startTime}
          onValueChange={handleStartChange}
          tapToSeek
        />
        <Text style={styles.sliderLabel}>
          {t('videoEditor.sliderEnd', { value: formatTime(endTime) })}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={safeDurationSeconds}
          value={endTime}
          onValueChange={handleEndChange}
          tapToSeek
        />
      </View>

      {/* Future placeholder for direction selection */}
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          {t('videoEditor.placeholderDirection')}
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={handleCancel}
        >
          <Text style={styles.buttonText}>{t('videoEditor.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.confirmButton]}
          onPress={handleConfirm}
        >
          <Text style={styles.buttonText}>{t('videoEditor.confirm')}</Text>
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
  videoWrapper: {
    flex: 1,
  },
  editor: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalLine: {
    position: 'absolute',
    width: 2,
    height: '90%',
    backgroundColor: 'rgba(255, 230, 0, 0.4)',
    borderRadius: 2,
  },
  horizontalLine: {
    position: 'absolute',
    height: 2,
    width: '90%',
    backgroundColor: 'rgba(255, 230, 0, 0.4)',
    borderRadius: 2,
  },
  arrowContainer: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: 6,
    borderRadius: 24,
  },
  controlsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  timeText: {
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 14,
  },
  playbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  controlButton: {
    flex: 1,
    backgroundColor: '#1f2937',
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  markRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  markButton: {
    flex: 1,
    backgroundColor: '#111827',
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  markButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  markValue: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
  },
  lineAdjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  lineAdjustButton: {
    width: 40,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineAdjustLabel: {
    paddingHorizontal: 12,
  },
  lineAdjustText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  orientationRow: {
    marginTop: 10,
    alignItems: 'center',
  },
  orientationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  orientationIcon: {
    marginRight: 8,
  },
  orientationButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  sliderContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  slider: {
    width: Dimensions.get('window').width - 32,
    height: 40,
  },
  sliderLabel: {
    color: '#fff',
    textAlign: 'center',
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
