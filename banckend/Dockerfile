# Usa uma imagem base oficial do Python 3.10
FROM python:3.10-slim

# Define o diretório de trabalho dentro do contêiner
WORKDIR /code

# Copia o arquivo de dependências para o contêiner
COPY ./requirements.txt /code/requirements.txt

# Instala as dependências Python
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copia todo o resto do seu projeto para a pasta /code/app dentro do contêiner
COPY ./ /code/app/

# Define o novo diretório de trabalho para a pasta da aplicação
WORKDIR /code/app

# Expõe a porta que a aplicação vai usar (Hugging Face usa 7860 por padrão)
EXPOSE 7860

# O comando que será executado quando o contêiner iniciar
# Ele inicia seu servidor FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
