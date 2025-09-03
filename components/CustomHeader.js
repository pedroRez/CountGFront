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
        <MaterialCommunityIcons name="cog-outline" size={28} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Top padding pushes the content below the status bar
    paddingTop: Platform.OS === 'android' ? 40 : 50,
    paddingBottom: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8F8', // Header background color
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1c1c1e',
    textAlign: 'center',
    flex: 1, // Allows the title to take the center space
  },
  sideComponent: {
    width: 40, // Fixed width for side components
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CustomHeader;
