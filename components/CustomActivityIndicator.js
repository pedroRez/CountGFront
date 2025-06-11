import React from 'react';
import { ActivityIndicator, Platform } from 'react-native';

const CustomActivityIndicator = (props) => {
  // Esta é a nossa lógica de correção.
  // Ele verifica se a prop 'size' é "large" e se o OS é Android.
  // Se for, ele usa o número 50. Caso contrário, usa o valor original.
  const size = (props.size === 'large' && Platform.OS === 'android') 
    ? 50 
    : props.size;

  // Retorna o ActivityIndicator padrão, passando todas as props originais,
  // mas com a nossa prop 'size' corrigida.
  return <ActivityIndicator {...props} size={size} />;
};

export default CustomActivityIndicator;