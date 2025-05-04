import React, { useEffect, useState } from 'react';
import { View, Text, Button, ProgressBarAndroid } from 'react-native';
import axios from 'axios';

const ProcessamentoSection = ({ videoInfo }) => {
  const [progresso, setProgresso] = useState(null);
  const [cancelado, setCancelado] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    let interval;
    const iniciarProcessamento = async () => {
      try {
        const res = await axios.post(`http://<SEU_BACKEND>/predict-video/`, {
          video_name: videoInfo.video_name,
        }, { timeout: 0 }); // sem timeout

        setResultado(res.data);
        clearInterval(interval);
      } catch (err) {
        console.error('Erro durante processamento:', err);
      }
    };

    const verificarProgresso = async () => {
      try {
        const res = await axios.get(`http://<SEU_BACKEND>/progresso/${videoInfo.video_name}`);
        setProgresso(res.data);
      } catch (err) {
        console.error('Erro ao obter progresso:', err);
      }
    };

    iniciarProcessamento();
    interval = setInterval(verificarProgresso, 5000);

    return () => clearInterval(interval);
  }, [videoInfo]);

  const cancelar = async () => {
    await axios.post(`http://<SEU_BACKEND>/cancelar-processamento/${videoInfo.video_name}`);
    setCancelado(true);
  };

  if (cancelado) {
    return <Text>Processamento cancelado.</Text>;
  }

  if (resultado) {
    return (
      <View>
        <Text>Contagem concluída:</Text>
        <Text>Total: {resultado.total_count}</Text>
      </View>
    );
  }

  return (
    <View>
      <Text>Processando vídeo: {videoInfo.video_name}</Text>
      {progresso && (
        <>
          <ProgressBarAndroid
            styleAttr="Horizontal"
            indeterminate={false}
            progress={progresso.frame_atual / progresso.total_frames_estimado}
          />
          <Text>Tempo restante: {progresso.tempo_restante}</Text>
        </>
      )}
      <Button title="Cancelar Processamento" onPress={cancelar} />
    </View>
  );
};

export default ProcessamentoSection;
