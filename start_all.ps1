$env:PATH = "C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;" + $env:PATH
$root = $PSScriptRoot

Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "  Iniciando Sistema de Gestao DeliveryVip via PowerShell" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Yellow

Write-Host "`n1. Iniciando Servidor Mock DeliveryVip (Porta 3001)..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k set `"PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%`" && cd /d `"$root\mock-deliveryvip`" && node index.js"

Start-Sleep -Seconds 2

Write-Host "2. Iniciando Backend API (Porta 3000)..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k set `"PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%`" && cd /d `"$root\backend`" && npm run dev"

Start-Sleep -Seconds 2

Write-Host "3. Iniciando Polling Worker..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k set `"PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%`" && cd /d `"$root\backend`" && npm run worker"

Start-Sleep -Seconds 2

Write-Host "4. Iniciando Frontend App Web (Porta 5173)..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/k set `"PATH=C:\Users\Gabriel Gomes\AppData\Local\nvs\node\22.14.0\x64;%PATH%`" && cd /d `"$root\frontend`" && npm run dev -- --open"

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  Sucesso! Acesse no navegador: http://localhost:5173" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
