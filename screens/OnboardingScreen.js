import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '../components/BigButton'; // Ajuste o caminho se o seu BigButton estiver em outro lugar

// Props:
// - navigation: Navigation object (automatically provided by React Navigation)
// - onComplete: Callback function (passed from App.js via AppNavigator for the initial onboarding)
// - isInitial: Boolean (passed from AppNavigator, true if this is the initial onboarding)
const OnboardingScreen = ({ navigation, onComplete, isInitial = false }) => {
  const { width } = useWindowDimensions();
  const imageWidth = width * 0.85; // Largura das imagens/diagramas na tela

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
      <ScrollView contentContainerStyle={styles.scrollContentContainer}>
        <View style={styles.container}>
          <Text style={styles.mainTitle}>
            Quick Guide: Filming Your Cattle!
          </Text>
          <Text style={styles.mainSubtitle}>
            Follow these tips to ensure accurate and efficient counting with our
            app.
          </Text>

          {/* Section 1: Camera Positioning */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              📸 1. Ideal Camera Positioning
            </Text>
            <Text style={styles.sectionText}>
              Position the camera for a clear top-down view of the cattle
              passage.
            </Text>

            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            <Image
              source={require('../assets/images/camera_positioning.png')} // Crie esta imagem!
              style={[
                styles.image,
                { width: imageWidth, height: imageWidth * 0.6 },
              ]} // Ajuste a altura conforme sua imagem
              resizeMode="contain"
            />

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>⬆️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Top-Down View:</Text> Place the camera
                directly ABOVE the gate or corridor. The view should be straight
                down as much as possible.
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>🎯</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Full Coverage:</Text> Ensure the
                camera captures the entire width of the passage where the cattle
                will cross. No animal should leave the field of view.
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>🚫</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Stable Camera:</Text> Use a mount,
                tripod, or secure the camera firmly. Shaky videos reduce
                accuracy!
              </Text>
            </View>
            <Text style={styles.tipText}>
              <Text style={styles.bold}>Height Tip:</Text> For a standard gate
              around 3 meters wide, a camera height between 2 and 3 meters
              usually provides good framing with most phones. Test to find the
              ideal setup for your equipment and gate.
            </Text>
          </View>

          {/* Section 2: Filming Tips */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              🎬 2. Tips for Effective Filming
            </Text>

            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            <Image
              source={require('../assets/images/filming_tips.png')} // Crie esta imagem!
              style={[
                styles.image,
                { width: imageWidth, height: imageWidth * 0.5 },
              ]}
              resizeMode="contain"
            />

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>➡️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Full Passage:</Text> Film each animal
                fully crossing the visible area, from entry until it leaves the
                camera frame.
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>☀️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Good Lighting:</Text> Film with good,
                even natural light. Avoid the sun directly in the lens, strong
                shadows over the animals, or excessive darkness.
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>⏱️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Focus on the Right Moment:</Text>
                Record only the period when the cattle are passing. Avoid
                unnecessarily long videos before or after the event.
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>✨</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Video Quality:</Text> Use a good
                quality (e.g., HD 720p or Full HD 1080p). Very large files (4K
                for long periods) may take longer to upload and process.
              </Text>
            </View>
          </View>

          {/* Section 3: How Counting Works */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}> How the Counting Works</Text>

            {/* SUBSTITUA O TEXTO ABAIXO PELA SUA IMAGEM/DIAGRAMA REAL */}
            <Image
              source={require('../assets/images/counting_line.png')} // Crie esta imagem!
              style={[
                styles.image,
                { width: imageWidth, height: imageWidth * 0.4 },
              ]}
              resizeMode="contain"
            />

            <View style={styles.point}>
              <Text style={styles.pointEmoji}>↔️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Virtual Counting Line:</Text> Our
                system uses a reference line in your video to detect when an
                animal crosses.
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>↕️</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Movement Direction:</Text> It is
                important that the cattle move primarily in one direction (e.g.,
                left to right or top to bottom on the screen) when crossing the
                line. The app may ask for this direction or use a default.
              </Text>
            </View>
            <View style={styles.point}>
              <Text style={styles.pointEmoji}>✅</Text>
              <Text style={styles.pointText}>
                <Text style={styles.bold}>Single Count:</Text> Each animal
                crossing the line in the configured direction is counted once.
              </Text>
            </View>
          </View>

          <BigButton
            title={isInitial ? "Got it, let's start!" : 'Back'} // Dynamic button text
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
  imagePlaceholderContainer: {
    // Novo container para o placeholder
    width: '100%',
    aspectRatio: 16 / 9, // Common ratio; adjust according to your images
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 15,
    padding: 10,
  },
  imagePlaceholder: {
    // Estilo do texto placeholder
    textAlign: 'center',
    color: '#6c757d',
    fontSize: 14,
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
