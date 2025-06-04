import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '../components/BigButton'; // Ajuste o caminho se o seu BigButton estiver em outro lugar

// Props:
// - navigation: Objeto de navegação (passado automaticamente pelo React Navigation)
// - onComplete: Função callback (passada de App.js via AppNavigator para o onboarding inicial)
// - isInitial: Booleano (passado de AppNavigator, true se for o onboarding inicial)
const OnboardingScreen = ({ navigation, onComplete, isInitial = false }) => {
  const { width } = useWindowDimensions();
  const imageWidth = width * 0.85; // Largura das imagens/diagramas na tela

  const handleButtonPress = () => {
    if (isInitial && typeof onComplete === 'function') {
      // Se for o onboarding inicial e a função onComplete foi fornecida, chama ela.
      // Esta função (em App.js) irá atualizar o AsyncStorage e o estado isFirstLaunch.
      console.log("OnboardingScreen: Concluindo onboarding inicial.");
      onComplete();
    } else {
      // Se for uma revisita (acessada pela HomeScreen) ou onComplete não foi fornecido.
      // Simplesmente volta para a tela anterior (que deve ser a HomeScreen).
      console.log("OnboardingScreen: Voltando após revisita do tutorial.");
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        // Fallback caso não possa voltar (ex: se por algum motivo for a única tela na stack)
        // O ideal é que sempre haja uma tela para voltar neste cenário de revisita.
        navigation.replace('Home'); 
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContentContainer}>
        <View style={styles.container}>
          <Text style={styles.mainTitle}>Guia Rápido: Filmando seu Gado!</Text>
          <Text style={styles.mainSubtitle}>
            Siga estas dicas para garantir uma contagem precisa e eficiente com nosso app.
          </Text>

          {/* Seção 1: Posicionamento da Câmera */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📸 1. Posicionamento Ideal da Câmera</Text>
            <Text style={styles.sectionText}>
              A câmera deve estar bem posicionada para uma visão clara e de cima da passagem do gado.
            </Text>
            
            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            <Image 
              source={require('../assets/images/camera_positioning.png')} // Crie esta imagem!
              style={[styles.image, { width: imageWidth, height: imageWidth * 0.6 }]} // Ajuste a altura conforme sua imagem
              resizeMode="contain" 
            /> 
            
            

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>⬆️</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Visão de Cima (Top-Down):</Text> Posicione a câmera diretamente ACIMA da porteira ou corredor. A visão deve ser de cima para baixo, o mais reto possível.</Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>🎯</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Cobertura Total:</Text> Garanta que a câmera filme TODA a largura da passagem onde o gado irá cruzar. Nenhum animal deve passar por fora do campo de visão.</Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>🚫</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Câmera Estável:</Text> Use um suporte, tripé ou fixe a câmera de forma segura. Vídeos tremidos prejudicam a precisão!</Text>
            </View>
            <Text style={styles.tipText}>
              <Text style={styles.bold}>Dica de Altura:</Text> Para uma porteira padrão de ~3 metros de largura, uma altura de câmera entre 2 a 3 metros geralmente oferece um bom enquadramento com a maioria dos celulares. Teste para encontrar o ideal para seu equipamento e porteira.
            </Text>
          </View>

          {/* Seção 2: Dicas de Filmagem */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎬 2. Dicas para uma Filmagem Eficaz</Text>
            
            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            <Image 
              source={require('../assets/images/filming_tips.png')} // Crie esta imagem!
              style={[styles.image, { width: imageWidth, height: imageWidth * 0.5 }]} 
              resizeMode="contain" 
            /> 
            

             <View style={styles.point}>
              <Text style={styles.pointEmoji}>➡️</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Passagem Completa:</Text> Filme cada animal passando COMPLETAMENTE pela área visível, do momento que entra até o momento que sai do enquadramento da câmera.</Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>☀️</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Boa Iluminação:</Text> Prefira filmar com boa luz natural e uniforme. Evite o sol diretamente na lente, sombras muito fortes sobre os animais ou escuridão excessiva.</Text>
            </View>
             <View style={styles.point}>
              <Text style={styles.pointEmoji}>⏱️</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Foco no Momento Certo:</Text> Grave apenas o período de passagem do gado. Evite vídeos desnecessariamente longos antes ou depois do evento.</Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>✨</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Qualidade de Vídeo:</Text> Use uma boa qualidade (ex: HD 720p ou Full HD 1080p). Arquivos muito grandes (4K por muito tempo) podem demorar mais para enviar e processar.</Text>
            </View>
          </View>

          {/* Seção 3: Como a Contagem Funciona */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>  Como a Contagem Funciona</Text>
            
            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
             <Image 
              source={require('../assets/images/counting_line.png')} // Crie esta imagem!
              style={[styles.image, { width: imageWidth, height: imageWidth * 0.4 }]}
              resizeMode="contain" 
            /> 
           

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>↔️</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Linha de Contagem Virtual:</Text> Nosso sistema utiliza uma linha de referência no seu vídeo para detectar quando um animal cruza.</Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>↕️</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Direção do Movimento:</Text> É importante que o gado se mova em uma direção principal (ex: da esquerda para a direita, ou de cima para baixo na tela) ao cruzar a linha. O app poderá perguntar essa direção ou usar um padrão.</Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>✅</Text>
              <Text style={styles.pointText}><Text style={styles.bold}>Contagem Única:</Text> Cada animal que cruzar a linha na direção configurada será contado uma única vez.</Text>
            </View>
          </View>

          <BigButton
            title={isInitial ? "Entendi, Começar!" : "Voltar"} // Texto do botão dinâmico
            onPress={handleButtonPress}
            buttonStyle={styles.completeButton}
            textStyle={styles.completeButtonText}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f4f8', 
  },
  scrollContentContainer: {
    paddingBottom: 30, 
  },
  container: {
    paddingHorizontal: Platform.OS === 'ios' ? 20 : 15, // Ajuste de padding para iOS e Android
    paddingTop: 20,
  },
  mainTitle: {
    fontSize: Platform.OS === 'ios' ? 28 : 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#2c3e50', // Azul escuro
  },
  mainSubtitle: {
    fontSize: Platform.OS === 'ios' ? 17 : 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#555e68', // Cinza escuro
    paddingHorizontal: 10,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: Platform.OS === 'ios' ? 20 : 18,
    marginBottom: 25,
    elevation: 3, // Sombra Android
    shadowColor: '#000000', // Sombra iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: Platform.OS === 'ios' ? 22 : 20,
    fontWeight: 'bold',
    marginBottom: 18,
    color: '#007AFF', 
  },
  sectionText: {
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    lineHeight: 24,
    color: '#34495e', // Azul acinzentado
    marginBottom: 15,
  },
  imagePlaceholderContainer: { // Novo container para o placeholder
    width: '100%',
    aspectRatio: 16/9, // Proporção comum, ajuste conforme suas imagens
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 15,
    padding: 10,
  },
  imagePlaceholder: { // Estilo do texto placeholder
    textAlign: 'center',
    color: '#6c757d',
    fontSize: 14,
  },
  image: { // Estilo para quando você adicionar a imagem real
    alignSelf: 'center',
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Alinha o emoji com o topo do texto
    marginBottom: 15,
  },
  pointEmoji: {
    fontSize: 22,
    marginRight: 12,
    color: '#007AFF', // Cor do emoji para destaque
    lineHeight: 26, // Para alinhar melhor com o texto
  },
  pointText: {
    flex: 1,
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    lineHeight: 24,
    color: '#34495e',
  },
  tipText: {
    fontSize: Platform.OS === 'ios' ? 14.5 : 13.5,
    fontStyle: 'italic',
    color: '#555e68',
    marginTop: 10,
    backgroundColor: '#eef7ff', // Fundo azul claro para dica
    padding: 12,
    borderRadius: 8,
    lineHeight: 20,
  },
  bold: {
    fontWeight: 'bold',
  },
  completeButton: {
    backgroundColor: '#4CAF50', // Verde
    marginTop: 20,
  },
  completeButtonText: {
    fontSize: 18,
  },
});

export default OnboardingScreen;