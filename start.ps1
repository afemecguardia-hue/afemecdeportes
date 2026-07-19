$env:TNS_ADMIN = "$(if ($env:ORACLE_IC) { $env:ORACLE_IC } else { 'C:\oracle\instantclient\instantclient_23_0' })\network\admin"
Write-Host "Iniciando servidores..." -ForegroundColor Cyan
$api = Start-Process -FilePath "node" -ArgumentList "api/server.js" -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Hidden
$static = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
Write-Host "[OK] API: http://localhost:3046" -ForegroundColor Green
Write-Host "[OK] Web: http://localhost:3045" -ForegroundColor Green
Write-Host "Presioná Enter para detener los servidores"
Read-Host
$api | Stop-Process -Force
$static | Stop-Process -Force
