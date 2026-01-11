import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Pressable,
  PanResponder,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrientationMap } from '../context/OrientationMapContext';
import { useLanguage } from '../context/LanguageContext';

const MIN_GAP_SECONDS = 0.1;
const LINE_RATIO_STEP = 0.05;
const DOUBLE_TAP_DELAY_MS = 260;
const SEEK_STEP_SECONDS = 10;
const VIDEO_FRAME_PADDING = 12;
const SCRUB_KNOB_SIZE = 14;
const SCRUB_LINE_INSET = 10;
const SCRUB_MARKER_WIDTH = 2;
const SCRUB_RESET_VELOCITY = 1.2;
const SCRUB_RESET_MIN_DISTANCE = 24;

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
  const insets = useSafeAreaInsets();
  const initialDuration =
    asset?.originalDurationMs ?? asset?.duration ?? 0;
  const initialDurationSeconds =
    initialDuration > 1000 ? initialDuration / 1000 : initialDuration;

  const initialLineRatio = (() => {
    const parsed = Number(asset?.linePositionRatio);
    return Number.isFinite(parsed) ? clampRatio(parsed) : 0.5;
  })();

  const initialTrimStartSeconds = Number.isFinite(asset?.trimStartMs)
    ? asset.trimStartMs / 1000
    : 0;
  const initialTrimEndSeconds = Number.isFinite(asset?.trimEndMs)
    ? asset.trimEndMs / 1000
    : initialDurationSeconds;
  const safeInitialStart = clamp(
    initialTrimStartSeconds,
    0,
    initialDurationSeconds
  );
  const safeInitialEnd = clamp(
    initialTrimEndSeconds,
    safeInitialStart + MIN_GAP_SECONDS,
    initialDurationSeconds
  );
  const initialAspectRatio = (() => {
    const width = Number(asset?.width);
    const height = Number(asset?.height);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return width / height;
    }
    const screen = Dimensions.get('window');
    return screen.width >= screen.height ? 16 / 9 : 9 / 16;
  })();

  const orientationStyleMap = useMemo(() => buildOrientationStyleMap(t), [t]);
  const fallbackOrientations = useMemo(
    () => buildFallbackOrientations(orientationStyleMap),
    [orientationStyleMap]
  );

  const [durationSeconds, setDurationSeconds] = useState(initialDurationSeconds);
  const [startTime, setStartTime] = useState(safeInitialStart);
  const [endTime, setEndTime] = useState(safeInitialEnd);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedOrientationId, setSelectedOrientationId] = useState(
    asset?.orientation || fallbackOrientations[0].id
  );
  const [linePositionRatio, setLinePositionRatio] = useState(initialLineRatio);
  const [videoAspectRatio, setVideoAspectRatio] = useState(initialAspectRatio);
  const [videoContainerSize, setVideoContainerSize] = useState({
    width: 0,
    height: 0,
  });
  const [videoWidth, setVideoWidth] = useState(0);
  const [scrubBarWidth, setScrubBarWidth] = useState(0);

  const safeDurationSeconds = Math.max(0, durationSeconds);
  const videoRef = useRef(null);
  const tapTimeoutRef = useRef(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    fetchOrientationMap();
  }, [fetchOrientationMap]);

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, []);

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

  const seekToSeconds = useCallback(
    async (nextSeconds) => {
      if (!videoRef.current || safeDurationSeconds <= 0) return;
      const clampedSeconds = clamp(nextSeconds, 0, safeDurationSeconds);
      setCurrentTime(clampedSeconds);
      await videoRef.current.setPositionAsync(clampedSeconds * 1000);
    },
    [safeDurationSeconds]
  );

  const handleSeekBy = useCallback(
    async (deltaSeconds) => {
      if (!videoRef.current || safeDurationSeconds <= 0) return;
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      const currentSeconds = status.positionMillis / 1000;
      await seekToSeconds(currentSeconds + deltaSeconds);
    },
    [safeDurationSeconds, seekToSeconds]
  );

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

  const handleVideoContainerLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    const safeWidth = Math.max(0, width - VIDEO_FRAME_PADDING * 2);
    const safeHeight = Math.max(0, height - VIDEO_FRAME_PADDING * 2);
    setVideoContainerSize((prev) => {
      if (prev.width === safeWidth && prev.height === safeHeight) return prev;
      return { width: safeWidth, height: safeHeight };
    });
  };

  const handleVideoLayout = (event) => {
    setVideoWidth(event.nativeEvent.layout.width);
  };

  const handleReadyForDisplay = (event) => {
    const naturalSize =
      event?.naturalSize || event?.nativeEvent?.naturalSize || {};
    const width = Number(naturalSize.width);
    const height = Number(naturalSize.height);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      setVideoAspectRatio(width / height);
    }
  };

  const handleScrubBarLayout = (event) => {
    setScrubBarWidth(event.nativeEvent.layout.width);
  };

  const handleVideoPress = (event) => {
    const now = Date.now();
    const elapsed = now - lastTapRef.current;
    const locationX = event?.nativeEvent?.locationX ?? 0;

    if (elapsed < DOUBLE_TAP_DELAY_MS) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = 0;
      const isRightSide = videoWidth ? locationX > videoWidth / 2 : true;
      const delta = isRightSide ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS;
      void handleSeekBy(delta);
      return;
    }

    lastTapRef.current = now;
    tapTimeoutRef.current = setTimeout(() => {
      void handleTogglePlayback();
      tapTimeoutRef.current = null;
      lastTapRef.current = 0;
    }, DOUBLE_TAP_DELAY_MS);
  };

  const handleScrubTouch = useCallback(
    (locationX) => {
      if (!scrubBarWidth || safeDurationSeconds <= 0) return;
      const range = Math.max(
        1,
        scrubBarWidth - SCRUB_KNOB_SIZE - SCRUB_LINE_INSET * 2
      );
      const nextRatio = clampRatio(
        (locationX - SCRUB_LINE_INSET - SCRUB_KNOB_SIZE / 2) / range
      );
      const nextSeconds = nextRatio * safeDurationSeconds;
      void seekToSeconds(nextSeconds);
    },
    [scrubBarWidth, safeDurationSeconds, seekToSeconds]
  );

  const handleScrubRelease = useCallback(
    (gestureState) => {
      if (
        Math.abs(gestureState.vx) >= SCRUB_RESET_VELOCITY &&
        Math.abs(gestureState.dx) >= SCRUB_RESET_MIN_DISTANCE
      ) {
        void seekToSeconds(0);
      }
    },
    [seekToSeconds]
  );

  const scrubPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          handleScrubTouch(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          handleScrubTouch(event.nativeEvent.locationX);
        },
        onPanResponderRelease: (_, gestureState) => {
          handleScrubRelease(gestureState);
        },
        onPanResponderTerminate: (_, gestureState) => {
          handleScrubRelease(gestureState);
        },
      }),
    [handleScrubRelease, handleScrubTouch]
  );

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
      originalDurationMs: Math.round(safeDurationSeconds * 1000),
      trimStartMs: Math.round(safeStart * 1000),
      trimEndMs: Math.round(safeEnd * 1000),
    };

    navigation.navigate('Home', { trimmedVideo: trimmedAsset });
  };

  const videoFrameStyle = useMemo(() => {
    if (
      !videoContainerSize.width ||
      !videoContainerSize.height ||
      !videoAspectRatio
    ) {
      return null;
    }
    const containerRatio =
      videoContainerSize.width / videoContainerSize.height;
    if (videoAspectRatio >= containerRatio) {
      const width = videoContainerSize.width;
      const height = width / videoAspectRatio;
      return { width, height };
    }
    const height = videoContainerSize.height;
    const width = height * videoAspectRatio;
    return { width, height };
  }, [videoAspectRatio, videoContainerSize]);

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
  const scrubRatio = safeDurationSeconds
    ? clampRatio(currentTime / safeDurationSeconds)
    : 0;
  const startRatio = safeDurationSeconds
    ? clampRatio(startTime / safeDurationSeconds)
    : 0;
  const endRatio = safeDurationSeconds
    ? clampRatio(endTime / safeDurationSeconds)
    : 0;
  const scrubRange = Math.max(
    0,
    scrubBarWidth - SCRUB_KNOB_SIZE - SCRUB_LINE_INSET * 2
  );
  const scrubKnobLeft = scrubRange
    ? scrubRatio * scrubRange + SCRUB_LINE_INSET
    : SCRUB_LINE_INSET;
  const markerBase =
    SCRUB_LINE_INSET + SCRUB_KNOB_SIZE / 2 - SCRUB_MARKER_WIDTH / 2;
  const startMarkerLeft = markerBase + startRatio * scrubRange;
  const endMarkerLeft = markerBase + endRatio * scrubRange;

  const buttonRowStyle = useMemo(
    () => ({ paddingBottom: Math.max(16, insets.bottom + 12) }),
    [insets.bottom]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoWrapper} onLayout={handleVideoContainerLayout}>
        <Pressable
          style={[styles.videoFrame, videoFrameStyle]}
          onPress={handleVideoPress}
          onLayout={handleVideoLayout}
        >
          <Video
            ref={videoRef}
            source={{ uri: asset?.uri }}
            style={styles.editor}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onReadyForDisplay={handleReadyForDisplay}
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
            {!isPlaying && (
              <View style={styles.playOverlay}>
                <MaterialCommunityIcons name="play" size={36} color="#fff" />
              </View>
            )}
          </View>
        </Pressable>
      </View>

      <View style={styles.controlsContainer}>
        <Text style={styles.timeText}>
          {t('videoEditor.timeLabel', {
            current: formatTime(currentTime),
            total: formatTime(safeDurationSeconds),
          })}
        </Text>
        <View style={styles.scrubRow}>
          <View
            style={styles.scrubBar}
            onLayout={handleScrubBarLayout}
            {...scrubPanResponder.panHandlers}
          >
            <View style={styles.scrubLine} />
            <View
              style={[
                styles.scrubMarker,
                styles.scrubMarkerStart,
                { left: startMarkerLeft },
              ]}
            />
            <View
              style={[
                styles.scrubMarker,
                styles.scrubMarkerEnd,
                { left: endMarkerLeft },
              ]}
            />
            <View style={[styles.scrubKnob, { left: scrubKnobLeft }]} />
          </View>
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
        <View style={styles.adjustmentsRow}>
          <View style={styles.lineAdjustGroup}>
            <TouchableOpacity
              style={styles.lineAdjustButton}
              onPress={() => handleLineShift(-LINE_RATIO_STEP)}
            >
              <MaterialCommunityIcons
                name={decrementIcon}
                size={22}
                color="#fff"
              />
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
              <MaterialCommunityIcons
                name={incrementIcon}
                size={22}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.orientationButton}
            onPress={handleCycleOrientation}
          >
            <MaterialCommunityIcons
              name="axis-arrow"
              size={20}
              color="#fff"
              style={styles.orientationIcon}
            />
            <Text style={styles.orientationButtonText}>
              {orientationLabel}{orientationArrowText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.buttonRow, buttonRowStyle]}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoWrapper: {
    flex: 1,
    padding: VIDEO_FRAME_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFrame: {
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#050505',
  },
  editor: {
    flex: 1,
    width: '100%',
    height: '100%',
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
  playOverlay: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
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
  scrubRow: {
    marginBottom: 10,
  },
  scrubBar: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'transparent',
    justifyContent: 'center',
  },
  scrubLine: {
    position: 'absolute',
    left: SCRUB_LINE_INSET,
    right: SCRUB_LINE_INSET,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    top: '50%',
    transform: [{ translateY: -1 }],
  },
  scrubKnob: {
    position: 'absolute',
    width: SCRUB_KNOB_SIZE,
    height: SCRUB_KNOB_SIZE,
    borderRadius: SCRUB_KNOB_SIZE / 2,
    backgroundColor: '#fff',
    top: '50%',
    transform: [{ translateY: -SCRUB_KNOB_SIZE / 2 }],
  },
  scrubMarker: {
    position: 'absolute',
    width: SCRUB_MARKER_WIDTH,
    top: 6,
    bottom: 6,
    borderRadius: 1,
  },
  scrubMarkerStart: {
    backgroundColor: '#22c55e',
  },
  scrubMarkerEnd: {
    backgroundColor: '#ef4444',
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
  lineAdjustButton: {
    width: 48,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineAdjustLabel: {
    paddingHorizontal: 8,
  },
  lineAdjustText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  adjustmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  lineAdjustGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 10,
  },
  orientationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    minHeight: 44,
  },
  orientationIcon: {
    marginRight: 8,
  },
  orientationButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
