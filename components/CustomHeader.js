import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Este componente recebe o título como uma 'propriedade'
const CustomHeader = ({ title }) => {
  const navigation = useNavigation();

  return (
    // Usamos uma View como container principal com um padding no topo.
    // Isso cria o espaçamento que precisamos em relação à barra de status.
    <View style={styles.container}>
      {/* View vazia à esquerda para ajudar a centralizar o título */}
      <View style={styles.sideComponent} />

      {/* Título da Tela */}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {/* Botão de Configurações à direita */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Settings')}
        style={styles.sideComponent}
      >
        <MaterialCommunityIcons name="cog-outline" size={28} color="#007AFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // O padding no topo empurra todo o conteúdo para baixo
    paddingTop: Platform.OS === 'android' ? 40 : 50,
    paddingBottom: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8F8', // Cor de fundo do cabeçalho
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1c1c1e',
    textAlign: 'center',
    flex: 1, // Permite que o título ocupe o espaço central
  },
  sideComponent: {
    width: 40, // Largura fixa para os componentes laterais
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CustomHeader;
