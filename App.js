// App.js
import React, { useState } from 'react';
import { View, Text, Button, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

export default function App() {
  const [image, setImage] = useState(null);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickImageFromGallery = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setCount(null);
    }
  };

  const takePhotoWithCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão negada', 'Permita acesso à câmera para tirar fotos.');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setCount(null);
    }
  };

  const uploadImage = async () => {
    if (!image) return;
    setLoading(true);

    const formData = new FormData();
    formData.append('file', {
      uri: image,
      name: 'photo.jpg',
      type: 'image/jpeg',
    });

    try {
      const response = await axios.post('http://<SEU_BACKEND_LOCAL>:8000/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCount(response.data.count);
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar imagem.');
    }

    setLoading(false);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Button title="Escolher da Galeria" onPress={pickImageFromGallery} />
      <View style={{ height: 10 }} />
      <Button title="Tirar Foto com Câmera" onPress={takePhotoWithCamera} />
      {image && (
        <Image source={{ uri: image }} style={{ width: 300, height: 300, marginVertical: 20 }} />
      )}
      {image && <Button title="Enviar para Contagem" onPress={uploadImage} />}
      {loading && <ActivityIndicator size="large" style={{ marginTop: 20 }} />}
      {count !== null && <Text style={{ marginTop: 20, fontSize: 18 }}>Animais detectados: {count}</Text>}
    </View>
  );
}
