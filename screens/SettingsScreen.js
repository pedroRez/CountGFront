import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';
import { useApi } from '../context/ApiContext'; // Importa nosso hook customizado
import BigButton from '../components/BigButton';

const SettingsScreen = () => {
  // Pega os valores e funções do nosso contexto global
  const {
    apiUrl,
    setApiUrl,
    isCustomUrlEnabled,
    setIsCustomUrlEnabled,
    DEFAULT_API_URL,
  } = useApi();

  // Estado local para o campo de texto, inicializado com a URL do contexto
  const [textInputUrl, setTextInputUrl] = useState(
    isCustomUrlEnabled ? apiUrl : ''
  );
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    const urlToTest = isCustomUrlEnabled ? textInputUrl : DEFAULT_API_URL;
    if (!urlToTest || !urlToTest.startsWith('http')) {
      Alert.alert(
        'URL Inválida',
        'Por favor, insira uma URL válida começando com http:// ou https://'
      );
      return;
    }

    setIsTesting(true);
    Alert.alert('Testando...', `Tentando conectar a ${urlToTest}`);

    try {
      // Tenta fazer uma requisição GET para a rota raiz da API
      const response = await axios.get(urlToTest, { timeout: 10000 }); // Timeout de 10 segundos
      if (response.status === 200) {
        Alert.alert(
          'Sucesso!',
          `Conexão com ${urlToTest} bem-sucedida.\nStatus do Servidor: ${response.data.status || 'OK'}`
        );
      } else {
        Alert.alert(
          'Falha na Conexão',
          `O servidor respondeu com o status: ${response.status}`
        );
      }
    } catch (error) {
      Alert.alert(
        'Erro de Conexão',
        `Não foi possível conectar ao servidor. Verifique a URL e sua conexão.\n\nDetalhes: ${error.message}`
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleSwitch = (value) => {
    setIsCustomUrlEnabled(value);
    // Se estiver habilitando a URL customizada, já salva o que estiver no campo de texto
    if (value) {
      setApiUrl(textInputUrl);
    }
  };

  const handleUrlChange = (text) => {
    setTextInputUrl(text);
    // Se a URL customizada estiver habilitada, atualiza o contexto em tempo real
    if (isCustomUrlEnabled) {
      setApiUrl(text);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Configurações da API</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servidor Padrão</Text>
          <Text style={styles.infoText}>
            O servidor padrão configurado no aplicativo é:
          </Text>
          <Text style={styles.urlText}>{DEFAULT_API_URL}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.switchContainer}>
            <Text style={styles.sectionTitle}>Usar Servidor Customizado</Text>
            <Switch
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={isCustomUrlEnabled ? '#007AFF' : '#f4f3f4'}
              onValueChange={handleToggleSwitch}
              value={isCustomUrlEnabled}
            />
          </View>
          <TextInput
            style={[styles.input, !isCustomUrlEnabled && styles.inputDisabled]}
            placeholder="http://192.168.X.XX:8000"
            value={textInputUrl}
            onChangeText={handleUrlChange}
            editable={isCustomUrlEnabled} // Só permite editar se o switch estiver ligado
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <BigButton
          title={isTesting ? 'Testando...' : 'Testar Conexão'}
          onPress={handleTestConnection}
          disabled={isTesting}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  content: { padding: 20 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  infoText: { fontSize: 14, color: '#666' },
  urlText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: 'bold',
    marginTop: 5,
    userSelect: 'all',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginTop: 10,
    backgroundColor: '#fff',
  },
  inputDisabled: { backgroundColor: '#e9ecef', color: '#6c757d' },
});

export default SettingsScreen;
