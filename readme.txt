Expo SDK 52
Usei python 3.10 Importante
comando de treinamento 
yolo detect train data=data.yaml model=yolov8n.pt epochs=20
=========================
✅ BACKEND (FastAPI)
=========================

# 1. Acessar a pasta do projeto backend
cd CountG

# 2. Criar ambiente virtual
#python 3.10
python3.10 -m venv venv310
ou
python -m venv venv

# 3. Ativar ambiente virtual
# - No Windows:
#para ambiente 3.10 especifico quando tem mais de um python instalado
venv310\Scripts\activate
ou
venv\Scripts\activate

# 4. Instalar dependências
pip install -r requirements.txt

# 5. Rodar o backend
uvicorn main:app --host localhost --port 8000

#aumenta tempo de requisicao
uvicorn main:app --host 0.0.0.0 --port 8000 --timeout-keep-alive 120


=========================
✅ FRONTEND (React Native com Expo)
=========================

# 1. Acessar a pasta do projeto frontend
cd counGFront

# 2. Instalar dependências
npm install

# 3. Iniciar o app Expo
npx expo start

# (No menu do terminal Expo, use "d" e selecione "LAN" para funcionar em rede local)


=========================
✅ NGROK (Usar se IP local não funcionar)
=========================

# 1. Acessar pasta onde está o ngrok.exe
cd C:\ngrok

# 2. Iniciar túnel para o backend
ngrok http 8000

# (Copiar a URL https gerada e usar no app, por exemplo:
# https://abc1234.ngrok.io/upload/ )


=========================
📌 EXTRA: Trocar IP no React Native
=========================

# No código (App.js ou similar):
# Substituir pelo IP loc
