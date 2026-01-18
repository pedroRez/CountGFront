import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

const MenuButton = ({ label, icon, onPress, index }) => {
  // Animation values
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  // Entry animation with delay
  useEffect(() => {
    const delay = index * 100; // 100ms delay for each button
    scale.value = withTiming(1, { duration: 500 }, () => {
      // Optional callback at the end
    });
    opacity.value = withTiming(1, { duration: 700 });
  }, []);

  // Press animation
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const pressingStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: withTiming(scale.value, { duration: 50 }) }],
    };
  });

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => (scale.value = withTiming(0.9, { duration: 100 }))}
        onPressOut={() => (scale.value = withTiming(1, { duration: 100 }))}
        style={({ pressed }) => [styles.pressable]}
      >
        <MaterialCommunityIcons name={icon} size={48} color="#007AFF" />
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
    backgroundColor: '#fff',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 5,
  },
  label: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});

export default MenuButton;
