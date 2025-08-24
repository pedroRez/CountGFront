import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';
import { useApi } from '../context/ApiContext';

export async function pickAndUploadVideo() {
  const { apiUrl } = useApi();
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
    });

    if (result.canceled) return;

    const video = result.assets[0];

    const formData = new FormData();
    formData.append('file', {
      uri: video.uri,
      name: 'entrada.mp4', // usa sempre o mesmo nome
      type: 'video/mp4',
    });

    const response = await axios.post(apiUrl, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    console.log('Bois detectados:', response.data.count);
  } catch (err) {
    console.error('Erro ao enviar vídeo:', err);
  }
}
