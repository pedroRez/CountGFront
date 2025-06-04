// screens/HomeScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, 
  TextInput, AppState, KeyboardAvoidingView, Platform, TouchableOpacity 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '../components/BigButton';
import VideoUploadSender from '../components/VideoUploadSender';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons'; // Para o checkbox simulado

const API_BASE_URL = 'http://192.168.0.48:8000'; // CONFIRME ESTE IP E PORTA!

const BackendProgressBar = ({ progress, text }) => (
  <View style={styles.backendProgressContainer}>
    <Text style={styles.processingInfoText}>{text}</Text>
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: '#4CAF50' }]} />
    </View>
    <Text style={styles.progressPercentText}>{Math.round(progress * 100)}%</Text>
  </View>
);

const formatDuration = (millis) => {
  if (millis === null || millis === undefined || isNaN(millis)) return 'N/A';
  let totalSeconds = Math.floor(millis / 1000);
  if (totalSeconds < 0) totalSeconds = 0; // Garante que não seja negativo

  let days = Math.floor(totalSeconds / (3600 * 24));
  totalSeconds %= (3600 * 24);
  let hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;

  const pad = (num) => String(num).padStart(2, '0');
  let str = '';
  if (days > 0) {
    str += `${String(days).padStart(3, '0')}:`;
    str += `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  } else if (hours > 0) {
    str += `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    str += `${pad(minutes)}:${pad(seconds)}`;
  }
  return str;
};

const HomeScreen = ({ navigation, route }) => {
  const [selectedVideoAsset, setSelectedVideoAsset] = useState(null);
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [appStatus, setAppStatus] = useState('idle');
  const [processingVideoName, setProcessingVideoName] = useState(null);
  const [backendProgressData, setBackendProgressData] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [userConsent, setUserConsent] = useState(false);

  const pollingIntervalRef = useRef(null);
  const appStateListenerRef = useRef(null); // Para remover o listener corretamente

  useFocusEffect(
    React.useCallback(() => {
      if (route.params?.newlyRecordedVideo) {
        const video = route.params.newlyRecordedVideo;
        console.log("HomeScreen: Vídeo gravado recebido -> ", video.uri);
        // Limpa estados anteriores antes de setar o novo vídeo
        resetAllStates(); 
        setSelectedVideoAsset(video);
        setAppStatus('selected');
        navigation.setParams({ newlyRecordedVideo: null });
      }
    }, [route.params?.newlyRecordedVideo, navigation])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appStateListenerRef.current && appStateListenerRef.current.match(/inactive|background/) && nextAppState === 'active') {
        if (appStatus === 'polling_progress' && processingVideoName) {
          checkBackendProgress(processingVideoName, true);
        }
      }
      appStateListenerRef.current = nextAppState;
    });
    return () => {
      subscription.remove();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [appStatus, processingVideoName]);

  const resetAllStates = () => {
    setSelectedVideoAsset(null);
    setProcessingVideoName(null);
    setBackendProgressData(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null;
    setAppStatus('idle');
    setIsPickerLoading(false);
    setUserEmail('');
    setUserConsent(false);
  };

  const handlePickFromGallery = async () => {
    resetAllStates();
    setAppStatus('picking');
    setIsPickerLoading(true);
    try {
      const libPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libPermission.status !== 'granted') {
        Alert.alert('Permissão Necessária', 'Acesso à galeria é necessário.');
        resetAllStates(); return;
      }
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedVideoAsset(result.assets[0]);
        setAppStatus('selected');
      } else { resetAllStates(); }
    } catch (error) { console.error("Picker Error:", error); Alert.alert('Erro', 'Falha ao carregar vídeo.'); resetAllStates(); }
    setIsPickerLoading(false);
  };

  const navigateToRecordScreen = () => {
    resetAllStates();
    navigation.navigate('RecordVideo');
  };

  const handleFileUploadComplete = async (uploadResponseData) => {
    if (uploadResponseData && uploadResponseData.nome_arquivo) {
      setProcessingVideoName(uploadResponseData.nome_arquivo);
      setAppStatus('prediction_requested');
      triggerBackendProcessing(uploadResponseData.nome_arquivo);
    } else {
      Alert.alert('Erro de Upload', 'Informação do arquivo enviado não recebida do backend.');
      setAppStatus('selected');
    }
  };

  const handleFileUploadError = (error) => {
    setAppStatus('selected');
  };

  const triggerBackendProcessing = async (nomeArquivo) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/predict-video/`, { nome_arquivo: nomeArquivo });
      if (response.data && response.data.status === 'iniciado') {
        setAppStatus('polling_progress');
      } else {
        Alert.alert('Erro', response.data.message || 'Não foi possível iniciar o processamento.');
        setAppStatus('selected');
      }
    } catch (error) {
      console.error("Erro ao solicitar predição:", error.response ? error.response.data : error.message);
      Alert.alert('Erro de Comunicação', 'Falha ao solicitar o início da análise.');
      setAppStatus('selected');
    }
  };
  
  const checkBackendProgress = async (videoName, isImmediateCheck = false) => {
    if (!videoName) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/progresso/${videoName}`);
      const progressData = response.data;
      
      // Verifica se o polling ainda deve continuar
      if (appStatus !== 'polling_progress' && !isImmediateCheck) {
        console.log("Polling interrompido, estado do app mudou.");
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        return;
      }
      
      setBackendProgressData(progressData);

      if (progressData.finalizado) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        
        if (progressData.erro) {
          Alert.alert('Erro no Processamento', `Detalhe: ${progressData.erro}`);
          resetAllStates();
        } else if (progressData.resultado) {
          if(userEmail.trim() !== '' && userConsent && selectedVideoAsset) {
            Alert.alert("Análise Concluída e Contribuição Recebida!", "Obrigado por nos ajudar a treinar a IA! Entraremos em contato sobre seu acesso gratuito.");
          } else {
            Alert.alert("Análise Concluída!");
          }
          navigation.navigate('ResultsScreen', { results: progressData.resultado });
          setTimeout(() => resetAllStates(), 500);
        } else { Alert.alert('Processamento Concluído', 'Resultado não encontrado ou inválido.'); resetAllStates(); }
      }
    } catch (error) { 
      console.error("Erro ao buscar progresso:", error.response ? error.response.data : error.message);
      // Não resetar o estado aqui para permitir que o polling continue tentando por um tempo
      // A menos que seja um erro que indique que o vídeo não existe mais, etc.
      setBackendProgressData(prev => ({...prev, erro: "Falha ao buscar progresso. Verifique a conexão."}));
    }
  };

  useEffect(() => {
    if (appStatus === 'polling_progress' && processingVideoName) {
      checkBackendProgress(processingVideoName, true); 
      pollingIntervalRef.current = setInterval(() => {
        // Garante que só continua se o estado ainda for polling_progress
        if(appStatus === 'polling_progress' && processingVideoName) {
            checkBackendProgress(processingVideoName);
        } else {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        }
      }, 5000);
    } else {
      if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }
    }
    return () => { if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); }};
  }, [appStatus, processingVideoName]);

  const handleCancelProcessing = async () => {
    if (processingVideoName) {
      try {
        await axios.get(`${API_BASE_URL}/cancelar-processamento/${processingVideoName}`);
        Alert.alert('Cancelado', 'Solicitação de cancelamento enviada.');
      } catch (error) { Alert.alert('Erro', 'Não foi possível cancelar.'); console.error("Erro ao cancelar:", error); }
      finally { resetAllStates(); }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.container}>
            <Text style={styles.title}>Contador de Gado IA</Text>

            {isPickerLoading && appStatus === 'picking' && <ActivityIndicator size="large" color="#007AFF" style={styles.loader}/>}

            {appStatus === 'idle' && (
              <>
                <BigButton title="Escolher Vídeo da Galeria" onPress={handlePickFromGallery} buttonStyle={styles.mainActionButton} />
                <BigButton title="Gravar Novo Vídeo" onPress={navigateToRecordScreen} buttonStyle={styles.mainActionButton} />
              </>
            )}

            {appStatus === 'selected' && selectedVideoAsset && (
              <View style={styles.selectionContainer}>
                <Text style={styles.selectedVideoTitle}>Vídeo Pronto para Análise:</Text>
                <Text style={styles.selectedVideoInfo} numberOfLines={1} ellipsizeMode="middle">
                  {selectedVideoAsset.fileName || selectedVideoAsset.uri.split('/').pop()}
                </Text>
                {selectedVideoAsset.duration !== null && selectedVideoAsset.duration !== undefined && (
                  <Text style={styles.videoInfoText}>Duração: {formatDuration(selectedVideoAsset.duration)}</Text>
                )}
                
                <View style={styles.contributionSection}>
                  <Text style={styles.contributionTitle}>Ajude a treinar nossa IA!</Text>
                  <Text style={styles.contributionText}>
                    Seu vídeo pode melhorar a contagem. Contribuições úteis dão acesso gratuito futuro ao app completo!
                  </Text>
                  <TextInput
                    style={styles.emailInput}
                    placeholder="Seu email para contato (opcional)"
                    value={userEmail}
                    onChangeText={setUserEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#888"
                  />
                  <TouchableOpacity 
                    style={[styles.consentTouchable, userConsent && styles.consentTouchableChecked]}
                    onPress={() => setUserConsent(!userConsent)}
                  >
                    <MaterialCommunityIcons 
                        name={userConsent ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} 
                        size={26} 
                        color={userConsent ? "#28a745" : "#555"} 
                    />
                    <Text style={styles.consentText}>Concordo em usar este vídeo para treino da IA</Text>
                  </TouchableOpacity>
                  <Text style={styles.consentDetailText}>Seu vídeo será usado anonimamente para melhorar a IA.</Text>
                </View>

                <VideoUploadSender
                  videoAsset={selectedVideoAsset}
                  email={userEmail} 
                  consent={userConsent} 
                  onFileUploadComplete={handleFileUploadComplete}
                  onFileUploadError={handleFileUploadError}
                />
                <BigButton title="Cancelar / Escolher Outro" onPress={resetAllStates} buttonStyle={styles.cancelSelectionButton} textStyle={styles.cancelSelectionButtonText}/>
              </View>
            )}
            
            {(appStatus === 'prediction_requested' || appStatus === 'polling_progress') && backendProgressData && (
                <View style={styles.processingContainerFull}>
                  <Text style={styles.statusTitle}>
                    {appStatus === 'prediction_requested' ? 'Solicitando análise...' : 'Analisando vídeo no servidor...'}
                  </Text>
                  {backendProgressData.erro ? ( <Text style={styles.errorText}>Erro: {backendProgressData.erro}</Text> ) : (
                    <>
                      <BackendProgressBar
                        progress={(backendProgressData.frame_atual || 0) / (backendProgressData.total_frames_estimado || 1)}
                        text={`${backendProgressData.frame_atual || 0} de ${backendProgressData.total_frames_estimado || '?'} frames processados`}
                      />
                      <Text style={styles.etaText}>
                        Tempo restante estimado: {backendProgressData.tempo_restante || 'Calculando...'}
                      </Text>
                    </>
                  )}
                  <BigButton title="Cancelar Análise" onPress={handleCancelProcessing} buttonStyle={styles.cancelAnalysisButton} />
                </View>
            )}
            {appStatus === 'processing_error' && (  
                <View style={styles.processingContainerFull}>
                    <Text style={styles.errorText}>Ocorreu um erro ao processar o vídeo.</Text>
                    <BigButton title="Selecionar Outro Vídeo" onPress={resetAllStates} />
                </View>
            )}

            {(appStatus === 'idle' || appStatus === 'selected') && (
               <BigButton
                  title="Como Filmar (Tutorial)"
                  onPress={() => navigation.navigate('OnboardingTutorial')}
                  buttonStyle={styles.tutorialButton}
               />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', paddingVertical: 10 },
  container: { alignItems: 'center', paddingHorizontal: 15 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 25, textAlign: 'center', color: '#2c3e50' },
  loader: { marginVertical: 20 },
  mainActionButton: { width: '100%', marginBottom: 15, backgroundColor: '#007AFF' },
  selectionContainer: {
    alignItems: 'center', marginVertical: 15, width: '100%', padding: 20,
    backgroundColor: '#fff', borderRadius: 12, elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
  selectedVideoTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 10, textAlign: 'center' },
  selectedVideoInfo: { fontSize: 14, color: '#555', marginBottom: 5, textAlign: 'center', paddingHorizontal: 10 },
  videoInfoText: { fontSize: 14, color: '#555', marginBottom: 20, textAlign: 'center' },
  contributionSection: {
    width: '100%', paddingVertical: 15, marginTop: 10, marginBottom: 20,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8e8e8',
  },
  contributionTitle: { fontSize: 17, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#007AFF' },
  contributionText: { fontSize: 14, textAlign: 'center', marginBottom: 15, color: '#444', lineHeight: 20 },
  emailInput: {
    width: '100%', borderWidth: 1, borderColor: '#ced4da', borderRadius: 8,
    paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 14 : 10, 
    fontSize: 16, marginBottom: 15, backgroundColor: '#f8f9fa'
  },
  consentTouchable: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent',
    paddingVertical: 10, paddingHorizontal: 5, borderRadius: 8, width: '100%', marginBottom: 5,
  },
  consentTouchableChecked: { /* pode adicionar um fundo se quiser diferenciar mais */ },
  consentText: { marginLeft: 10, fontSize: 14, color: '#495057', flexShrink: 1 },
  consentDetailText: { fontSize: 12, color: '#6c757d', textAlign: 'center', marginTop: 0, paddingHorizontal: 10},
  cancelSelectionButton: { backgroundColor: '#6c757d', borderColor: '#6c757d', width: '100%', marginTop: 10 },
  cancelSelectionButtonText: { color: '#ffffff', fontWeight: '600' },
  processingContainerFull: { 
    marginVertical: 20, padding: 20, width: '100%', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  statusTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, color: '#007AFF' },
  backendProgressContainer: { width: '100%', alignItems: 'center', marginBottom:10 },
  processingInfoText: { marginBottom: 8, fontSize: 15, color: '#333' }, 
  progressBarContainer: { height: 12, width: '100%', backgroundColor: '#e9ecef', borderRadius: 6, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#28a745', borderRadius: 6 }, // Verde para progresso do backend
  progressPercentText: { marginTop: 5, fontSize: 13, color: '#495057' },
  etaText: { marginTop: 8, fontSize: 13, color: '#6c757d', fontStyle: 'italic' },
  errorText: { fontSize: 16, color: '#dc3545', textAlign: 'center', marginBottom:15 },
  cancelAnalysisButton: { backgroundColor: '#dc3545', marginTop: 20, width: '100%' },
  tutorialButton: { backgroundColor: '#6c757d', width: '100%', marginTop: 20 }
});

export default HomeScreen;