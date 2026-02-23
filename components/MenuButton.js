import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import tokens from '../theme/tokens';

const MenuButton = ({
  label,
  icon,
  onPress,
  index,
  accessibilityLabel,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
}) => {
  // Animation values
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  // Entry animation with delay
  useEffect(() => {
    const delay = index * 100; // 100ms delay for each button
    scale.value = withTiming(1, { duration: 500, delay });
    opacity.value = withTiming(1, { duration: 700, delay });
  }, [index, opacity, scale]);

  // Press animation
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => (scale.value = withTiming(0.9, { duration: 100 }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: 100 }))}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        hitSlop={hitSlop}
      >
        <MaterialCommunityIcons
          name={icon}
          size={48}
          color={tokens.colors.primary}
        />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '46%', // Fits two per row with space in between
    aspectRatio: 1, // Keep the button square
    margin: '2%',
  },
  pressable: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 5,
  },
  label: {
    marginTop: tokens.spacing.md,
    ...tokens.typography.body,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
});

export default MenuButton;
