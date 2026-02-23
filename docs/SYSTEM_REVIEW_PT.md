# Revisão Minuciosa do Sistema (Frontend + Backend)

Data: 2026-02-23
Escopo revisado: app mobile React Native/Expo + API FastAPI + utilitários de processamento de vídeo.

## 1) Resumo executivo

O sistema está funcional e já possui uma base sólida para operações de captura/envio/processamento de vídeo com monitoramento de progresso. Há boa separação entre frontend e backend, cobertura de testes relevante no backend e validações importantes de entrada em endpoints críticos.

Entretanto, a revisão identificou **riscos estruturais** que limitam escala e endurecimento para produção:

1. **Segurança de API insuficiente para produção** (rotas sem autenticação e CORS permissivo).
2. **Processamento dependente de estado em memória** (fila e status não persistentes).
3. **Custos de processamento potencialmente altos** (inferência YOLO + vídeo anotado sem políticas de limitação/isolamento por tenant).
4. **Observabilidade parcial** (logs existem, mas faltam métricas e tracing para investigação rápida).
5. **Acoplamentos de ambiente** (URL padrão do backend em cliente e comportamento “wake-up” automático).

## 2) Pontos fortes observados

- Arquitetura de backend organizada por módulos (`routes`, `utils`, `schemas`) e validações básicas em upload/predict.
- Proteções úteis contra path traversal e range inválido de trim no endpoint de predição.
- Fila assíncrona de processamento com cancelamento e estados explícitos (`queued`, `running`, `finished`, etc.).
- Contextos bem definidos no app (API, idioma, mapa de orientação, contagens), facilitando manutenção.
- Testes automatizados no backend já cobrindo rotas e utilitários-chave.

## 3) Achados detalhados por domínio

### 3.1 Segurança

**Achado S1 — CORS totalmente aberto**
- Situação: backend aceita `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`.
- Risco: exposição indevida em produção e maior superfície para uso não autorizado por clients de terceiros.
- Recomendação: restringir origens por ambiente e explicitar métodos/cabeçalhos necessários.

**Achado S2 — Endpoints sem autenticação/autorização**
- Situação: rotas de upload/predict/progresso/cancelamento não exigem token/chave.
- Risco: abuso de processamento (DoS econômico), upload massivo e consumo de infraestrutura.
- Recomendação: inserir camada de autenticação (API key/JWT) e rate limiting por cliente.

**Achado S3 — Exposição de detalhes operacionais em respostas/logs**
- Situação: mensagens de erro e logs incluem detalhes internos (caminhos, ações de pipeline).
- Risco: vazamento de contexto operacional útil para exploração.
- Recomendação: padronizar erros externos e manter detalhes completos apenas em logs internos estruturados.

### 3.2 Confiabilidade e resiliência

**Achado R1 — Fila em memória (não persistente)**
- Situação: `TaskQueue` e controle de jobs vivem no processo da API.
- Risco: reinício do serviço perde estados/fila em andamento; difícil escalar horizontalmente.
- Recomendação: migrar para fila persistente (Redis + RQ/Celery/Arq) e armazenar estado de jobs em banco.

**Achado R2 — Dependências de sistema operacional sem fallback operacional completo**
- Situação: parte dos testes/fluxos depende de binários como `ffmpeg/ffprobe`.
- Risco: ambientes sem essas dependências degradam funcionalidade e quebram validação CI.
- Recomendação: adicionar preflight check de dependências na inicialização e teste de smoke dedicado.

### 3.3 Performance e escalabilidade

**Achado P1 — Processamento pesado no mesmo ecossistema de API**
- Situação: endpoint enfileira trabalho de inferência YOLO em workers locais.
- Risco: saturação de CPU/GPU afeta latência da API e dificulta previsibilidade em pico.
- Recomendação: separar API web e workers de inferência; aplicar filas por prioridade/tenant.

**Achado P2 — Geração de vídeo anotado habilitada por padrão**
- Situação: produção de artefato anotado pode aumentar tempo e I/O significativamente.
- Risco: throughput menor, custo maior de armazenamento e transferência.
- Recomendação: controlar por política (feature flag por cliente/plano) e lifecycle de retenção de arquivos.

### 3.4 Qualidade de código e evolução

**Achado Q1 — Alertas de depreciação no schema Pydantic**
- Situação: uso de `Field(..., example=...)` gera warning de depreciação em Pydantic v2.
- Risco: dívida técnica e possível quebra futura no upgrade para v3.
- Recomendação: migrar para `json_schema_extra` nos schemas.

**Achado Q2 — Estratégia de testes boa, mas com lacuna de ambiente multimídia**
- Situação: suíte de testes está ampla para regras de negócio/rotas, porém um teste falha sem `ffmpeg`.
- Risco: falsos negativos no CI e menor confiança em ambientes mínimos.
- Recomendação: condicionar teste multimídia à presença de binário (`pytest.skip` quando ausente) ou fornecer imagem CI padronizada.

### 3.5 Mobile/experiência do app

**Achado M1 — URL default do backend embutida no cliente**
- Situação: app carrega fallback para URL remota específica.
- Risco: acoplamento operacional e rota inesperada em ambientes de teste/local.
- Recomendação: exigir configuração explícita por ambiente (dev/stage/prod) e telemetria de endpoint ativo.

**Achado M2 — “Wake-up” automático do backend ao abrir/retornar app**
- Situação: app dispara request de aquecimento com timeout longo.
- Risco: tráfego desnecessário e impacto em bateria/rede em cenários de uso frequente.
- Recomendação: aplicar debounce/janela mínima entre wake-ups e desligar em produção quando backend estiver sempre ativo.

## 4) Priorização recomendada (Impacto x Esforço)

### Prioridade Alta (próximo ciclo)
1. Autenticação + rate limiting nos endpoints de upload/predict/cancel/progresso.
2. Restrição de CORS por ambiente.
3. Persistência de fila/estado de processamento (ao menos estado em banco).
4. Hardening de erros externos (mensagens padronizadas sem detalhes internos).

### Prioridade Média
1. Separar workers de inferência do processo web.
2. Política de retenção de vídeos processados e anotados.
3. Ajustar comportamento de wake-up no app para reduzir chamadas redundantes.
4. Corrigir depreciações Pydantic.

### Prioridade Baixa
1. Dashboard operacional (métricas de fila, sucesso/falha, latência por etapa).
2. Tracing distribuído para upload → fila → inferência → persistência.

## 5) Plano de ação sugerido (30/60/90 dias)

### 30 dias
- Implantar API key simples e rate limit básico.
- Parametrizar CORS por variável de ambiente.
- Corrigir warnings de schema Pydantic.
- Ajustar teste multimídia para não falhar em ambiente sem ffmpeg.

### 60 dias
- Migrar fila para backend persistente (Redis + worker dedicado).
- Registrar estado de jobs em tabela própria (id, status, timestamps, erro).
- Criar métricas base (tempo de fila, tempo de processamento, taxa de erro).

### 90 dias
- Separar completamente serviço de inferência.
- Introduzir autoscaling dos workers (se aplicável).
- Criar SLOs (latência e disponibilidade) e alertas operacionais.

## 6) Conclusão

O projeto já possui base técnica consistente e evolutiva, com sinais positivos de organização e testes. Para escalar com segurança e previsibilidade, o foco deve ser **hardening de segurança**, **persistência da camada assíncrona** e **maturidade operacional**. Esses três eixos reduzem risco imediato e preparam a plataforma para crescimento sustentável.
