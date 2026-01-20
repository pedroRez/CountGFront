# Tarefas para atualização do sistema

## Atualização de dependências
- [ ] Revisar o changelog do Expo SDK 53 e validar compatibilidade com o backend.
- [ ] Atualizar dependências do Expo/React Navigation conforme versões de patch suportadas.
- [ ] Rodar `npm install` e garantir que o `package-lock.json` reflita as versões atualizadas.
- [ ] Executar `npm audit` e planejar correções de segurança prioritárias.

## Refatoração e estabilidade
- [ ] Consolidar solicitações de permissões em hooks reutilizáveis.
- [ ] Revisar telas de captura para garantir tratamento consistente de permissões.
- [ ] Validar fluxos de gravação/edição de vídeo após atualização.

## Qualidade e validação
- [ ] Atualizar documentação de instalação e requisitos locais.
- [ ] Testar fluxo de câmera/gravação em Android e iOS.
- [ ] Executar formatação (`npm run format`) antes do merge.
