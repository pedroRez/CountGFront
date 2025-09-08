# Arquivo: test_sftp.py (Corrigido)
import logging
import os

from dotenv import load_dotenv

# --- PASSO 1: CARREGAR AS VARIÁVEIS DE AMBIENTE PRIMEIRO ---
# Esta chamada precisa acontecer antes de qualquer importação de
# módulos que usem os.getenv() no seu código.
load_dotenv()

# --- PASSO 2: AGORA, IMPORTAR SEUS MÓDULOS ---
from utils.sftp_handler import delete_file_sftp  # noqa: E402
from utils.sftp_handler import download_file_sftp, upload_file_sftp

logger = logging.getLogger(__name__)


def run_sftp_test():
    """Roda um ciclo completo de teste: upload, download e delete."""

    # --- Configuração do Teste ---
    # Cria um arquivo de teste local
    local_filename = "teste_local.txt"
    with open(local_filename, "w") as f:
        f.write("Teste de conexão SFTP com a KYO DAY bem-sucedido!")

    # Define o caminho remoto na HostGator (dentro da pasta que você criou)
    remote_filename = "teste_remoto.txt"
    remote_path = f"public_html/kyoday_videos/uploads/{remote_filename}"

    # Define um nome para o arquivo quando for baixado de volta
    downloaded_filename = "arquivo_baixado.txt"

    logger.info("--- INICIANDO TESTE SFTP ---")

    # 1. Teste de Upload
    logger.info("\n--- PASSO 1: TESTANDO UPLOAD ---")
    if upload_file_sftp(local_filename, remote_path):
        logger.info(
            ">> SUCESSO NO UPLOAD! Verifique o arquivo no Gerenciador de Arquivos da HostGator."
        )

        # 2. Teste de Download (só executa se o upload deu certo)
        logger.info("\n--- PASSO 2: TESTANDO DOWNLOAD ---")
        if download_file_sftp(remote_path, downloaded_filename):
            logger.info(
                f">> SUCESSO NO DOWNLOAD! Verifique o arquivo '{downloaded_filename}' na pasta do seu projeto."
            )
            # Verifica o conteúdo
            with open(downloaded_filename, "r") as f:
                content = f.read()
                logger.info(f"Conteúdo do arquivo baixado: '{content}'")
        else:
            logger.error(">> FALHA NO DOWNLOAD.")

        # 3. Teste de Delete (limpeza)
        logger.info("\n--- PASSO 3: TESTANDO DELETE ---")
        if delete_file_sftp(remote_path):
            logger.info(">> SUCESSO AO DELETAR o arquivo remoto.")
        else:
            logger.error(">> FALHA AO DELETAR o arquivo remoto.")

    else:
        logger.error(">> FALHA NO UPLOAD. Os outros testes não serão executados.")

    # Limpa os arquivos de teste locais
    if os.path.exists(local_filename):
        os.remove(local_filename)
    if os.path.exists(downloaded_filename):
        os.remove(downloaded_filename)

    logger.info("\n--- TESTE SFTP FINALIZADO ---")


if __name__ == "__main__":
    run_sftp_test()
