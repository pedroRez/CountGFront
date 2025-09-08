import logging
import os
from stat import S_ISDIR
from typing import Callable, Optional, Tuple

import paramiko

logger = logging.getLogger(__name__)

# Carrega as credenciais das variáveis de ambiente configuradas
# (no seu .env localmente, ou no dashboard do Render)
HG_HOST = os.getenv("HG_HOST")
HG_USER = os.getenv("HG_USER")
HG_PASS = os.getenv("HG_PASS")
HG_PORT = int(os.getenv("HG_PORT", 22))


def sftp_connect() -> Optional[Tuple[paramiko.SFTPClient, paramiko.Transport]]:
    """Cria e retorna um cliente SFTP conectado.

    Create and return a connected SFTP client.

    Parâmetros / Parameters:
        Nenhum / None (usa variáveis de ambiente).

    Retorno / Returns:
        tuple | None: Par ``(sftp, transport)`` ou ``(None, None)`` em caso de
        falha. Pair ``(sftp, transport)`` or ``(None, None)`` on failure.

    Efeitos colaterais / Side Effects:
        Estabelece conexão com o servidor e registra logs.
        Establishes a server connection and logs messages.

    Exceções / Exceptions:
        Qualquer exceção é capturada e registrada; ``None`` é retornado.
        Exceptions are caught and logged; ``None`` is returned.
    """
    if not all([HG_HOST, HG_USER, HG_PASS]):
        logger.error(
            "[SFTP ERRO] Variáveis de ambiente (HG_HOST, HG_USER, HG_PASS) não estão configuradas."
        )
        return None, None
    try:
        transport = paramiko.Transport((HG_HOST, HG_PORT))
        transport.connect(username=HG_USER, password=HG_PASS)
        sftp = paramiko.SFTPClient.from_transport(transport)
        logger.info(f"[SFTP] Conexão com {HG_HOST} bem-sucedida.")
        return sftp, transport
    except Exception as e:
        logger.error(f"[SFTP ERRO] Falha ao conectar: {e}")
        return None, None


def _ensure_remote_dir_exists(sftp: paramiko.SFTPClient, remote_path: str):
    """Garante que um diretório remoto exista, criando-o recursivamente.

    Ensure that a remote directory exists, creating it recursively if needed.

    Parâmetros / Parameters:
        sftp (paramiko.SFTPClient): Cliente SFTP ativo. Active SFTP client.
        remote_path (str): Caminho remoto completo. Full remote path.

    Retorno / Returns:
        None

    Efeitos colaterais / Side Effects:
        Cria diretórios no servidor remoto e registra logs.
        Creates directories on the remote server and logs messages.

    Exceções / Exceptions:
        Exceções do SFTP não são tratadas aqui.
        SFTP exceptions are not handled here.
    """
    remote_dir = os.path.dirname(remote_path.replace("\\", "/"))
    if not remote_dir or remote_dir == ".":
        return  # Não precisa criar diretório se o caminho for na raiz

    # Divide o caminho em partes para criar cada nível do diretório
    dirs = remote_dir.split("/")
    current_dir = ""
    for d in dirs:
        if not d:
            continue  # Ignora strings vazias (ex: de um caminho começando com /)
        # Para caminhos relativos como 'public_html/...', current_dir começa sem a barra
        if current_dir:
            current_dir += "/" + d
        else:
            current_dir = d

        try:
            # Verifica se o diretório/arquivo existe
            sftp.stat(current_dir)
        except FileNotFoundError:
            # Se não existe, cria o diretório
            logger.info(f"[SFTP] Criando diretório remoto: {current_dir}")
            sftp.mkdir(current_dir)


def upload_file_sftp(
    local_path: str,
    remote_path: str,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> bool:
    """Faz upload de um arquivo local para um caminho remoto via SFTP.

    Upload a local file to a remote path via SFTP.

    Parâmetros / Parameters:
        local_path (str): Caminho do arquivo local. Local file path.
        remote_path (str): Caminho remoto de destino. Remote destination path.
        progress_callback (Callable, opcional): Função de progresso
            ``(transferred, total)``. Progress callback ``(transferred,
            total)``.

    Retorno / Returns:
        bool: ``True`` se o upload foi bem-sucedido.
        ``True`` if the upload succeeded.

    Efeitos colaterais / Side Effects:
        Cria diretórios remotos conforme necessário, transfere o arquivo e
        registra logs.
        Creates remote directories as needed, transfers the file and logs
        messages.

    Exceções / Exceptions:
        Erros de SFTP são capturados e resultam em ``False``.
        SFTP errors are caught and result in ``False``.
    """
    sftp, transport = sftp_connect()
    if not sftp:
        return False

    try:
        _ensure_remote_dir_exists(sftp, remote_path)

        logger.info(f"[SFTP] Fazendo upload de '{local_path}' para '{remote_path}'...")
        # Passa a função de callback para o método .put() do paramiko
        sftp.put(local_path, remote_path.replace("\\", "/"), callback=progress_callback)
        logger.info(f"[SFTP] Upload de '{os.path.basename(local_path)}' concluído.")
        return True
    except Exception as e:
        logger.error(f"[SFTP ERRO] Falha no upload: {e}")
        return False
    finally:
        if sftp:
            sftp.close()
        if transport:
            transport.close()


def download_file_sftp(
    remote_path: str,
    local_path: str,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> bool:
    """Baixa um arquivo de um caminho remoto para um local via SFTP.

    Download a file from a remote path to a local path via SFTP.

    Parâmetros / Parameters:
        remote_path (str): Caminho remoto de origem. Remote source path.
        local_path (str): Caminho local de destino. Local destination path.
        progress_callback (Callable, opcional): Função de progresso
            ``(transferred, total)``. Progress callback ``(transferred,
            total)``.

    Retorno / Returns:
        bool: ``True`` se o download foi bem-sucedido.
        ``True`` if the download succeeded.

    Efeitos colaterais / Side Effects:
        Transfere arquivos para o sistema local e registra logs.
        Transfers files to the local system and logs messages.

    Exceções / Exceptions:
        Erros de SFTP são capturados e resultam em ``False``.
        SFTP errors are caught and result in ``False``.
    """
    sftp, transport = sftp_connect()
    if not sftp:
        return False

    try:
        logger.info(f"[SFTP] Baixando de '{remote_path}' para '{local_path}'...")
        # Passa a função de callback para o método .get() do paramiko
        sftp.get(remote_path.replace("\\", "/"), local_path, callback=progress_callback)
        logger.info(f"[SFTP] Download de '{os.path.basename(remote_path)}' concluído.")
        return True
    except Exception as e:
        logger.error(f"[SFTP ERRO] Falha no download: {e}")
        return False
    finally:
        if sftp:
            sftp.close()
        if transport:
            transport.close()


def delete_file_sftp(remote_path: str) -> bool:
    """Deleta um arquivo em um caminho remoto via SFTP.

    Delete a file at a remote path via SFTP.

    Parâmetros / Parameters:
        remote_path (str): Caminho do arquivo remoto. Remote file path.

    Retorno / Returns:
        bool: ``True`` se o arquivo foi removido ou já inexistente.
        ``True`` if the file was removed or already absent.

    Efeitos colaterais / Side Effects:
        Remove arquivos no servidor remoto e registra logs.
        Removes files on the remote server and logs messages.

    Exceções / Exceptions:
        Erros de SFTP são capturados e retornam ``False``.
        SFTP errors are caught and result in ``False``.
    """
    sftp, transport = sftp_connect()
    if not sftp:
        return False

    try:
        logger.info(f"[SFTP] Deletando arquivo remoto: '{remote_path}'...")
        sftp.remove(remote_path.replace("\\", "/"))
        logger.info(f"[SFTP] Arquivo '{os.path.basename(remote_path)}' deletado.")
        return True
    except FileNotFoundError:
        logger.warning(
            f"[SFTP AVISO] Tentativa de deletar arquivo que não existe: {remote_path}"
        )
        return True  # Considera sucesso se o arquivo já não existe
    except Exception as e:
        logger.error(f"[SFTP ERRO] Falha ao deletar '{remote_path}': {e}")
        return False
    finally:
        if sftp:
            sftp.close()
        if transport:
            transport.close()
