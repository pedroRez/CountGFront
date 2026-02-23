import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import tokens from '../theme/tokens';

// This component receives the title as a prop
const CustomHeader = ({ title }) => {
  const navigation = useNavigation();

  return (
    // Use a View as the main container with top padding to offset the status bar
    <View style={styles.container}>
      {/* Empty view on the left to help center the title */}
      <View style={styles.sideComponent} />

      {/* Screen title */}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {/* Settings button on the right */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Settings')}
        style={styles.sideComponent}
      >
        <MaterialCommunityIcons
          name="cog-outline"
          size={28}
          color={tokens.colors.primary}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Top padding pushes the content below the status bar
    paddingTop: Platform.OS === 'android' ? 40 : 50,
    paddingBottom: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  title: {
    ...tokens.typography.title,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
    flex: 1, // Allows the title to take the center space
  },
  sideComponent: {
    width: tokens.spacing.side, // Fixed width for side components
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CustomHeader;
