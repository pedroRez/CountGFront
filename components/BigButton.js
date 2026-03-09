import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import tokens from '../theme/tokens';
// If using icons from Expo:
// import { MaterialCommunityIcons } from '@expo/vector-icons';

const BigButton = ({
  title,
  onPress,
  buttonStyle,
  textStyle,
  iconName,
  iconFamily,
  iconSize = 22,
  iconColor = tokens.colors.onPrimary,
  disabled = false,
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  ...pressableProps
}) => {
  // const IconComponent = iconFamily; // e.g., MaterialCommunityIcons

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.button,
        buttonStyle,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
      {...pressableProps}
    >
      {/* {IconComponent && iconName && (
        <IconComponent name={iconName} size={iconSize} color={iconColor} style={styles.icon} />
      )} */}
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primary,
    paddingVertical: tokens.spacing.xl,
    paddingHorizontal: 25,
    borderRadius: tokens.radius.md,
    marginVertical: tokens.spacing.lg,
    minWidth: '85%',
    elevation: 3,
    shadowColor: tokens.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: tokens.spacing.md,
  },
  text: {
    color: tokens.colors.onPrimary,
    ...tokens.typography.button,
    textAlign: 'center',
  },
});

export default BigButton;
