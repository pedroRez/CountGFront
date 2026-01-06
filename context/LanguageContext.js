import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

const STORAGE_KEY = '@app_language';
const DEFAULT_LANGUAGE = 'pt';

const translations = {
  pt: {
    common: {
      error: 'Erro',
      wait: 'Aguarde',
      back: 'Voltar',
      cancel: 'Cancelar',
      confirm: 'Confirmar',
      status: 'Status',
      permissionRequired: 'Permissao necessaria',
      cameraNotReady: 'A camera ainda nao esta pronta.',
      cameraMicRequired: 'E necessario acesso a camera e ao microfone.',
      orientation: {
        leftToRight: 'Esquerda -> Direita',
        rightToLeft: 'Direita -> Esquerda',
        topToBottom: 'Cima -> Baixo',
        bottomToTop: 'Baixo -> Cima',
      },
    },
    nav: {
      resultsTitle: 'Resultados da analise',
      filmingGuideTitle: 'Guia de filmagem',
      settingsTitle: 'Configuracoes',
      cameraTestTitle: 'Teste de camera',
      processedVideoTitle: 'Video processado',
      countsTitle: 'Contagens',
    },
    settings: {
      title: 'Configuracoes da API',
      defaultServerTitle: 'Servidor padrao',
      defaultServerDescription: 'O servidor padrao configurado no app e:',
      useCustomServer: 'Usar servidor personalizado',
      testConnection: 'Testar conexao',
      testing: 'Testando...',
      invalidUrlTitle: 'URL invalida',
      invalidUrlMessage:
        'Informe uma URL valida comecando com http:// ou https://',
      testingTitle: 'Testando...',
      testingMessage: 'Tentando conectar em {{url}}',
      successTitle: 'Sucesso!',
      successMessage:
        'Conexao com {{url}} bem-sucedida.\nStatus do servidor: {{status}}',
      connectionFailedTitle: 'Falha na conexao',
      connectionFailedMessage:
        'O servidor respondeu com status: {{status}}',
      connectionErrorTitle: 'Erro de conexao',
      connectionErrorMessage:
        'Nao foi possivel conectar ao servidor. Verifique a URL e sua conexao.\n\nDetalhes: {{details}}',
      languageTitle: 'Idioma',
      languageDescription: 'Escolha o idioma do app',
      languagePortuguese: 'Portugues',
      languageEnglish: 'Ingles',
    },
    home: {
      subtitleIdle: 'Selecione uma opcao para comecar',
      menu: {
        recordVideo: 'Gravar video',
        galleryVideo: 'Video da galeria',
        wifiCamera: 'Camera Wi-Fi',
        tutorial: 'Tutorial',
        counts: 'Contagens',
        comingSoonTitle: 'Em breve',
        comingSoonMessage: 'Integracao com cameras Wi-Fi.',
      },
      selected: {
        title: 'Video pronto para analise',
        durationLabel: 'Duracao: {{duration}}',
        helpTitle: 'Ajude a treinar nossa IA!',
        emailPlaceholder: 'Seu e-mail (opcional)',
        consentText: 'Concordo em usar este video para treinamento',
        orientationTitle: 'Orientacao de movimento',
        processingLevelTitle: 'Nivel de processamento',
        videoInfoTitle: 'Detalhes do video',
        videoNameLabel: 'Arquivo',
        trimStartLabel: 'Inicio do corte',
        trimEndLabel: 'Fim do corte',
        orientationLabel: 'Orientacao',
        linePositionLabel: 'Posicao da linha',
        trimNotSet: 'Sem corte',
        linePositionNotSet: 'Nao definido',
        backToEdit: 'Voltar para edicao',
        cancel: 'Cancelar / escolher outro',
        countNameLabel: 'Nome da contagem',
        countNamePlaceholder: 'Ex: Lote 3 - curral A',
        countDescriptionLabel: 'Descricao (opcional)',
        countDescriptionPlaceholder: 'Descreva esta contagem (opcional)',
      },
      counts: {
        title: 'Contagens',
        empty: 'Nenhuma contagem salva ainda.',
        countLabel: 'Quantidade',
        dateLabel: 'Data',
        playVideo: 'Reproduzir',
        unnamed: 'Contagem',
        noVideo: 'Video nao disponivel',
      },
      processing: {
        title: 'Analisando video no servidor...',
        cancel: 'Cancelar analise',
        savingTitle: 'Salvando video processado...',
        saveErrorTitle: 'Erro ao salvar video',
        saveErrorMessage:
          'Nao foi possivel salvar o video processado no celular.',
      },
      progress: {
        preparing: 'Preparando...',
        processingFrames: 'Processando frames',
        statusLabel: 'Status: {{status}}',
        errorLabel: 'Erro: {{error}}',
      },
      alerts: {
        analysisComplete: 'Analise concluida!',
        processingComplete: 'Processamento concluido',
        processingInvalidResult: 'Resultado invalido do servidor.',
        cancelledTitle: 'Cancelado',
        cancelledMessage: 'Solicitacao de cancelamento enviada.',
      },
      errors: {
        galleryPermission: 'E necessario acesso a galeria.',
        galleryLoadFailed: 'Falha ao carregar o video da galeria.',
        processingStart: 'O servidor nao iniciou o processamento corretamente.',
        processingErrorTitle: 'Erro no processamento',
        processingErrorMessage: 'O servidor retornou um erro: {{error}}',
        cancelRequestFailed: 'Nao foi possivel enviar a solicitacao de cancelamento.',
        progressFetchFailed: 'Falha ao obter progresso.',
      },
      model: {
        fast: 'Rapido',
        fastDesc: 'Menor precisao',
        normal: 'Normal',
        normalDesc: 'Equilibrado',
        precise: 'Preciso',
        preciseDesc: 'Mais lento',
      },
      orientation: {
        notDefined: 'Nao definido',
      },
    },
    record: {
      loadingPermissions: 'Solicitando permissoes...',
      permissionDenied: 'E necessario acesso a camera e ao microfone.',
      recordingTooShortTitle: 'Gravacao muito curta',
      recordingTooShortMessage:
        'Tente gravar por pelo menos alguns segundos.',
      recordingErrorTitle: 'Erro de gravacao',
      recordingErrorMessage: 'Nao foi possivel gravar o video: {{error}}',
      switchCamera: 'Trocar',
    },
    results: {
      title: 'Resultado da analise',
      originalVideo: 'Video original:',
      processedVideo: 'Video processado (nome):',
      totalFrames: 'Total de frames:',
      totalCount: 'Total de gado contado:',
      detailsByClass: 'Detalhes por classe:',
      submitNewVideo: 'Enviar novo video',
    },
    cameraTest: {
      alert: {
        incompletePermissionsTitle: 'Permissoes incompletas',
        incompletePermissionsMessage:
          'Para este teste, todas as permissoes (camera, audio, galeria) sao necessarias.',
        successTitle: 'Sucesso!',
        successMessage:
          'Video gravado. Tentando salvar na galeria...',
        savedTitle: 'Salvo!',
        savedMessage:
          'O video de teste foi salvo na galeria com sucesso.',
        recordingTooShortTitle: 'Gravacao muito curta',
        recordingTooShortMessage:
          'O video foi interrompido muito rapido. Tente gravar por mais tempo.',
        recordingErrorTitle: 'Erro de gravacao no teste',
        recordingErrorMessage: 'Ocorreu um erro: {{error}}',
      },
      loadingPermissions: 'Solicitando permissoes...',
      permissionsDenied: 'Permissoes necessarias negadas.',
      buttonPleaseWait: 'Aguarde...',
      buttonStopRecording: 'Parar gravacao',
      buttonStartTest: 'Iniciar teste',
    },
    videoEditor: {
      videoNotFoundMessage: 'Video nao encontrado.',
      invalidTrimMessage: 'Intervalo de corte invalido.',
      timeLabel: 'Atual: {{current}} / {{total}}',
      play: 'Reproduzir',
      pause: 'Pausar',
      seekStart: 'Ir inicio',
      seekEnd: 'Ir fim',
      markStart: 'Definir inicio',
      markEnd: 'Definir fim',
      lineLabel: 'Linha: {{value}}',
      sliderStart: 'Inicio: {{value}}',
      sliderEnd: 'Fim: {{value}}',
      placeholderDirection: 'O seletor de direcao aparecera aqui',
      cancel: 'Cancelar',
      confirm: 'Confirmar',
      orientationNotDefined: 'Nao definido',
    },
    upload: {
      processVideo: 'Processar video',
      uploadingWithPercent: 'Enviando... {{percent}}%',
      uploadComplete: 'Upload concluido. Iniciando analise...',
      missingDataTitle: 'Dados faltando',
      missingDataMessage:
        'Selecione um video, uma orientacao e um nivel de processamento.',
      missingCountNameTitle: 'Nome da contagem',
      missingCountNameMessage: 'Informe um nome para esta contagem.',
      missingCountDescriptionTitle: 'Descricao da contagem',
      missingCountDescriptionMessage:
        'Informe uma descricao para esta contagem.',
      configErrorTitle: 'Erro de configuracao',
      configErrorMessage: 'A URL da API nao foi encontrada.',
      processingErrorTitle: 'Erro no processamento',
      processingErrorFallback: 'Falha ao iniciar o processamento do video.',
    },
    onboarding: {
      mainTitle: 'Guia rapido: filmando seu gado!',
      mainSubtitle:
        'Siga estas dicas para garantir uma contagem precisa e eficiente com nosso app.',
      section1: {
        title: '1. Posicionamento ideal da camera',
        text: 'Posicione a camera para uma visao clara de cima da passagem do gado.',
        point1: {
          label: 'Visao de cima: ',
          text:
            'Coloque a camera diretamente ACIMA do portao ou corredor. A visao deve ser o mais vertical possivel.',
        },
        point2: {
          label: 'Cobertura total: ',
          text:
            'Garanta que a camera capture toda a largura da passagem onde o gado ira cruzar. Nenhum animal deve sair do campo de visao.',
        },
        point3: {
          label: 'Camera estavel: ',
          text:
            'Use um suporte, tripe ou fixe a camera com firmeza. Videos tremidos reduzem a precisao!',
        },
        tip: {
          label: 'Dica de altura: ',
          text:
            'Para um portao padrao com cerca de 3 metros de largura, uma altura de camera entre 2 e 3 metros geralmente oferece bom enquadramento na maioria dos celulares. Teste para encontrar a configuracao ideal para o seu equipamento e portao.',
        },
      },
      section2: {
        title: '2. Dicas para filmar melhor',
        point1: {
          label: 'Passagem completa: ',
          text:
            'Filme cada animal atravessando totalmente a area visivel, desde a entrada ate sair do quadro.',
        },
        point2: {
          label: 'Boa iluminacao: ',
          text:
            'Filme com boa luz natural e uniforme. Evite o sol direto na lente, sombras fortes sobre os animais ou excesso de escuridao.',
        },
        point3: {
          label: 'Momento certo: ',
          text:
            'Grave apenas o periodo em que o gado estiver passando. Evite videos longos antes ou depois do evento.',
        },
        point4: {
          label: 'Qualidade do video: ',
          text:
            'Use boa qualidade (ex.: HD 720p ou Full HD 1080p). Arquivos muito grandes (4K por longos periodos) podem demorar mais para enviar e processar.',
        },
      },
      section3: {
        title: 'Como a contagem funciona',
        point1: {
          label: 'Linha virtual de contagem: ',
          text:
            'Nosso sistema usa uma linha de referencia no seu video para detectar quando um animal cruza.',
        },
        point2: {
          label: 'Direcao do movimento: ',
          text:
            'E importante que o gado se mova principalmente em uma direcao (ex.: da esquerda para a direita ou de cima para baixo na tela) ao cruzar a linha. O app pode pedir essa direcao ou usar um padrao.',
        },
        point3: {
          label: 'Contagem unica: ',
          text:
            'Cada animal que cruza a linha na direcao configurada e contado uma unica vez.',
        },
      },
      buttonStart: 'Entendi, vamos comecar!',
      buttonBack: 'Voltar',
    },
  },
  en: {
    common: {
      error: 'Error',
      wait: 'Wait',
      back: 'Back',
      cancel: 'Cancel',
      confirm: 'Confirm',
      status: 'Status',
      permissionRequired: 'Permission Required',
      cameraNotReady: 'The camera is not ready yet.',
      cameraMicRequired: 'Camera and microphone access is required.',
      orientation: {
        leftToRight: 'Left -> Right',
        rightToLeft: 'Right -> Left',
        topToBottom: 'Top -> Bottom',
        bottomToTop: 'Bottom -> Top',
      },
    },
    nav: {
      resultsTitle: 'Analysis Results',
      filmingGuideTitle: 'Filming Guide',
      settingsTitle: 'Settings',
      cameraTestTitle: 'Camera Test',
      processedVideoTitle: 'Processed video',
      countsTitle: 'Counts',
    },
    settings: {
      title: 'API Settings',
      defaultServerTitle: 'Default Server',
      defaultServerDescription: 'The default server configured in the app is:',
      useCustomServer: 'Use Custom Server',
      testConnection: 'Test Connection',
      testing: 'Testing...',
      invalidUrlTitle: 'Invalid URL',
      invalidUrlMessage:
        'Please enter a valid URL starting with http:// or https://',
      testingTitle: 'Testing...',
      testingMessage: 'Trying to connect to {{url}}',
      successTitle: 'Success!',
      successMessage:
        'Connection to {{url}} successful.\nServer status: {{status}}',
      connectionFailedTitle: 'Connection Failed',
      connectionFailedMessage: 'The server responded with status: {{status}}',
      connectionErrorTitle: 'Connection Error',
      connectionErrorMessage:
        'Could not connect to the server. Check the URL and your connection.\n\nDetails: {{details}}',
      languageTitle: 'Language',
      languageDescription: 'Choose the app language',
      languagePortuguese: 'Portuguese',
      languageEnglish: 'English',
    },
    home: {
      subtitleIdle: 'Select an option to start',
      menu: {
        recordVideo: 'Record Video',
        galleryVideo: 'Gallery Video',
        wifiCamera: 'Wi-Fi Camera',
        tutorial: 'Tutorial',
        counts: 'Counts',
        comingSoonTitle: 'Coming Soon',
        comingSoonMessage: 'Integration with Wi-Fi cameras.',
      },
      selected: {
        title: 'Video Ready for Analysis',
        durationLabel: 'Duration: {{duration}}',
        helpTitle: 'Help train our AI!',
        emailPlaceholder: 'Your email (optional)',
        consentText: 'I agree to use this video for training',
        orientationTitle: 'Movement Orientation',
        processingLevelTitle: 'Processing Level',
        videoInfoTitle: 'Video details',
        videoNameLabel: 'File',
        trimStartLabel: 'Trim start',
        trimEndLabel: 'Trim end',
        orientationLabel: 'Orientation',
        linePositionLabel: 'Line position',
        trimNotSet: 'No trim',
        linePositionNotSet: 'Not set',
        backToEdit: 'Back to edit',
        cancel: 'Cancel / Choose Another',
        countNameLabel: 'Count name',
        countNamePlaceholder: 'Example: Lot 3 - corral A',
        countDescriptionLabel: 'Description (optional)',
        countDescriptionPlaceholder: 'Describe this count (optional)',
      },
      counts: {
        title: 'Counts',
        empty: 'No saved counts yet.',
        countLabel: 'Count',
        dateLabel: 'Date',
        playVideo: 'Play',
        unnamed: 'Count',
        noVideo: 'Video not available',
      },
      processing: {
        title: 'Analyzing video on server...',
        cancel: 'Cancel Analysis',
        savingTitle: 'Saving processed video...',
        saveErrorTitle: 'Save error',
        saveErrorMessage:
          'Could not save the processed video on this device.',
      },
      progress: {
        preparing: 'Preparing...',
        processingFrames: 'Processing frames',
        statusLabel: 'Status: {{status}}',
        errorLabel: 'Error: {{error}}',
      },
      alerts: {
        analysisComplete: 'Analysis Complete!',
        processingComplete: 'Processing Complete',
        processingInvalidResult: 'Invalid backend result.',
        cancelledTitle: 'Cancelled',
        cancelledMessage: 'Analysis cancellation request sent.',
      },
      errors: {
        galleryPermission: 'Gallery access is required.',
        galleryLoadFailed: 'Failed to load video from gallery.',
        processingStart: 'The server did not start processing correctly.',
        processingErrorTitle: 'Processing Error',
        processingErrorMessage: 'The server returned an error: {{error}}',
        cancelRequestFailed: 'Could not send cancellation request.',
        progressFetchFailed: 'Failed to fetch progress.',
      },
      model: {
        fast: 'Fast',
        fastDesc: 'Lower accuracy',
        normal: 'Normal',
        normalDesc: 'Balanced',
        precise: 'Precise',
        preciseDesc: 'Slower',
      },
      orientation: {
        notDefined: 'Not set',
      },
    },
    record: {
      loadingPermissions: 'Requesting permissions...',
      permissionDenied: 'Camera and microphone access is required.',
      recordingTooShortTitle: 'Recording Too Short',
      recordingTooShortMessage:
        'Please try recording for at least a few seconds.',
      recordingErrorTitle: 'Recording Error',
      recordingErrorMessage: 'Could not record the video: {{error}}',
      switchCamera: 'Switch',
    },
    results: {
      title: 'Analysis Result',
      originalVideo: 'Original Video:',
      processedVideo: 'Processed Video (Name):',
      totalFrames: 'Total Frames:',
      totalCount: 'Total Cattle Counted:',
      detailsByClass: 'Details by Class:',
      submitNewVideo: 'Submit New Video',
    },
    cameraTest: {
      alert: {
        incompletePermissionsTitle: 'Incomplete Permissions',
        incompletePermissionsMessage:
          'For this test, all permissions (camera, audio, gallery) are required.',
        successTitle: 'Success!',
        successMessage: 'Video recorded. Attempting to save to gallery...',
        savedTitle: 'Saved!',
        savedMessage:
          'The test video was saved to your gallery successfully.',
        recordingTooShortTitle: 'Recording Too Short',
        recordingTooShortMessage:
          'The video was stopped too quickly. Try recording longer.',
        recordingErrorTitle: 'Recording Error in Test',
        recordingErrorMessage: 'An error occurred: {{error}}',
      },
      loadingPermissions: 'Requesting permissions...',
      permissionsDenied: 'Required permissions denied.',
      buttonPleaseWait: 'Please wait...',
      buttonStopRecording: 'Stop Recording',
      buttonStartTest: 'Start Test',
    },
    videoEditor: {
      videoNotFoundMessage: 'Video not found.',
      invalidTrimMessage: 'Invalid trim range.',
      timeLabel: 'Current: {{current}} / {{total}}',
      play: 'Play',
      pause: 'Pause',
      seekStart: 'Go to start',
      seekEnd: 'Go to end',
      markStart: 'Set start',
      markEnd: 'Set end',
      lineLabel: 'Line: {{value}}',
      sliderStart: 'Start: {{value}}',
      sliderEnd: 'End: {{value}}',
      placeholderDirection: 'Direction selector will appear here',
      cancel: 'Cancel',
      confirm: 'Confirm',
      orientationNotDefined: 'Not set',
    },
    upload: {
      processVideo: 'Process Video',
      uploadingWithPercent: 'Uploading... {{percent}}%',
      uploadComplete: 'Upload complete. Starting analysis...',
      missingDataTitle: 'Missing Data',
      missingDataMessage:
        'Please select a video, orientation, and processing level.',
      missingCountNameTitle: 'Count name',
      missingCountNameMessage: 'Please provide a name for this count.',
      missingCountDescriptionTitle: 'Count description',
      missingCountDescriptionMessage:
        'Please provide a description for this count.',
      configErrorTitle: 'Configuration Error',
      configErrorMessage: 'The API URL was not found.',
      processingErrorTitle: 'Processing Error',
      processingErrorFallback: 'Failed to start video processing.',
    },
    onboarding: {
      mainTitle: 'Quick Guide: Filming Your Cattle!',
      mainSubtitle:
        'Follow these tips to ensure accurate and efficient counting with our app.',
      section1: {
        title: '1. Ideal Camera Positioning',
        text: 'Position the camera for a clear top-down view of the cattle passage.',
        point1: {
          label: 'Top-Down View: ',
          text:
            'Place the camera directly ABOVE the gate or corridor. The view should be straight down as much as possible.',
        },
        point2: {
          label: 'Full Coverage: ',
          text:
            'Ensure the camera captures the entire width of the passage where the cattle will cross. No animal should leave the field of view.',
        },
        point3: {
          label: 'Stable Camera: ',
          text:
            'Use a mount, tripod, or secure the camera firmly. Shaky videos reduce accuracy!',
        },
        tip: {
          label: 'Height Tip: ',
          text:
            'For a standard gate around 3 meters wide, a camera height between 2 and 3 meters usually provides good framing with most phones. Test to find the ideal setup for your equipment and gate.',
        },
      },
      section2: {
        title: '2. Tips for Effective Filming',
        point1: {
          label: 'Full Passage: ',
          text:
            'Film each animal fully crossing the visible area, from entry until it leaves the camera frame.',
        },
        point2: {
          label: 'Good Lighting: ',
          text:
            'Film with good, even natural light. Avoid the sun directly in the lens, strong shadows over the animals, or excessive darkness.',
        },
        point3: {
          label: 'Focus on the Right Moment: ',
          text:
            'Record only the period when the cattle are passing. Avoid unnecessarily long videos before or after the event.',
        },
        point4: {
          label: 'Video Quality: ',
          text:
            'Use a good quality (e.g., HD 720p or Full HD 1080p). Very large files (4K for long periods) may take longer to upload and process.',
        },
      },
      section3: {
        title: 'How the Counting Works',
        point1: {
          label: 'Virtual Counting Line: ',
          text:
            'Our system uses a reference line in your video to detect when an animal crosses.',
        },
        point2: {
          label: 'Movement Direction: ',
          text:
            'It is important that the cattle move primarily in one direction (e.g., left to right or top to bottom on the screen) when crossing the line. The app may ask for this direction or use a default.',
        },
        point3: {
          label: 'Single Count: ',
          text:
            'Each animal crossing the line in the configured direction is counted once.',
        },
      },
      buttonStart: "Got it, let's start!",
      buttonBack: 'Back',
    },
  },
};

const getNestedValue = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return acc[part];
    }
    return undefined;
  }, obj);
};

const interpolate = (text, params) => {
  if (!params || typeof text !== 'string') return text;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key]);
    }
    return match;
  });
};

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
  isLoading: false,
});

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedLanguage && translations[savedLanguage]) {
          setLanguageState(savedLanguage);
        }
      } catch (error) {
        console.warn('Failed to load language preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();
  }, []);

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = translations[nextLanguage]
      ? nextLanguage
      : DEFAULT_LANGUAGE;
    setLanguageState(normalized);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, normalized);
    } catch (error) {
      console.warn('Failed to save language preference:', error);
    }
  }, []);

  const t = useCallback(
    (key, params) => {
      const entry =
        getNestedValue(translations[language], key) ??
        getNestedValue(translations[DEFAULT_LANGUAGE], key) ??
        getNestedValue(translations.en, key);

      if (entry === undefined || entry === null) return key;
      if (typeof entry === 'function') return entry(params);
      if (typeof entry !== 'string') return String(entry);
      return interpolate(entry, params);
    },
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, isLoading }),
    [language, setLanguage, t, isLoading]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
