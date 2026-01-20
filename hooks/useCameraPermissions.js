import { useEffect, useState } from 'react';
import * as ExpoCameraModule from 'expo-camera';

export const useCameraPermissions = ({ includeMicrophone = true } = {}) => {
  const [hasPermission, setHasPermission] = useState(null);
  const [isRequesting, setIsRequesting] = useState(true);

  const requestPermissions = async () => {
    setIsRequesting(true);
    try {
      const { status: cameraStatus } =
        await ExpoCameraModule.Camera.requestCameraPermissionsAsync();
      const { status: audioStatus } = includeMicrophone
        ? await ExpoCameraModule.Camera.requestMicrophonePermissionsAsync()
        : { status: 'granted' };
      const granted =
        cameraStatus === 'granted' && audioStatus === 'granted';
      setHasPermission(granted);
      return granted;
    } finally {
      setIsRequesting(false);
    }
  };

  useEffect(() => {
    requestPermissions();
  }, [includeMicrophone]);

  return { hasPermission, isRequesting, requestPermissions };
};
