import React, { useState } from 'react';
import { View, Text } from 'react-native';
import VideoUploader from './components/VideoUploader';
import VideoUploadSender from './components/VideoUploadSender';
import VideoProcessor from './components/VideoProcessor';


export default function App() {
  const [video, setVideo] = useState(null);
  const [videoEnviado, setVideoEnviado] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [countResult, setCountResult] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [tempoRestante, setTempoRestante] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>Contagem de Gado</Text>

      <VideoUploader
        setVideo={setVideo}
        setCountResult={setCountResult}
        setVideoEnviado={setVideoEnviado}
        setUploadProgress={setUploadProgress}
        setLoading={setLoading}
        setProcessingProgress={setProcessingProgress}
        setTempoRestante={setTempoRestante}
        setCancelando={setCancelando}
      />

      {video && !videoEnviado && (
        <VideoUploadSender
          video={video}
          setUploadProgress={setUploadProgress}
          uploadProgress={uploadProgress}
          setVideoEnviado={setVideoEnviado}
        />
      )}

      {video && videoEnviado && (
        <VideoProcessor
          video={video}
          setCountResult={setCountResult}
          setLoading={setLoading}
          progress={processingProgress}
          setProgress={setProcessingProgress}
          tempoRestante={tempoRestante}
          setTempoRestante={setTempoRestante}
          cancelando={cancelando}
          setCancelando={setCancelando}
          loading={loading}
        />
      )}

      {countResult && (
        <View style={{ marginTop: 30 }}>
          <Text style={{ fontSize: 18 }}>Resultado da Contagem:</Text>
          <Text style={{ fontSize: 16 }}>Vídeo: {countResult.video}</Text>
          <Text style={{ fontSize: 16 }}>Duração (frames): {countResult.total_frames}</Text>
          <Text style={{ fontSize: 22, fontWeight: 'bold', marginTop: 10 }}>
            {countResult.total_count} bois contados
          </Text>
          {countResult.por_classe &&
            Object.entries(countResult.por_classe).map(([classe, quantidade]) => (
              <Text key={classe} style={{ fontSize: 16 }}>
                {classe}: {quantidade}
              </Text>
            ))}
        </View>
      )}
    </View>
  );
}
