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
import { MaterialCommunityIcons } from '@expo/vector-icons';

const API_BASE_URL = 'http://192.168.0.48:8000'; // CONFIRME SEU IP E PORTA

const BackendProgressBar = ({ progress, text }) => (
  <View style={styles.backendProgressContainer}>
    <Text style={styles.processingInfoText}>{text}</Text>
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
    </View>
    <Text style={styles.progressPercentText}>{Math.round(progress * 100)}%</Text>
  </View>
);

const formatDuration = (millis) => {
  if (millis === null || isNaN(millis) || millis < 0) return '00:00';
  let totalSeconds = Math.floor(millis / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  let str = '';
  if (hours > 0) str += `${pad(hours)}:`;
  str += `${pad(minutes)}:${pad(seconds)}`;
  return str;
};

const ORIENTATIONS = [
  { id: 'S', label: 'Cima ↓ Baixo', description: '(Sul)' },
  { id: 'SE', label: 'Cima ↘ Dir.', description: '(Sudeste)' },
  { id: 'E', label: 'Esq. → Dir.', description: '(Leste)' },
  { id: 'NE', label: 'Baixo ↗ Dir.', description: '(Nordeste)' },
  { id: 'N', label: 'Baixo ↑ Cima', description: '(Norte)' },
  { id: 'NW', label: 'Baixo ↖ Esq.', description: '(Noroeste)' },
  { id: 'W', label: 'Dir. ← Esq.', description: '(Oeste)' },
  { id: 'SW', label: 'Cima ↙ Esq.', description: '(Sudoeste)' },
];

const HomeScreen = ({ navigation, route }) => {
  const [selectedVideoAsset, setSelectedVideoAsset] = useState(null);
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [appStatus, setAppStatus] = useState('idle');
  const [processingVideoName, setProcessingVideoName] = useState(null);
  const [backendProgressData, setBackendProgressData] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [userConsent, setUserConsent] = useState(false);
  const [selectedOrientation, setSelectedOrientation] = useState(null);

  const pollingIntervalRef = useRef(null);
  const appStateListenerRef = useRef(AppState.currentState);

  useFocusEffect(
    React.useCallback(() => {
      if (route.params?.newlyRecordedVideo) {
        const video = route.params.newlyRecordedVideo;
        resetAllStates(); 
        setSelectedVideoAsset(video);
        setAppStatus('selected');
        navigation.setParams({ newlyRecordedVideo: null }); 
      }
    }, [route.params?.newlyRecordedVideo])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateListenerRef.current.match(/inactive|background/) && nextAppState === 'active') {
        if (appStatus === 'polling_progress' && processingVideoName) {
            checkBackendProgress(processingVideoName, true);
        }
      }
      appStateListenerRef.current = nextAppState;
    });
    return () => { subscription.remove(); if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
  }, [appStatus, processingVideoName]);

  const resetAllStates = () => {
    setSelectedVideoAsset(null); setProcessingVideoName(null); setBackendProgressData(null);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = null; setAppStatus('idle'); setIsPickerLoading(false);
    setUserEmail(''); setUserConsent(false); setSelectedOrientation(null);
  };

  const handlePickFromGallery = async () => {
    resetAllStates(); 
    setAppStatus('picking'); 
    setIsPickerLoading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { 
        Alert.alert('Permissão Necessária', 'Acesso à galeria é necessário.'); 
        resetAllStates(); 
        return; 
      }
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'Videos', // <<< CORREÇÃO APLICADA AQUI
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedVideoAsset(result.assets[0]); 
        setAppStatus('selected');
      } else { 
        resetAllStates(); 
      }
    } catch (error) { 
      Alert.alert('Erro', 'Falha ao carregar vídeo da galeria.'); 
      resetAllStates(); 
    }
    setIsPickerLoading(false);
  };

  const navigateToRecordScreen = () => { resetAllStates(); navigation.navigate('RecordVideo'); };

  const handleFileUploadComplete = (uploadResponseData) => {
    if (uploadResponseData && uploadResponseData.nome_arquivo) {
      setProcessingVideoName(uploadResponseData.nome_arquivo);
      triggerBackendProcessing(uploadResponseData.nome_arquivo, selectedOrientation);
    } else {
      Alert.alert('Erro de Upload', 'Informação do arquivo enviado não recebida do backend.');
      setAppStatus('selected');
    }
  };

  const handleFileUploadError = (error) => {
    Alert.alert("Falha no Upload", "O envio do arquivo falhou. Por favor, tente novamente.");
    setAppStatus('selected');
  };
  
  const triggerBackendProcessing = async (nomeArquivo, orientation) => {
    if (!orientation) { Alert.alert("Orientação Necessária", "Por favor, escolha a orientação do movimento."); setAppStatus('selected'); return; }
    setAppStatus('prediction_requested'); setBackendProgressData(null);
    try {
      const payload = { 
          nome_arquivo: nomeArquivo,
          orientation: orientation,
          model_choice: "l", 
          target_classes: ["cow"]
      };
      const response = await axios.post(`${API_BASE_URL}/predict-video/`, payload);
      if (response.data && response.data.status === 'iniciado') {
        setAppStatus('polling_progress');
      } else {
        Alert.alert('Erro ao Iniciar Análise', response.data.message || 'Não foi possível iniciar o processamento.');
        setAppStatus('selected');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Falha ao solicitar o início da análise. Verifique o servidor.';
      Alert.alert('Erro de Comunicação', errorMsg);
      setAppStatus('selected');
    }
  };
  
  const checkBackendProgress = async (videoName, isImmediateCheck = false) => {
    if (!videoName || (appStatus !== 'polling_progress' && !isImmediateCheck)) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        return;
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/progresso/${videoName}`);
      const progressData = response.data;
      if (appStatus !== 'polling_progress') { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); return; }
      setBackendProgressData(progressData);
      if (progressData.finalizado) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        if (progressData.erro) {
          Alert.alert('Erro no Processamento', `O servidor retornou um erro: ${progressData.erro}`);
          resetAllStates();
        } else if (progressData.resultado) {
          let finalMessage = "Análise Concluída!";
          if(userEmail.trim() !== '' && userConsent) { finalMessage = "Análise Concluída & Contribuição Recebida!\n\nObrigado por nos ajudar!"; }
          Alert.alert("Status", finalMessage);
          navigation.navigate('ResultsScreen', { results: progressData.resultado });
          setTimeout(() => resetAllStates(), 500);
        } else { Alert.alert('Processamento Concluído', 'Resultado inválido do backend.'); resetAllStates(); }
      }
    } catch (error) { 
        setBackendProgressData(prev => ({...(prev || {}), erro: "Falha ao obter progresso. Verifique a conexão."}));
    }
  };

  useEffect(() => {
    if (appStatus === 'polling_progress' && processingVideoName) {
      checkBackendProgress(processingVideoName, true); 
      pollingIntervalRef.current = setInterval(() => { checkBackendProgress(processingVideoName); }, 3000);
    }
    return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
  }, [appStatus, processingVideoName]);

  const handleCancelProcessing = async () => {
    if (processingVideoName) {
      try {
        await axios.get(`${API_BASE_URL}/cancelar-processamento/${processingVideoName}`);
        Alert.alert('Cancelado', 'Solicitação de cancelamento da análise enviada.');
      } catch (error) { Alert.alert('Erro', 'Não foi possível enviar solicitação de cancelamento.'); }
      finally { resetAllStates(); }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <Text style={styles.title}>KYO DAY GadoCount</Text>

            {isPickerLoading && <ActivityIndicator size="large" color="#007AFF" style={styles.loader}/>}
            
            {appStatus === 'idle' && (
              <>
                <BigButton title="Escolher Vídeo da Galeria" onPress={handlePickFromGallery} buttonStyle={styles.mainActionButton} />
                <BigButton title="Gravar Novo Vídeo" onPress={navigateToRecordScreen} buttonStyle={styles.mainActionButton} />
              </>
            )}

            {appStatus === 'selected' && selectedVideoAsset && (
              <View style={styles.selectionContainer}>
                <Text style={styles.selectedVideoTitle}>Vídeo Pronto para Análise:</Text>
                <Text style={styles.selectedVideoInfo} numberOfLines={1}>{selectedVideoAsset.fileName || selectedVideoAsset.uri.split('/').pop()}</Text>
                {selectedVideoAsset.duration !== null && <Text style={styles.videoInfoText}>Duração: {formatDuration(selectedVideoAsset.duration)}</Text>}
                
                <View style={styles.contributionSection}>
                  <Text style={styles.contributionTitle}>Ajude a treinar nossa IA!</Text>
                  <Text style={styles.contributionText}>
                    Contribuições úteis dão <Text style={styles.bold}>acesso gratuito futuro</Text> ao app completo!
                  </Text>
                  <TextInput style={styles.emailInput} placeholder="Seu email para contato (opcional)" value={userEmail} onChangeText={setUserEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#888"/>
                  <TouchableOpacity style={[styles.consentTouchable, userConsent && styles.consentTouchableChecked]} onPress={() => setUserConsent(!userConsent)}>
                    <MaterialCommunityIcons name={userConsent ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={26} color={userConsent ? "#28a745" : "#555"} style={styles.checkboxIcon}/>
                    <Text style={styles.consentText}>Concordo em usar este vídeo para treino da IA</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.orientationSection}>
                  <Text style={styles.orientationTitle}>Qual a orientação do movimento do gado no vídeo?</Text>
                  <View style={styles.orientationButtonsContainer}>
                    {ORIENTATIONS.map(orient => (
                      <TouchableOpacity
                        key={orient.id}
                        style={[styles.orientationButton, selectedOrientation === orient.id && styles.orientationButtonSelected]}
                        onPress={() => setSelectedOrientation(orient.id)}
                      >
                        <Text style={[styles.orientationButtonText, selectedOrientation === orient.id && styles.orientationButtonTextSelected]}>
                          {orient.label}{'\n'}
                          <Text style={styles.orientationButtonDesc}>{orient.description}</Text>
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                   {!selectedOrientation && <Text style={styles.orientationWarning}>Selecione uma orientação!</Text>}
                </View>

                <VideoUploadSender
                  videoAsset={selectedVideoAsset}
                  email={userEmail} 
                  consent={userConsent} 
                  orientation={selectedOrientation}
                  onFileUploadComplete={handleFileUploadComplete}
                  onFileUploadError={handleFileUploadError}
                />
                <BigButton title="Cancelar / Escolher Outro" onPress={resetAllStates} buttonStyle={styles.cancelSelectionButton} textStyle={styles.cancelSelectionButtonText}/>
              </View>
            )}
            
            {(appStatus === 'prediction_requested' || appStatus === 'polling_progress') && (
                <View style={styles.processingContainerFull}>
                  <Text style={styles.statusTitle}>
                    {appStatus === 'prediction_requested' 
                      ? 'Solicitando análise ao servidor...' 
                      : 'Analisando vídeo no servidor...'}
                  </Text>
                  {!backendProgressData ? <ActivityIndicator size="large" color="#007AFF" style={{marginVertical: 20}}/> :
                   backendProgressData.erro ? <Text style={styles.errorText}>Erro: {backendProgressData.erro}</Text> : (
                    <>
                      <BackendProgressBar
                        progress={(backendProgressData.frame_atual || 0) / (backendProgressData.total_frames_estimado || 1)}
                        text={`${backendProgressData.frame_atual || 0} de ${backendProgressData.total_frames_estimado || '?'} frames`}
                      />
                      <Text style={styles.etaText}>Status: {backendProgressData.tempo_restante || 'Calculando...'}</Text>
                    </>
                  )}
                  <BigButton title="Cancelar Análise" onPress={handleCancelProcessing} buttonStyle={styles.cancelAnalysisButton} />
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
  videoInfoText: { fontSize: 14, color: '#555', marginBottom: 15, textAlign: 'center' },
  contributionSection: {
    width: '100%', paddingVertical: 15, marginTop: 10, marginBottom: 15,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8e8e8',
  },
  contributionTitle: { fontSize: 17, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#007AFF' },
  contributionText: { fontSize: 14, textAlign: 'center', marginBottom: 15, color: '#444', lineHeight: 20 },
  bold: { fontWeight: 'bold'},
  emailInput: {
    width: '100%', borderWidth: 1, borderColor: '#ced4da', borderRadius: 8,
    paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 14 : 10, 
    fontSize: 16, marginBottom: 15, backgroundColor: '#f8f9fa'
  },
  consentTouchable: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa',
    paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, 
    width: '100%', marginBottom: 5, borderWidth: 1, borderColor: '#ced4da',
  },
  consentTouchableChecked: { backgroundColor: '#e6ffed', borderColor: '#28a745' },
  checkboxIcon: { marginRight: 10 },
  consentText: { fontSize: 14, color: '#495057', flexShrink: 1 },
  consentDetailText: { fontSize: 12, color: '#6c757d', textAlign: 'center', marginTop: 5, paddingHorizontal: 10},
  orientationSection: {
    width: '100%', marginTop: 15, marginBottom: 10, paddingTop: 15,
    borderTopWidth: 1, borderColor: '#e8e8e8',
  },
  orientationTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#333' },
  orientationButtonsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  orientationButton: {
    backgroundColor: '#f0f0f0', paddingVertical: 8, paddingHorizontal: 5, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#ddd', marginVertical: 5, width: '48%', 
    minHeight: 70, alignItems: 'center', justifyContent: 'center',
  },
  orientationButtonSelected: { backgroundColor: '#007AFF', borderColor: '#0056b3' },
  orientationButtonText: { color: '#333', fontSize: 12, textAlign: 'center', fontWeight: 'bold' },
  orientationButtonDesc: { color: '#555', fontSize: 10, textAlign: 'center', marginTop: 3 },
  orientationButtonTextSelected: { color: 'white', fontWeight: 'bold' },
  orientationWarning: {color: 'red', textAlign: 'center', fontSize: 12, marginTop: 5, marginBottom: 10},
  cancelSelectionButton: { backgroundColor: '#6c757d', borderColor: '#6c757d', width: '100%', marginTop: 15 },
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
  progressBarFill: { height: '100%', backgroundColor: '#28a745', borderRadius: 6 },
  progressPercentText: { marginTop: 5, fontSize: 13, color: '#495057' },
  etaText: { marginTop: 8, fontSize: 13, color: '#6c757d', fontStyle: 'italic' },
  errorText: { fontSize: 16, color: '#dc3545', textAlign: 'center', marginBottom:15 },
  cancelAnalysisButton: { backgroundColor: '#dc3545', marginTop: 20, width: '100%' },
  tutorialButton: { backgroundColor: '#6c757d', width: '100%', marginTop: 20 }
});

export default HomeScreen;