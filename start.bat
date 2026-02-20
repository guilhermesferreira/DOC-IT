@echo off
echo Iniciando o Banco de Dados (Docker)...
cd backend
docker-compose up -d
echo Iniciando o Backend...
start cmd /k "npm run dev"
cd ../frontend
echo Iniciando o Frontend...
start cmd /k "npm run dev"
cd ..
echo Tudo pronto! As janelas do frontend e do backend foram abertas.
