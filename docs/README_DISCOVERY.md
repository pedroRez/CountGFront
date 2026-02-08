# Descoberta de Câmera Wi-Fi

## Como executar o scan
1. Abra o app no dispositivo.
2. Vá em `Câmera Wi-Fi`.
3. Toque em `Buscar cameras`.
4. Se não aparecer nenhuma câmera, use `Copiar logs do scan` e cole o texto em um ticket.

## Flags de ambiente
- `EXPO_PUBLIC_CAMERA_DISCOVERY_DEBUG=1` ativa logs detalhados no console.
- `EXPO_PUBLIC_CAMERA_DISCOVERY_FORCE_PREFIX=192.168.0` força o prefixo de scan.

## O que procurar nos logs
- `local_network` com o IP local detectado.
- `ws_discovery_targets` com os destinos enviados.
- `onvif_discovery_message` para contar respostas.
- `sanity_check_result` para o host `192.168.0.14`.
- `rtsp_scan_prefixes` e `rtsp_scan_metrics` para verificar o scan.

## Onde colar os logs
- Cole em um ticket ou chat interno com o contexto da rede usada.
