@echo off
title Sistema DeliveryVip - Inicializador

REM Adicionar pasta do NVS Node ao PATH global do script
set "PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%"

echo ========================================================
echo   Iniciando Sistema de Gestao DeliveryVip em 1-Clique
echo ========================================================
echo.

echo 1. Iniciando Servidor Mock DeliveryVip (Porta 3001)...
start "1. Mock DeliveryVip (3001)" cmd /k "set "PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%" && cd /d "%~dp0mock-deliveryvip" && node index.js"

timeout /t 2 /nobreak >nul

echo 2. Iniciando Backend API (Porta 3000)...
start "2. Backend API (3000)" cmd /k "set "PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%" && cd /d "%~dp0backend" && npm run dev"

timeout /t 2 /nobreak >nul

echo 3. Iniciando Polling Worker...
start "3. Polling Worker" cmd /k "set "PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%" && cd /d "%~dp0backend" && npm run worker"

timeout /t 2 /nobreak >nul

echo 4. Iniciando Frontend App Web (Porta 5173)...
start "4. Frontend Web (5173)" cmd /k "set "PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%" && cd /d "%~dp0frontend" && npm run dev -- --open"

echo.
echo ========================================================
echo   Sucesso! Acesse no seu navegador: http://localhost:5173
echo ========================================================
