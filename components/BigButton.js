import React from 'react';
import { Text, Pressable, StyleSheet, View } from 'react-native';
// Se for usar ícones do Expo:
// import { MaterialCommunityIcons } from '@expo/vector-icons';

const BigButton = ({
  title,
  onPress,
  buttonStyle,
  textStyle,
  iconName,
  iconFamily,
  iconSize = 22,
  iconColor = 'white',
  disabled = false,
}) => {
  // const IconComponent = iconFamily; // Ex: MaterialCommunityIcons

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        buttonStyle,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
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
    backgroundColor: '#007AFF', // Cor primária
    paddingVertical: 16,
    paddingHorizontal: 25,
    borderRadius: 12,
    marginVertical: 12,
    minWidth: '85%',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }]
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600', // Um pouco menos "bold" que 'bold'
    textAlign: 'center',
  },
});

export default BigButton;