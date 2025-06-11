// screens/UploadScreen.js
// Esta tela seria usada se você quisesse uma etapa intermediária
// após selecionar o vídeo e antes de mostrar os resultados,
// por exemplo, para mostrar um preview do vídeo, confirmar, e depois enviar.
// A HomeScreen atual já tem uma lógica para isso.
// Se a HomeScreen já faz o suficiente, esta tela pode não ser necessária.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// import { Video } from 'expo-av';
// import BigButton from '../components/BigButton';
import CustomActivityIndicator from '../components/CustomActivityIndicator';

const UploadScreen = ({ route, navigation }) => {
  // const { videoUri } = route.params;
  // const [isUploading, setIsUploading] = React.useState(false);
  // const [uploadProgress, setUploadProgress] = React.useState(0);

  // React.useEffect(() => {
  //   handleUpload();
  // }, []);

  // const handleUpload = async () => {
  //   setIsUploading(true);
  //   // Lógica de upload com axios e onUploadProgress
  //   // ...
  //   // Após upload e processamento:
  //   // navigation.replace('ResultsScreen', { results: ... });
  //   setIsUploading(false);
  // };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Processando Vídeo</Text>
        {/* {videoUri && (
          <Video
            source={{ uri: videoUri }}
            rate={1.0}
            volume={1.0}
            isMuted={true}
            resizeMode="contain"
            shouldPlay
            isLooping
            style={styles.videoPreview}
          />
        )} */}
        <CustomActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.statusText}>Enviando e analisando seu vídeo...</Text>
        {/* <Text>Progresso: {uploadProgress}%</Text> */}
        {/* <BigButton title="Cancelar" onPress={() => navigation.goBack()} /> */}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  videoPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
    marginBottom: 20,
    borderRadius: 8,
  },
  statusText: {
    marginTop: 15,
    fontSize: 16,
    color: '#555',
  }
});

export default UploadScreen;