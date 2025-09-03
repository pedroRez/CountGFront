import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '../components/BigButton';

const ResultsScreen = ({ route, navigation }) => {
  const { results } = route.params; // Recebe os resultados da navegação

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Resultado da Análise</Text>

        <View style={styles.resultsCard}>
          <Text style={styles.resultLabel}>Vídeo Original:</Text>
          <Text style={styles.resultValue}>{results.video}</Text>

          <Text style={styles.resultLabel}>Vídeo Processado (Nome):</Text>
          <Text style={styles.resultValue}>{results.video_processado}</Text>

          <Text style={styles.resultLabel}>Total de Frames:</Text>
          <Text style={styles.resultValue}>{results.total_frames}</Text>

          <View style={styles.totalCountContainer}>
            <Text style={styles.totalCountLabel}>Total de Gado Contado:</Text>
            <Text style={styles.totalCountValue}>{results.total_count}</Text>
          </View>

          {results.por_classe && Object.keys(results.por_classe).length > 0 && (
            <View>
              <Text style={styles.resultLabel}>Detalhes por Classe:</Text>
              {Object.entries(results.por_classe).map(([classe, contagem]) => (
                <Text key={classe} style={styles.resultValue}>
                  {' '}
                  • {classe}: {contagem}
                </Text>
              ))}
            </View>
          )}
        </View>

        <BigButton
          title="Enviar Novo Vídeo"
          onPress={() => navigation.popToTop()} // Volta para a tela inicial da stack
          buttonStyle={styles.newAnalysisButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 25,
    textAlign: 'center',
    color: '#333',
  },
  resultsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 25,
    width: '100%',
    marginBottom: 30,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  resultLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginTop: 10,
  },
  resultValue: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  totalCountContainer: {
    marginVertical: 20,
    paddingVertical: 15,
    backgroundColor: '#eef7ff',
    borderRadius: 8,
    alignItems: 'center',
  },
  totalCountLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  totalCountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 5,
  },
  newAnalysisButton: {
    backgroundColor: '#007AFF', // Azul
    width: '90%',
  },
});

export default ResultsScreen;
