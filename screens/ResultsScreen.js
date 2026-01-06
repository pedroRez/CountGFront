import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '../components/BigButton';
import { useLanguage } from '../context/LanguageContext';

const ResultsScreen = ({ route, navigation }) => {
  const { t } = useLanguage();
  const { results } = route.params; // Receive results from navigation

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('results.title')}</Text>

        <View style={styles.resultsCard}>
          <Text style={styles.resultLabel}>{t('results.originalVideo')}</Text>
          <Text style={styles.resultValue}>{results.video}</Text>

          <Text style={styles.resultLabel}>{t('results.processedVideo')}</Text>
          <Text style={styles.resultValue}>{results.video_processado}</Text>

          <Text style={styles.resultLabel}>{t('results.totalFrames')}</Text>
          <Text style={styles.resultValue}>{results.total_frames}</Text>

          <View style={styles.totalCountContainer}>
            <Text style={styles.totalCountLabel}>
              {t('results.totalCount')}
            </Text>
            <Text style={styles.totalCountValue}>{results.total_count}</Text>
          </View>

          {results.por_classe && Object.keys(results.por_classe).length > 0 && (
            <View>
              <Text style={styles.resultLabel}>
                {t('results.detailsByClass')}
              </Text>
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
          title={t('results.submitNewVideo')}
          onPress={() => navigation.popToTop()} // Return to the stack's initial screen
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
    backgroundColor: '#007AFF', // Blue
    width: '90%',
  },
});

export default ResultsScreen;
