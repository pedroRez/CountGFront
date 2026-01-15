import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  useWindowDimensions,
  Platform,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '../components/BigButton'; // Ajuste o caminho se o seu BigButton estiver em outro lugar
import { useLanguage } from '../context/LanguageContext';

// Props:
// - navigation: Navigation object (automatically provided by React Navigation)
// - onComplete: Callback function (passed from App.js via AppNavigator for the initial onboarding)
// - isInitial: Boolean (passed from AppNavigator, true if this is the initial onboarding)
const OnboardingScreen = ({ navigation, onComplete, isInitial = false }) => {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const imageWidth = width * 0.85; // Largura das imagens/diagramas na tela
  const [shouldRenderImages, setShouldRenderImages] = useState(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setShouldRenderImages(true);
    });
    return () => handle.cancel();
  }, []);

  const renderIllustration = (source, sizeStyle) => {
    if (!shouldRenderImages) {
      return (
        <View style={[styles.image, styles.imagePlaceholder, sizeStyle]} />
      );
    }
    return (
      <Image
        source={source}
        style={[styles.image, sizeStyle]}
        resizeMode="contain"
        resizeMethod="resize"
      />
    );
  };

  const handleButtonPress = () => {
    if (isInitial && typeof onComplete === 'function') {
      // If this is the initial onboarding and onComplete was provided, call it.
      // This function (in App.js) updates AsyncStorage and the isFirstLaunch state.
      console.log('OnboardingScreen: Concluindo onboarding inicial.');
      onComplete();
    } else {
      // For revisits (from HomeScreen) or if onComplete wasn't provided,
      // simply go back to the previous screen (usually HomeScreen).
      console.log('OnboardingScreen: Returning after revisiting the tutorial.');
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        // Fallback in case it can't go back (e.g., if this is the only screen in the stack)
        // Ideally there is always a screen to return to in this revisit scenario.
        navigation.replace('Home');
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContentContainer}
      >
        <View style={styles.container}>
          <Text style={styles.mainTitle}>{t('onboarding.mainTitle')}</Text>
          <Text style={styles.mainSubtitle}>
            {t('onboarding.mainSubtitle')}
          </Text>

          {/* Section 1: Camera Positioning */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('onboarding.section1.title')}
            </Text>
            <Text style={styles.sectionText}>
              {t('onboarding.section1.text')}
            </Text>

            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            {renderIllustration(
              require('../assets/images/camera_positioning.png'),
              { width: imageWidth, height: imageWidth * 0.6 }
            )}

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>⬆️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section1.point1.label')}
                </Text>
                {t('onboarding.section1.point1.text')}
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>🎯</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section1.point2.label')}
                </Text>
                {t('onboarding.section1.point2.text')}
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>🚫</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section1.point3.label')}
                </Text>
                {t('onboarding.section1.point3.text')}
              </Text>
            </View>
            <Text style={styles.tipText}>
              <Text style={styles.bold}>
                {t('onboarding.section1.tip.label')}
              </Text>
              {t('onboarding.section1.tip.text')}
            </Text>
          </View>

          {/* Section 2: Filming Tips */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('onboarding.section2.title')}
            </Text>

            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            {renderIllustration(require('../assets/images/filming_tips.png'), {
              width: imageWidth,
              height: imageWidth * 0.5,
            })}

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>➡️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section2.point1.label')}
                </Text>
                {t('onboarding.section2.point1.text')}
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>☀️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section2.point2.label')}
                </Text>
                {t('onboarding.section2.point2.text')}
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>⏱️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section2.point3.label')}
                </Text>
                {t('onboarding.section2.point3.text')}
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>✨</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section2.point4.label')}
                </Text>
                {t('onboarding.section2.point4.text')}
              </Text>
            </View>
          </View>

          {/* Section 3: How Counting Works */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('onboarding.section3.title')}
            </Text>

            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            {renderIllustration(
              require('../assets/images/counting_line.png'),
              { width: imageWidth, height: imageWidth * 0.4 }
            )}

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>↔️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section3.point1.label')}
                </Text>
                {t('onboarding.section3.point1.text')}
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>↕️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section3.point2.label')}
                </Text>
                {t('onboarding.section3.point2.text')}
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>✅</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>
                  {t('onboarding.section3.point3.label')}
                </Text>
                {t('onboarding.section3.point3.text')}
              </Text>
            </View>
          </View>

          <BigButton
            title={
              isInitial
                ? t('onboarding.buttonStart')
                : t('onboarding.buttonBack')
            } // Dynamic button text
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
  scrollView: {
    flex: 1,
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
  imagePlaceholder: {
    backgroundColor: '#e9ecef',
  },
  image: {
    // Estilo para quando você adicionar a imagem real
    alignSelf: 'center',
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
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
