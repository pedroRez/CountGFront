import React from 'react';
import { ActivityIndicator, Platform } from 'react-native';

const CustomActivityIndicator = (props) => {
  // Adjustment logic:
  // If the 'size' prop is "large" and the OS is Android,
  // use the numeric value 50; otherwise, use the original value.
  const size =
    props.size === 'large' && Platform.OS === 'android' ? 50 : props.size;

  // Return the standard ActivityIndicator, passing all original props
  // but with our corrected 'size' value.
  return <ActivityIndicator {...props} size={size} />;
};

export default CustomActivityIndicator;
