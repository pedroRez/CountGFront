# Descoberta de Camera Wi-Fi

## Como executar o scan
1. Abra o app no dispositivo.
2. Va em `Camera Wi-Fi`.
3. Toque em `Buscar cameras`.
4. Se nao aparecer nenhuma camera, use `Copiar logs do scan` e cole o texto em um ticket.

## Flags de ambiente
- `EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG=1` habilita painel de debug na tela.
- `EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG_LOGS=1` habilita telemetria detalhada do scan (RTSP/ONVIF).
- `EXPO_PUBLIC_CAMERA_DISCOVERY_FORCE_PREFIX=192.168.0` forca o prefixo de scan.
- `EXPO_PUBLIC_CAMERA_SCAN_ENABLE_ONVIF_DISCOVERY=1` habilita WS-Discovery ONVIF (UDP 3702) para comparacao com outros apps.

## O que procurar nos logs
- `scan_start` para validar flags ativas (`onvifDiscoveryEnabled`).
- `local_network` com IP local detectado e prefixo usado.
- `ws_discovery_targets` com destinos UDP enviados.
- `onvif_discovery_message` para contar respostas WS-Discovery.
- `rtsp-scan request` para ver metodo/porta/path tentados.
- `rtsp-scan response_rtsp` para comparar status RTSP, realm e server.
- `rtsp-scan stop` para motivo final por tentativa (`timeout`, `error`, `hit` etc).
- `last_known_ips_loaded` e `priority_ips` para ordem de prioridade.
- `scan_complete` para tempo total e quantidade encontrada.

## Captura comparativa (PCAP + logs)
1. Instale e abra o PCAPdroid no celular.
2. Inicie captura com filtro em `udp port 3702 or tcp port 554 or tcp port 8554 or tcp port 10554`.
3. Execute o scan no app de referencia (o que funciona) e salve o arquivo como `referencia.pcap`.
4. Sem trocar de rede, execute o scan no CountGFront com as flags de debug e salve `countgfront.pcap`.
5. No CountGFront, use `Copiar logs do scan` e salve esse texto junto dos dois `.pcap`.
6. Compare no Wireshark:
   - quantidade de probes UDP para `239.255.255.250:3702`;
   - tentativas RTSP por IP/porta/path;
   - respostas RTSP (401, 404, 200) e headers `Server`/`WWW-Authenticate`.

## Onde colar os logs
- Cole em um ticket ou chat interno com:
  - SSID/rede usada;
  - modelo da camera;
  - `referencia.pcap`;
  - `countgfront.pcap`;
  - texto de `Copiar logs do scan`.
