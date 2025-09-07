import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';
import { useApi } from '../context/ApiContext';

export const usePickAndUploadVideo = (apiUrlOverride) => {
  const { apiUrl: contextApiUrl } = useApi();
  const apiUrl = apiUrlOverride || contextApiUrl;

  const pickAndUploadVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
      });

      if (result.canceled) return;

      const video = result.assets[0];

      const formData = new FormData();
      formData.append('file', {
        uri: video.uri,
        name: 'entrada.mp4', // always use the same name
        type: 'video/mp4',
      });

      const response = await axios.post(apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('Cattle detected:', response.data.count);
    } catch (err) {
      console.error('Error sending video:', err);
    }
  };

  return pickAndUploadVideo;
};
